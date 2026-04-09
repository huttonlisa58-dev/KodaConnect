export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/onboarding/templates/[id]
 * Returns a single template with full packet details.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const templateId = params.id;

    const { data: template, error } = await supabase
      .from('onboarding_templates')
      .select(`
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
      `)
      .eq('id', templateId)
      .single();

    if (error || !template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    const t: any = template;
    return NextResponse.json({
      id: t.id,
      company_id: t.company_id,
      company_name: t.companies?.name || '',
      name: t.name,
      description: t.description,
      state: t.state,
      packet_count: t.template_packets?.length || 0,
      is_active: t.is_active,
      created_at: t.created_at,
      updated_at: t.updated_at,
      packets: (t.template_packets || []).map((tp: any) => ({
        id: tp.id,
        form_packet_id: tp.form_packet_id,
        packet_name: tp.form_packets?.packet_name || '',
        render_mode: tp.form_packets?.import_source === 'json_package' ? 'generated' : 'replica',
        assigned_to_role: tp.assigned_to_role,
        sort_order: tp.sort_order,
        is_required: tp.is_required,
      })),
    });
  } catch (error) {
    console.error('GET /api/onboarding/templates/[id] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/onboarding/templates/[id]
 * Updates a template's metadata and packets.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const templateId = params.id;

    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid JSON body', details: String(e) },
        { status: 400 }
      );
    }

    const { company_id, name, description, state, packets } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Template name is required' },
        { status: 400 }
      );
    }

    // Update template metadata
    const { error: updateError } = await supabase
      .from('onboarding_templates')
      .update({
        company_id,
        name: name.trim(),
        description: description?.trim() || null,
        state: state || 'NY',
        updated_at: new Date().toISOString(),
      })
      .eq('id', templateId);

    if (updateError) {
      console.error('Error updating template:', updateError);
      return NextResponse.json(
        { error: 'Failed to update template', details: updateError.message },
        { status: 500 }
      );
    }

    // Replace template packets: delete existing, insert new
    if (Array.isArray(packets)) {
      // Delete existing packets (ignore errors if none exist)
      const { error: deleteError } = await supabase
        .from('template_packets')
        .delete()
        .eq('template_id', templateId);

      if (deleteError) {
        console.error('Error deleting old packets:', deleteError);
        // Don't fail — the template may have had no packets
      }

      // Insert new packets
      if (packets.length > 0) {
        const packetsToInsert = packets.map((p: any) => ({
          template_id: templateId,
          form_packet_id: p.form_packet_id,
          assigned_to_role: p.assigned_to_role || 'applicant',
          sort_order: p.sort_order ?? 0,
          is_required: p.is_required ?? false,
        }));

        const { error: insertError } = await supabase
          .from('template_packets')
          .insert(packetsToInsert);

        if (insertError) {
          console.error('Error inserting new packets:', insertError);
          return NextResponse.json(
            { error: 'Template updated but failed to save packets', details: insertError.message },
            { status: 500 }
          );
        }
      }
    }

    // Return updated template with packets
    const { data: updatedTemplate } = await supabase
      .from('onboarding_templates')
      .select(`
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
      `)
      .eq('id', templateId)
      .single();

    const t: any = updatedTemplate;
    return NextResponse.json({
      id: t.id,
      company_id: t.company_id,
      company_name: t.companies?.name || '',
      name: t.name,
      description: t.description,
      state: t.state,
      packet_count: t.template_packets?.length || 0,
      is_active: t.is_active,
      created_at: t.created_at,
      updated_at: t.updated_at,
      packets: (t.template_packets || []).map((tp: any) => ({
        id: tp.id,
        form_packet_id: tp.form_packet_id,
        packet_name: tp.form_packets?.packet_name || '',
        render_mode: tp.form_packets?.import_source === 'json_package' ? 'generated' : 'replica',
        assigned_to_role: tp.assigned_to_role,
        sort_order: tp.sort_order,
        is_required: tp.is_required,
      })),
    });
  } catch (error) {
    console.error('PUT /api/onboarding/templates/[id] error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/onboarding/templates/[id]
 * Partial update — used for activate/deactivate.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const templateId = params.id;
    const body = await request.json();

    const { error } = await supabase
      .from('onboarding_templates')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', templateId);

    if (error) {
      console.error('Error patching template:', error);
      return NextResponse.json(
        { error: 'Failed to update template' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/onboarding/templates/[id] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
