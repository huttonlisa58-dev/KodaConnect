import { createServerSupabaseClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Types for request/response bodies
interface CreateTemplateRequest {
  company_id: string;
  name: string;
  description?: string;
  state?: string;
  packets: {
    form_packet_id: string;
    assigned_to_role: string;
    sort_order: number;
    is_required: boolean;
  }[];
}

interface TemplatePacketResponse {
  id: string;
  form_packet_id: string;
  packet_name: string;
  render_mode: string;
  assigned_to_role: string;
  sort_order: number;
  is_required: boolean;
}

interface TemplateResponse {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  description?: string;
  state?: string;
  packet_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TemplateDetailResponse extends TemplateResponse {
  packets: TemplatePacketResponse[];
}

/**
 * Authenticate via office-style headers (x-office-user-id / x-user-email)
 * Falls back to Supabase Auth if no office headers present.
 */
async function authenticateRequest(request: NextRequest, supabase: any) {
  // Try office auth headers first (different pages use different header names)
  const officeUserId = request.headers.get('x-office-user-id') || request.headers.get('x-user-id');
  const userEmail = request.headers.get('x-user-email');

  if (officeUserId || userEmail) {
    // Look up office user
    let query = supabase.from('office_users').select('id, email, role, name');
    if (officeUserId) {
      query = query.eq('id', officeUserId);
    } else if (userEmail) {
      query = query.eq('email', userEmail);
    }
    const { data: officeUser } = await query.single();
    if (officeUser) {
      return { userId: officeUser.id, role: officeUser.role, email: officeUser.email };
    }
  }

  // Fall back to Supabase Auth
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: officeUser } = await supabase
      .from('office_users')
      .select('id, role, email')
      .eq('id', user.id)
      .single();
    return { userId: user.id, role: officeUser?.role || 'viewer', email: user.email };
  }

  return null;
}

/**
 * GET /api/onboarding/templates
 *
 * List all onboarding templates.
 * Query params:
 *   - company_id: Optional, filter by specific company
 *   - is_active: Optional, default true. Filter by active status
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    const auth = await authenticateRequest(request, supabase);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('company_id');
    const isActiveParam = searchParams.get('is_active');
    const isActive = isActiveParam !== 'false'; // default to true

    // Build query with joins — for office users, show all templates (no company filter)
    let query = supabase
      .from('onboarding_templates')
      .select(
        `
        id,
        company_id,
        name,
        description,
        state,
        is_active,
        created_at,
        updated_at,
        companies:company_id(name),
        template_packets(
          id,
          form_packet_id,
          assigned_to_role,
          sort_order,
          is_required,
          form_packets:form_packet_id(packet_name, import_source)
        )
        `
      )
      .eq('is_active', isActive)
      .order('name', { ascending: true });

    // Optional: filter by specific company
    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data: templates, error: templatesError } = await query;

    if (templatesError) {
      console.error('Error fetching templates:', templatesError);
      return NextResponse.json(
        { error: 'Failed to fetch templates' },
        { status: 500 }
      );
    }

    // Format response — include full packet details so edit modal works
    const formattedTemplates = (templates || []).map(
      (template: any) => ({
        id: template.id,
        company_id: template.company_id,
        company_name: template.companies?.name || '',
        name: template.name,
        description: template.description,
        state: template.state,
        packet_count: template.template_packets?.length || 0,
        is_active: template.is_active,
        created_at: template.created_at,
        updated_at: template.updated_at,
        packets: (template.template_packets || []).map((tp: any) => ({
          id: tp.id,
          form_packet_id: tp.form_packet_id,
          packet_name: tp.form_packets?.packet_name || '',
          render_mode: tp.form_packets?.import_source === 'json_package' ? 'generated' : 'replica',
          assigned_to_role: tp.assigned_to_role,
          sort_order: tp.sort_order,
          is_required: tp.is_required,
        })),
      })
    );

    return NextResponse.json(formattedTemplates);
  } catch (error) {
    console.error('GET /api/onboarding/templates error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/onboarding/templates
 *
 * Create a new onboarding template with associated packets.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    const auth = await authenticateRequest(request, supabase);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is admin or super_admin
    if (!['admin', 'super_admin'].includes(auth.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Admin role required.' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = (await request.json()) as CreateTemplateRequest;
    const { company_id, name, description, state, packets } = body;

    // Validate required fields
    if (!company_id || !name) {
      return NextResponse.json(
        { error: 'company_id and name are required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(packets)) {
      return NextResponse.json(
        { error: 'packets must be an array' },
        { status: 400 }
      );
    }

    // Insert template
    const { data: newTemplate, error: templateError } = await supabase
      .from('onboarding_templates')
      .insert({
        company_id,
        name,
        description: description || null,
        state: state || null,
        is_active: true,
      })
      .select()
      .single();

    if (templateError || !newTemplate) {
      console.error('Error creating template:', templateError);
      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      );
    }

    // Insert template packets
    if (packets.length > 0) {
      const packetsToInsert = packets.map((packet) => ({
        template_id: newTemplate.id,
        form_packet_id: packet.form_packet_id,
        assigned_to_role: packet.assigned_to_role,
        sort_order: packet.sort_order,
        is_required: packet.is_required,
      }));

      const { error: packetsError } = await supabase
        .from('template_packets')
        .insert(packetsToInsert);

      if (packetsError) {
        console.error('Error creating template packets:', packetsError);
        return NextResponse.json(
          { error: 'Template created but failed to add packets' },
          { status: 500 }
        );
      }
    }

    // Fetch the complete template with packets for response
    const { data: completeTemplate } = await supabase
      .from('onboarding_templates')
      .select(
        `
        id,
        company_id,
        name,
        description,
        state,
        is_active,
        created_at,
        updated_at,
        companies:company_id(name),
        template_packets(
          id,
          form_packet_id,
          assigned_to_role,
          sort_order,
          is_required,
          form_packets:form_packet_id(packet_name, import_source)
        )
        `
      )
      .eq('id', newTemplate.id)
      .single();

    const templateData = completeTemplate as any;
    const response: TemplateDetailResponse = {
      id: templateData.id,
      company_id: templateData.company_id,
      company_name: templateData.companies?.name || '',
      name: templateData.name,
      description: templateData.description,
      state: templateData.state,
      packet_count: templateData.template_packets?.length || 0,
      is_active: templateData.is_active,
      created_at: templateData.created_at,
      updated_at: templateData.updated_at,
      packets: (templateData.template_packets || []).map((tp: any) => ({
        id: tp.id,
        form_packet_id: tp.form_packet_id,
        packet_name: tp.form_packets?.packet_name || '',
        render_mode: tp.form_packets?.import_source === 'json_package' ? 'generated' : 'replica',
        assigned_to_role: tp.assigned_to_role,
        sort_order: tp.sort_order,
        is_required: tp.is_required,
      })),
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('POST /api/onboarding/templates error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
