export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';

/**
 * GET /api/submissions/grouped
 *
 * Returns submissions grouped by caregiver (name + phone), for companies that have
 * onboarding templates. Each group includes all submissions from that caregiver
 * across all forms in the template, with completion status.
 *
 * Query params: companyId, templateId, search, page, pageSize
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const templateId = searchParams.get('templateId');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    // FIX: Raised max pageSize from 100 to 1000 to support "Show All" option
    if (page < 1 || pageSize < 1 || pageSize > 1000) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // --- Company-based access control ---
    let accessibleCompanyIds: string[] | null = null;
    const user = await getAuthenticatedUser(request);
    if (user && user.role !== 'super_admin') {
      const companies = user.assigned_companies.length > 0
        ? user.assigned_companies
        : user.company_id ? [user.company_id] : [];

      if (companies.length === 0) {
        return NextResponse.json({
          groups: [],
          total: 0,
          page,
          pageSize,
          templates: [],
        });
      }
      accessibleCompanyIds = companies;
    }

    if (companyId) {
      if (accessibleCompanyIds !== null && !accessibleCompanyIds.includes(companyId)) {
        return NextResponse.json({
          groups: [],
          total: 0,
          page,
          pageSize,
          templates: [],
        });
      }
      accessibleCompanyIds = [companyId];
    }

    // --- Fetch templates for accessible companies (2-level join only) ---
    let templatesQuery = supabase
      .from('onboarding_templates')
      .select(`
        id,
        name,
        company_id,
        state,
        is_active,
        template_packets(
          id,
          form_packet_id,
          assigned_to_role,
          sort_order,
          is_required,
          form_packets:form_packet_id(
            packet_id,
            packet_name,
            master_form_id,
            import_source
          )
        )
      `)
      .eq('is_active', true);

    if (accessibleCompanyIds !== null) {
      templatesQuery = templatesQuery.in('company_id', accessibleCompanyIds);
    }

    const { data: templates, error: templatesError } = await templatesQuery;

    if (templatesError) {
      console.error('Error fetching templates:', templatesError);
      return NextResponse.json(
        { error: 'Failed to fetch templates' },
        { status: 500 }
      );
    }

    if (!templates || templates.length === 0) {
      return NextResponse.json({
        groups: [],
        total: 0,
        page,
        pageSize,
        templates: [],
      });
    }

    // Use the selected template or the first one
    const activeTemplate = templateId
      ? templates.find((t: any) => t.id === templateId) || templates[0]
      : templates[0];

    // Extract form_ids from the template's packets
    // Use 2-level join (template_packets → form_packets) then look up form_definitions separately
    const templatePackets = ((activeTemplate as any).template_packets || [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order);

    const templateFormIds: string[] = [];
    const packetFormMap: Record<string, { packet_name: string; form_name: string; sort_order: number; assigned_to_role: string }> = {};

    // Collect master_form_ids for batch lookup
    const masterFormIds: string[] = [];

    for (const tp of templatePackets) {
      const fp: any = (tp as any).form_packets;
      if (fp && fp.master_form_id) {
        masterFormIds.push(fp.master_form_id);
      }
    }

    // Batch fetch form_definitions for all master_form_ids
    // master_form_id may be a UUID (id column) or a form_id string — separate before querying
    // to avoid UUID type errors that break the entire batch
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidIds = masterFormIds.filter(mid => UUID_REGEX.test(mid));
    const stringIds = masterFormIds.filter(mid => !UUID_REGEX.test(mid));

    let formDefMap: Record<string, { form_id: string; form_name: string }> = {};
    if (masterFormIds.length > 0) {
      // Lookup UUIDs by id column
      if (uuidIds.length > 0) {
        const { data: formDefsById } = await supabase
          .from('form_definitions')
          .select('form_id, form_name, id')
          .in('id', uuidIds);

        for (const fd of (formDefsById || [])) {
          formDefMap[(fd as any).id] = { form_id: (fd as any).form_id, form_name: (fd as any).form_name };
        }
      }

      // Lookup form_id strings by form_id column
      if (stringIds.length > 0) {
        const { data: formDefsByFormId } = await supabase
          .from('form_definitions')
          .select('form_id, form_name, id')
          .in('form_id', stringIds);

        for (const fd of (formDefsByFormId || [])) {
          formDefMap[(fd as any).form_id] = { form_id: (fd as any).form_id, form_name: (fd as any).form_name };
        }
      }
    }

    for (const tp of templatePackets) {
      const fp: any = (tp as any).form_packets;
      if (fp) {
        const formDef = fp.master_form_id ? formDefMap[fp.master_form_id] : null;
        const formId = formDef?.form_id || fp.master_form_id;
        if (formId) {
          templateFormIds.push(formId);
          packetFormMap[formId] = {
            packet_name: formDef?.form_name || fp.packet_name,
            form_name: formDef?.form_name || fp.packet_name,
            sort_order: (tp as any).sort_order,
            assigned_to_role: (tp as any).assigned_to_role,
          };
        }
      }
    }

    if (templateFormIds.length === 0) {
      return NextResponse.json({
        groups: [],
        total: 0,
        page,
        pageSize,
        templates: templates.map((t: any) => ({ id: t.id, name: t.name, company_id: t.company_id })),
      });
    }

    // --- Fetch all submissions for these form IDs ---
    // NOTE: Removed form_definitions!inner join — it was silently filtering out
    // submissions when the FK relationship failed. We use packetFormMap for names instead.
    let subsQuery = supabase
      .from('form_submissions')
      .select(`
        submission_id,
        form_id,
        applicant_id,
        status,
        submitted_at,
        created_at,
        updated_at,
        applicants:applicant_id(id, full_name, phone, email)
      `)
      .in('form_id', templateFormIds)
      .order('updated_at', { ascending: false });

    const { data: rawSubmissions, error: subsError } = await subsQuery;
    const submissions: any[] = rawSubmissions || [];


    if (subsError) {
      console.error('Error fetching submissions:', subsError);
      return NextResponse.json(
        { error: 'Failed to fetch submissions' },
        { status: 500 }
      );
    }

    // --- Group submissions by caregiver (name + phone) ---
    const caregiverMap = new Map<string, {
      name: string;
      phone: string;
      email: string | null;
      submissions: any[];
      lastUpdated: string;
    }>();

    for (const sub of submissions) {
      const applicant: any = sub.applicants;
      const name = (applicant?.full_name || '').trim();
      const phone = (applicant?.phone || '').trim();

      if (!name && !phone) continue; // Skip if no identifying info

      // Create grouping key: lowercase name + normalized phone
      const key = `${name.toLowerCase()}|||${phone.replace(/\D/g, '')}`;

      if (!caregiverMap.has(key)) {
        caregiverMap.set(key, {
          name: name || 'Unknown',
          phone: phone || '',
          email: applicant?.email || null,
          submissions: [],
          lastUpdated: sub.updated_at || sub.created_at,
        });
      }

      const group = caregiverMap.get(key)!;
      // Use packetFormMap for form names instead of form_definitions join
      const packetInfo = packetFormMap[sub.form_id];
      group.submissions.push({
        submission_id: sub.submission_id,
        form_id: sub.form_id,
        form_name: packetInfo?.form_name || 'Unknown Form',
        status: sub.status,
        submitted_at: sub.submitted_at,
        created_at: sub.created_at,
        updated_at: sub.updated_at,
      });

      // Track latest update
      const subDate = sub.updated_at || sub.created_at;
      if (subDate > group.lastUpdated) {
        group.lastUpdated = subDate;
      }
    }

    // --- Apply search filter ---
    let groups = Array.from(caregiverMap.values());

    if (search) {
      const searchLower = search.toLowerCase();
      groups = groups.filter(g =>
        g.name.toLowerCase().includes(searchLower) ||
        g.phone.includes(search)
      );
    }

    // --- Sort by last updated ---
    groups.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());

    // --- Build completion status for each group ---
    const totalForms = templateFormIds.length;
    const enrichedGroups = groups.map(g => {
      const formStatuses: Record<string, { submission_id: string; status: string; form_name: string; sort_order: number }> = {};

      for (const formId of templateFormIds) {
        const matchingSub = g.submissions.find((s: any) => s.form_id === formId);
        const packetInfo = packetFormMap[formId];
        formStatuses[formId] = {
          submission_id: matchingSub?.submission_id || '',
          status: matchingSub?.status || 'pending',
          form_name: packetInfo?.form_name || 'Unknown',
          sort_order: packetInfo?.sort_order ?? 99,
        };
      }

      const completedCount = Object.values(formStatuses).filter(
        fs => fs.status === 'submitted' || fs.status === 'finalized' || fs.status === 'approved'
      ).length;


      return {
        name: g.name,
        phone: g.phone,
        email: g.email,
        lastUpdated: g.lastUpdated,
        completedCount,
        totalForms,
        formStatuses,
        // Include the submission IDs for navigation
        submissionIds: g.submissions.map((s: any) => s.submission_id),
      };
    });

    // --- Paginate ---
    const total = enrichedGroups.length;
    const offset = (page - 1) * pageSize;
    const paginatedGroups = enrichedGroups.slice(offset, offset + pageSize);

    return NextResponse.json({
      groups: paginatedGroups,
      total,
      page,
      pageSize,
      templates: templates.map((t: any) => ({ id: t.id, name: t.name, company_id: t.company_id })),
      activeTemplateId: activeTemplate.id,
      templateFormIds,
    });
  } catch (error) {
    console.error('Grouped submissions API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
