export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase';
import { getAuthenticatedUser, canAccessForm } from '@/lib/api-auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/submissions/[submissionId]/edit-history
 * Get all field-level edit history for a submission
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await params;
    const supabase = createServerSupabaseClient();

    // Fetch submission to get form_id for access check
    const { data: submission } = await supabase
      .from('form_submissions')
      .select('form_id')
      .eq('submission_id', submissionId)
      .single();

    if (!submission) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      );
    }

    // Auth check: verify user can access this form
    const user = await getAuthenticatedUser(request);
    if (user && !canAccessForm(user, submission.form_id)) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    const { data: history, error } = await supabase
      .from('submission_edit_history')
      .select('*')
      .eq('submission_id', submissionId)
      .order('edited_at', { ascending: false });

    if (error) {
      console.error('Error fetching edit history:', error);
      return NextResponse.json(
        { error: 'Failed to fetch edit history' },
        { status: 500 }
      );
    }

    return NextResponse.json({ history: history || [] }, { status: 200 });
  } catch (error) {
    console.error('Error in edit-history GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
