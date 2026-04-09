export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/submissions/unified
 *
 * Returns all submissions + form definitions for a caregiver across template forms.
 * Used by the unified caregiver detail view to show all form parts in one page.
 *
 * Query params: name, phone, templateId
 *
 * Returns: Array of { submission, formDefinition, applicant } objects,
 * sorted by the template's sort_order.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const phone = searchParams.get('phone');
    const templateId = searchParams.get('templateId');

    if (!name || !phone) {
      return NextResponse.json(
        { error: 'name and phone are required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // --- Fetch template with packets (2-level join, no triple nesting) ---
    let templateQuery = supabase
      .from('onboarding_templates')
      .select(`
        id,
        name,
        company_id,
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
      `);

    if (templateId) {
      templateQuery = templateQuery.eq('id', templateId);
    } else {
      templateQuery = templateQuery.eq('is_active', true);
    }

    const { data: templates, error: tplError } = await templateQuery;

    if (tplError || !templates || templates.length === 0) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    const template = templateId
      ? templates[0]
      : templates[0];

    // Build sorted list of form IDs from template packets
    const sortedPackets = ((template as any).template_packets || [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order);

    // Collect master_form_ids for batch form_definitions lookup
    const masterFormIdsForLookup: string[] = [];
    for (const tp of sortedPackets) {
      const fp: any = (tp as any).form_packets;
      if (fp && fp.master_form_id) {
        masterFormIdsForLookup.push(fp.master_form_id);
      }
    }

    // Batch fetch form_definitions
    // master_form_id may be a UUID (id column) or a form_id string — separate before querying
    // to avoid UUID type errors that break the entire batch
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidIds = masterFormIdsForLookup.filter(mid => UUID_REGEX.test(mid));
    const stringIds = masterFormIdsForLookup.filter(mid => !UUID_REGEX.test(mid));

    let formDefLookup: Record<string, { form_id: string; form_name: string }> = {};
    if (masterFormIdsForLookup.length > 0) {
      // Lookup UUIDs by id column
      if (uuidIds.length > 0) {
        const { data: formDefsById } = await supabase
          .from('form_definitions')
          .select('form_id, form_name, id')
          .in('id', uuidIds);

        for (const fd of (formDefsById || [])) {
          formDefLookup[(fd as any).id] = { form_id: (fd as any).form_id, form_name: (fd as any).form_name };
        }
      }

      // Lookup form_id strings by form_id column
      if (stringIds.length > 0) {
        const { data: formDefsByFormId } = await supabase
          .from('form_definitions')
          .select('form_id, form_name, id')
          .in('form_id', stringIds);

        for (const fd of (formDefsByFormId || [])) {
          formDefLookup[(fd as any).form_id] = { form_id: (fd as any).form_id, form_name: (fd as any).form_name };
        }
      }
    }

    const formEntries: Array<{
      formId: string;
      formName: string;
      sortOrder: number;
      assignedRole: string;
      packetName: string;
    }> = [];

    for (const tp of sortedPackets) {
      const fp: any = (tp as any).form_packets;
      if (fp) {
        const formDef = fp.master_form_id ? formDefLookup[fp.master_form_id] : null;
        const formId = formDef?.form_id || fp.master_form_id;
        formEntries.push({
          formId,
          formName: formDef?.form_name || fp.packet_name,
          sortOrder: (tp as any).sort_order,
          assignedRole: (tp as any).assigned_to_role,
          packetName: fp.packet_name,
        });
      }
    }

    // --- Find matching applicant(s) by name + phone ---
    const { data: applicants } = await supabase
      .from('applicants')
      .select('id, full_name, phone, email')
      .ilike('full_name', name)
      .ilike('phone', `%${phone.replace(/\D/g, '').slice(-10)}%`);

    const applicantIds = applicants?.map(a => a.id) || [];
    const applicant = applicants?.[0] || { full_name: name, phone, email: null as string | null };

    // --- Fetch submissions for these applicants across template forms ---
    const formIds = formEntries.map(fe => fe.formId);

    // Batch fetch all submissions for these form_ids (no inner join on form_definitions)
    const { data: allSubs } = await supabase
      .from('form_submissions')
      .select(`
        *,
        applicants:applicant_id(id, full_name, phone, email)
      `)
      .in('form_id', formIds)
      .order('updated_at', { ascending: false });

    // Index submissions by form_id, filtering to matching applicants
    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
    const subsByFormId: Record<string, any> = {};
    for (const sub of (allSubs || [])) {
      const subApplicant: any = sub.applicants;
      const subName = (subApplicant?.full_name || '').trim().toLowerCase();
      const subPhone = (subApplicant?.phone || '').replace(/\D/g, '');

      // Match by name (case-insensitive) and phone (last 10 digits)
      if (
        subName === name.toLowerCase() &&
        subPhone.includes(normalizedPhone)
      ) {
        // Keep only the most recent submission per form_id
        if (!subsByFormId[sub.form_id]) {
          subsByFormId[sub.form_id] = sub;
        }
      }
    }

    const parts: Array<{
      formId: string;
      formName: string;
      sortOrder: number;
      assignedRole: string;
      submission: any | null;
      formDefinition: any | null;
    }> = [];

    for (const fe of formEntries) {
      // Fetch form definition
      const { data: formDef } = await supabase
        .from('form_definitions')
        .select('*')
        .eq('form_id', fe.formId)
        .single();

      const submission = subsByFormId[fe.formId] || null;

      parts.push({
        formId: fe.formId,
        formName: fe.formName,
        sortOrder: fe.sortOrder,
        assignedRole: fe.assignedRole,
        submission,
        formDefinition: formDef,
      });
    }

    return NextResponse.json({
      template: {
        id: template.id,
        name: template.name,
      },
      applicant,
      parts,
    });
  } catch (error) {
    console.error('Unified submissions API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
