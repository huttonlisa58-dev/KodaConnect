export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getAuthenticatedUser } from '@/lib/api-auth';

/**
 * GET /api/submissions/:submissionId
 * Fetch a single submission by ID
 * Returns { submission, formDefinition, applicant } to match expected response format
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  try {
    const { submissionId } = params;
    const supabase = createServerSupabaseClient();

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Fetch submission with joined applicant data
    const { data: submission, error } = await supabase
      .from('form_submissions')
      .select(`
        *,
        applicants:applicant_id(id, full_name, phone, email),
        form_definitions:form_id(form_id, form_name, company_id)
      `)
      .eq('submission_id', submissionId)
      .single();

    if (error || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Company access check (non-super_admin)
    if (user.role !== 'super_admin') {
      const companies = user.assigned_companies.length > 0
        ? user.assigned_companies
        : user.company_id ? [user.company_id] : [];

      const formCompanyId = (submission.form_definitions as any)?.company_id;
      if (formCompanyId && !companies.includes(formCompanyId)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Extract applicant info from join
    const applicantJoin = submission.applicants as any;
    const applicant = {
      full_name: applicantJoin?.full_name || 'Unknown',
      phone: applicantJoin?.phone || undefined,
      email: applicantJoin?.email || undefined,
    };

    // Fetch full form definition (with sections & fields)
    let formDefinition = null;
    try {
      let { data: formDef, error: formErr } = await supabase
        .from('form_definitions')
        .select('*')
        .eq('form_id', submission.form_id)
        .single();

      if (formErr || !formDef) {
        const fallback = await supabase
          .from('form_definitions')
          .select('*')
          .eq('id', submission.form_id)
          .single();
        formDef = fallback.data;
      }

      if (formDef) {
        formDefinition = {
          form_id: formDef.form_id || formDef.id,
          form_name: formDef.form_name || formDef.name || 'Unnamed Form',
          version: formDef.version || '1.0',
          company_id: formDef.company_id,
          doc_number: formDef.doc_number || undefined,
          description: formDef.description || undefined,
          status: formDef.status || 'published',
          sections: formDef.sections || [],
          metadata: formDef.metadata || {},
        };
      }
    } catch (formFetchErr) {
      console.error('Failed to fetch form definition:', formFetchErr);
    }

    return NextResponse.json({ submission, formDefinition, applicant });
  } catch (error) {
    console.error('Error fetching submission:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/submissions/:submissionId
 * Delete a single submission (super_admin only from frontend, but API allows all authenticated users)
 * Also cleans up related document_uploads
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  try {
    const { submissionId } = params;
    const supabase = createServerSupabaseClient();

    // Require authentication
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only super_admin can delete submissions
    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can delete submissions' }, { status: 403 });
    }

    // Verify submission exists and check company access
    const { data: submission, error: fetchError } = await supabase
      .from('form_submissions')
      .select(`
        submission_id,
        form_definitions!inner(form_id, form_name, company_id)
      `)
      .eq('submission_id', submissionId)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Delete all related records first (foreign key constraints with RESTRICT)
    // These tables reference form_submissions(submission_id) without CASCADE
    const relatedTables = [
      'document_uploads',
      'consent_records',
      'submission_edit_history',
      'signature_metadata',
    ];

    for (const table of relatedTables) {
      const { error: relError } = await supabase
        .from(table)
        .delete()
        .eq('submission_id', submissionId);

      if (relError) {
        console.error(`Error deleting from ${table}:`, relError);
        // Continue — table may not have rows for this submission, or table may not exist yet
      }
    }

    // Delete the submission
    const { error: deleteError } = await supabase
      .from('form_submissions')
      .delete()
      .eq('submission_id', submissionId);

    if (deleteError) {
      console.error('Error deleting submission:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete submission' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, deleted: submissionId });
  } catch (error) {
    console.error('Error deleting submission:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/submissions/:submissionId
 * Update submission form_data (inline edit)
 * On first edit, snapshots original_form_data to preserve initial submission state
 * Records field-level changes in submission_edit_history for audit trail
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  try {
    const { submissionId } = params;
    const body = await request.json();
    const { form_data, edited_by } = body;

    if (!form_data || typeof form_data !== 'object') {
      return NextResponse.json(
        { error: 'form_data is required and must be an object' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Require authentication
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Extract request metadata for audit
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || request.headers.get('x-real-ip')
      || request.headers.get('cf-connecting-ip')
      || '0.0.0.0';
    const userAgent = request.headers.get('user-agent') || 'Unknown';

    // 1. Fetch the submission
    const { data: submission, error: fetchError } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('submission_id', submissionId)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // 2. Fetch form definition for field labels
    let formDef: any = null;
    {
      const { data: fd } = await supabase
        .from('form_definitions')
        .select('*')
        .eq('form_id', submission.form_id)
        .single();
      if (!fd) {
        const fallback = await supabase
          .from('form_definitions')
          .select('*')
          .eq('id', submission.form_id)
          .single();
        formDef = fallback.data;
      } else {
        formDef = fd;
      }
    }

    // Build a field_id → label lookup from the form definition
    const fieldLabels: Record<string, string> = {};
    if (formDef?.sections) {
      for (const section of formDef.sections) {
        for (const field of (section.fields || [])) {
          fieldLabels[field.field_id] = field.label || field.field_id;
        }
      }
    }

    // 3. Identify field-level changes
    const previousData = submission.form_data || {};
    const changes: Array<{
      field_id: string;
      field_label: string;
      old_value: any;
      new_value: any;
    }> = [];

    for (const [fieldKey, newValue] of Object.entries(form_data)) {
      // Skip signature security metadata fields — immutable audit data
      if (fieldKey.startsWith('_signature_metadata_')) continue;

      const oldValue = previousData[fieldKey];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field_id: fieldKey,
          field_label: fieldLabels[fieldKey] || fieldKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          old_value: oldValue ?? null,
          new_value: newValue,
        });
      }
    }

    // 4. Merge form data (spread old, overlay new)
    const mergedFormData = {
      ...submission.form_data,
      ...form_data,
    };

    // Prepare update payload
    const updatePayload: any = {
      form_data: mergedFormData,
      updated_at: new Date().toISOString(),
    };

    // Snapshot original data on first edit
    if (!submission.original_form_data) {
      updatePayload.original_form_data = submission.form_data;
    }

    // 5. Update submission
    const { data: updated, error: updateError } = await supabase
      .from('form_submissions')
      .update(updatePayload)
      .eq('submission_id', submissionId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating submission:', updateError);
      return NextResponse.json({ error: 'Failed to update submission' }, { status: 500 });
    }

    // 6. Record field-level changes in edit history
    if (changes.length > 0) {
      const editHistoryRows = changes.map(change => ({
        submission_id: submissionId,
        edited_by: edited_by || user.email || 'office_staff',
        edited_at: new Date().toISOString(),
        field_id: change.field_id,
        field_label: change.field_label,
        old_value: change.old_value,
        new_value: change.new_value,
        ip_address: ipAddress,
        user_agent: userAgent,
      }));

      const { error: histError } = await supabase
        .from('submission_edit_history')
        .insert(editHistoryRows);

      if (histError) {
        // Log but don't fail the request — the edit itself succeeded
        console.error('Error recording edit history:', histError);
      }
    }

    // 7. Fetch applicant for response
    const { data: applicant } = updated.applicant_id
      ? await supabase.from('applicants').select('*').eq('id', updated.applicant_id).single()
      : { data: null };

    // 8. Build formDefinition response
    const formDefinition = formDef ? {
      form_id: formDef.form_id || formDef.id,
      form_name: formDef.form_name || formDef.name || 'Unnamed Form',
      version: formDef.version || '1.0',
      company_id: formDef.company_id,
      doc_number: formDef.doc_number || undefined,
      description: formDef.description || undefined,
      status: formDef.status || 'published',
      sections: formDef.sections || [],
      metadata: formDef.metadata || {},
    } : null;

    return NextResponse.json({
      submission: updated,
      formDefinition,
      applicant: applicant || null,
    }, { status: 200 });
  } catch (error) {
    console.error('Error updating submission:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
