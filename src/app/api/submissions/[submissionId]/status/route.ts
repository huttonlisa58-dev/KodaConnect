export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, canEditSubmission } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * PATCH /api/submissions/[submissionId]/status
 * Change submission status (finalize or revert to submitted)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await params;
    const body = await request.json();
    const { status, reviewed_by, notes } = body;

    // Validate status — 'finalized', 'submitted', and 'approved' are valid transitions
    if (!status || !['finalized', 'submitted', 'approved'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "finalized", "submitted", or "approved"' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch current submission
    const { data: submission, error: fetchError } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('submission_id', submissionId)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      );
    }

    // Validate transition rules
    if (status === 'finalized') {
      // Can finalize from 'submitted' or 'approved' status
      if (submission.status !== 'submitted' && submission.status !== 'approved') {
        return NextResponse.json(
          { error: `Cannot finalize from "${submission.status}" status. Must be "submitted" or "approved".` },
          { status: 400 }
        );
      }
    } else if (status === 'approved') {
      // Can approve from 'submitted' status (staff review & sign)
      if (submission.status !== 'submitted') {
        return NextResponse.json(
          { error: `Cannot approve from "${submission.status}" status. Must be "submitted".` },
          { status: 400 }
        );
      }
    } else if (status === 'submitted') {
      // Reverting: can revert from 'finalized' or 'approved'
      if (submission.status !== 'finalized' && submission.status !== 'approved') {
        return NextResponse.json(
          { error: `Cannot revert from "${submission.status}" status. Must be "finalized" or "approved".` },
          { status: 400 }
        );
      }

      // Only admin/super_admin can revert a finalized/approved submission
      const user = await getAuthenticatedUser(request);
      if (user && (user.role === 'staff' || user.role === 'rn')) {
        return NextResponse.json(
          { error: 'Only admins can revert finalized/approved submissions' },
          { status: 403 }
        );
      }
    }

    const now = new Date().toISOString();

    // Update submission
    const { data: updated, error: updateError } = await supabase
      .from('form_submissions')
      .update({
        status,
        reviewed_by: reviewed_by || null,
        reviewed_at: now,
        notes: notes || null,
        updated_at: now,
      })
      .eq('submission_id', submissionId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating submission status:', updateError);
      return NextResponse.json(
        { error: 'Failed to update submission status' },
        { status: 500 }
      );
    }

    // Log audit
    const action = (status === 'finalized' || status === 'approved') ? 'approve' : 'update';
    await logAudit({
      action,
      resourceType: 'submission',
      resourceId: submissionId,
      details: {
        status_change: `${submission.status} → ${status}`,
        notes: notes || '',
        reviewed_by: reviewed_by || '',
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error('Error updating submission status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
