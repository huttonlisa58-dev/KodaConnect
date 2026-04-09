import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { FormDefinition, FormSubmissionData, validateForm } from '@/lib/form-engine';

export const dynamic = 'force-dynamic';

/**
 * POST /api/forms/[id]/submit
 * Submit form data — supports CHW fields, participant name extraction,
 * and e-signature metadata capture.
 *
 * IMPORTANT: When updating an existing submission, this endpoint MERGES the
 * incoming form_data with the existing record so that staff-entered fields
 * (e.g. dates, signatures, checkbox grids filled in via the office portal)
 * are preserved when the client submits their portion.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formId } = await params;
    const body = await request.json();
    const { submission_data, applicant_id, chw_name, chw_phone, status, submission_id: existingSubmissionId, current_step } = body;

    if (!submission_data || !applicant_id) {
      return NextResponse.json(
        { error: 'submission_data and applicant_id are required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch form definition
    const { data: formDef, error: formError } = await supabase
      .from('form_definitions')
      .select('*')
      .eq('form_id', formId)
      .single();

    if (formError || !formDef) {
      return NextResponse.json(
        { error: 'Form definition not found' },
        { status: 404 }
      );
    }

    const definition: FormDefinition = formDef;

    // Validate form (skip validation for drafts)
    if (status !== 'draft') {
      const errors = validateForm(definition, submission_data);
      if (errors.length > 0) {
        return NextResponse.json(
          { error: 'Form validation failed', details: errors },
          { status: 400 }
        );
      }
    }

    // ── Extract participant name and ID from form data ──
    let participantName: string | null = null;
    let participantId: string | null = null;
    const formPackage = formDef.form_package || formDef.metadata?.form_package;
    if (formPackage?.participant_name_field) {
      const nameFieldId = formPackage.participant_name_field;
      participantName = submission_data[nameFieldId] || null;
    }
    if (formPackage?.participant_id_field) {
      const idFieldId = formPackage.participant_id_field;
      participantId = submission_data[idFieldId] || null;
    }

    // ── Capture e-signature metadata ──
    const clientIp = request.headers.get('x-forwarded-for')
      || request.headers.get('x-real-ip')
      || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const now = new Date().toISOString();

    // Check if submission contains any signature fields
    const hasSignature = Object.keys(submission_data).some(key =>
      key.includes('signature') || key.includes('esign')
    );

    const signatureMetadata = hasSignature ? {
      timestamp: now,
      ip_address: typeof clientIp === 'string' ? clientIp.split(',')[0].trim() : clientIp,
      user_agent: userAgent,
    } : null;

    // Embed draft metadata (current_step) in form_data for draft saves
    const formDataToStore = status === 'draft' && current_step !== undefined
      ? { ...submission_data, _draft_metadata: { current_step } }
      : submission_data;

    // ── Upsert: UPDATE existing draft (save or finalize) or INSERT new ──
    if (existingSubmissionId) {
      // ── MERGE form_data with existing record ──
      // This preserves staff-entered fields (dates, signatures, checkbox grids)
      // that the client can't edit but that are stored on the same submission.
      const { data: existingSubmission, error: fetchError } = await supabase
        .from('form_submissions')
        .select('form_data')
        .eq('submission_id', existingSubmissionId)
        .single();

      if (fetchError || !existingSubmission) {
        console.error('Failed to fetch existing submission for merge:', fetchError);
        return NextResponse.json(
          { error: 'Submission not found' },
          { status: 404 }
        );
      }

      // Merge: existing staff data first, then overlay client data
      const mergedFormData = {
        ...(existingSubmission.form_data || {}),
        ...formDataToStore,
      };

      const isFinalSubmit = status !== 'draft';
      const updateData: Record<string, unknown> = {
        form_data: mergedFormData,
        updated_at: now,
      };
      if (participantName) updateData.participant_name = participantName;
      if (participantId) (updateData as any).participant_id = participantId;
      if (chw_name) updateData.chw_name = chw_name;
      if (chw_phone) updateData.chw_phone = chw_phone;
      if (signatureMetadata) updateData.signature_metadata = signatureMetadata;

      // If finalizing a draft → update status and set submitted_at
      if (isFinalSubmit) {
        updateData.status = 'submitted';
        updateData.submitted_at = now;
      }

      const { data: updated, error: updateError } = await supabase
        .from('form_submissions')
        .update(updateData)
        .eq('submission_id', existingSubmissionId)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to update submission:', updateError);
        return NextResponse.json(
          { error: isFinalSubmit ? 'Failed to submit form' : 'Failed to update draft' },
          { status: 500 }
        );
      }

      // Log audit event
      await supabase.from('audit_logs').insert([
        {
          event_type: isFinalSubmit ? 'form_submitted' : 'form_draft_saved',
          form_id: formId,
          submission_id: existingSubmissionId,
          applicant_id,
          ip_address: clientIp,
          created_at: now,
        },
      ]);

      return NextResponse.json(
        { submission_id: existingSubmissionId, submission: updated },
        { status: 200 }
      );
    }

    // Create new submission record
    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const insertData: Record<string, unknown> = {
      submission_id: submissionId,
      form_id: formId,
      applicant_id,
      form_data: formDataToStore,
      status: status || 'submitted',
      submitted_at: status === 'draft' ? null : now,
      created_at: now,
      updated_at: now,
    };

    // Add CHW fields if provided
    if (chw_name) insertData.chw_name = chw_name;
    if (chw_phone) insertData.chw_phone = chw_phone;

    // Add participant name and ID if extracted
    if (participantName) insertData.participant_name = participantName;
    if (participantId) (insertData as any).participant_id = participantId;

    // Add signature metadata if captured
    if (signatureMetadata) insertData.signature_metadata = signatureMetadata;

    const { data: submission, error: submitError } = await supabase
      .from('form_submissions')
      .insert([insertData])
      .select()
      .single();

    if (submitError) {
      console.error('Failed to create submission:', submitError);
      return NextResponse.json(
        { error: 'Failed to submit form' },
        { status: 500 }
      );
    }

    // Log audit event
    await supabase.from('audit_logs').insert([
      {
        event_type: status === 'draft' ? 'form_draft_saved' : 'form_submitted',
        form_id: formId,
        submission_id: submissionId,
        applicant_id,
        ip_address: clientIp,
        created_at: now,
      },
    ]);

    return NextResponse.json(
      { submission_id: submissionId, submission },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/forms/[id]/submit error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
