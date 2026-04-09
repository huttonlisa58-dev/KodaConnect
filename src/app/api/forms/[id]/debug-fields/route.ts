import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/forms/[id]/debug-fields?submission_id=xxx
 *
 * Diagnostic endpoint: shows the field_position_map stored in form_packets,
 * the submission form_data, and which fields match/don't match.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formId } = await params;
    const submissionId = request.nextUrl.searchParams.get('submission_id');

    const supabase = createServerSupabaseClient();

    // 1. Load form definition
    const { data: formDef, error: formError } = await supabase
      .from('form_definitions')
      .select('form_id, form_name, metadata, sections')
      .eq('form_id', formId)
      .single();

    if (formError || !formDef) {
      return NextResponse.json({ error: 'Form not found', details: formError?.message }, { status: 404 });
    }

    // 2. Load packet (field_position_map)
    const { data: packet, error: packetError } = await supabase
      .from('form_packets')
      .select('packet_id, field_position_map, render_mode, sub_forms')
      .eq('master_form_id', formId)
      .maybeSingle();

    // 3. Optionally load a submission
    let submissionData: Record<string, any> | null = null;
    if (submissionId) {
      const { data: sub } = await supabase
        .from('form_submissions')
        .select('form_data')
        .eq('submission_id', submissionId)
        .single();
      submissionData = sub?.form_data || null;
    }

    // 4. Analyze sections
    const allSections = formDef.sections || [];
    const sectionSummary = allSections.map((s: any) => ({
      section_id: s.section_id,
      title: s.title,
      pdf_mode: s.pdf_mode || 'not set',
      field_count: s.fields?.length || 0,
      field_ids: (s.fields || []).map((f: any) => f.field_id),
    }));

    const replicaSections = allSections.filter((s: any) => s.pdf_mode === 'replica');
    const generatedSections = allSections.filter((s: any) => !s.pdf_mode || s.pdf_mode === 'generated');

    // 5. Analyze field_position_map
    const fieldPositionMap = packet?.field_position_map || {};
    const positionMapKeys = Object.keys(fieldPositionMap);
    const positionMapSummary = Object.entries(fieldPositionMap).map(([fieldId, entry]: [string, any]) => ({
      field_id: fieldId,
      label: entry.label,
      type: entry.type,
      position_count: entry.positions?.length || 0,
      positions: entry.positions?.map((p: any) => ({
        page: p.page,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        font_size: p.font_size,
      })),
      has_option_positions: !!entry.option_positions,
      option_keys: entry.option_positions ? Object.keys(entry.option_positions) : [],
    }));

    // 6. Get all field IDs from replica sections
    const replicaFieldIds: string[] = [];
    for (const section of replicaSections) {
      for (const field of section.fields || []) {
        replicaFieldIds.push(field.field_id);
      }
    }

    // 7. Cross-reference: which replica fields have positions?
    const fieldMatching = replicaFieldIds.map((fieldId: string) => ({
      field_id: fieldId,
      has_position: positionMapKeys.includes(fieldId),
      has_submission_value: submissionData ? (fieldId in submissionData && submissionData[fieldId] !== '' && submissionData[fieldId] !== null && submissionData[fieldId] !== undefined) : null,
      submission_value: submissionData ? submissionData[fieldId] : undefined,
    }));

    // 8. Fields in position map but NOT in any replica section
    const orphanedPositions = positionMapKeys.filter(
      (key) => !replicaFieldIds.includes(key)
    );

    // 9. Submission fields that match position map
    let submissionMatching: any[] = [];
    if (submissionData) {
      submissionMatching = positionMapKeys.map((fieldId) => ({
        field_id: fieldId,
        position_label: (fieldPositionMap as any)[fieldId]?.label,
        submission_value: submissionData[fieldId],
        has_value: fieldId in submissionData && submissionData[fieldId] !== '' && submissionData[fieldId] !== null,
      }));
    }

    return NextResponse.json({
      form_id: formId,
      form_name: formDef.form_name,
      render_mode: formDef.metadata?.render_mode || 'not set',
      packet_render_mode: packet?.render_mode || 'no packet',

      sections: {
        total: allSections.length,
        generated: generatedSections.length,
        replica: replicaSections.length,
        details: sectionSummary,
      },

      field_position_map: {
        total_fields: positionMapKeys.length,
        fields: positionMapSummary,
      },

      replica_field_matching: {
        total_replica_fields: replicaFieldIds.length,
        fields_with_positions: fieldMatching.filter((f: any) => f.has_position).length,
        fields_without_positions: fieldMatching.filter((f: any) => !f.has_position).length,
        details: fieldMatching,
      },

      orphaned_positions: {
        count: orphanedPositions.length,
        field_ids: orphanedPositions,
      },

      ...(submissionData && {
        submission_matching: {
          total_submission_fields: Object.keys(submissionData).length,
          position_map_fields_with_values: submissionMatching.filter((f: any) => f.has_value).length,
          position_map_fields_without_values: submissionMatching.filter((f: any) => !f.has_value).length,
          details: submissionMatching,
        },
      }),
    });
  } catch (error) {
    console.error('Debug fields error:', error);
    return NextResponse.json(
      { error: 'Debug failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
