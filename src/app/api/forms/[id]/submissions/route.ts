export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase';
import { sanitizePostgrestInput } from '@/lib/supabase-utils';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';

/**
 * GET /api/forms/[id]/submissions
 * List submissions for a specific form
 * Query params: status, search, page (default 1), pageSize (default 20)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formId } = await params;
    const { searchParams } = new URL(request.url);

    // Get query parameters
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    // Validate pagination params
    if (page < 1 || pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Require authentication
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const offset = (page - 1) * pageSize;

    // Build query
    let query = supabase
      .from('form_submissions')
      .select(
        `
        *,
        applicants:applicant_id(id, full_name, phone, email)
        `,
        { count: 'exact' }
      )
      .eq('form_id', formId);

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // FIX: Filter by search (applicant name or phone)
    // Previously used .or() on foreign table columns which only filters the join,
    // not the parent rows. Now uses a two-step approach: first find matching
    // applicant IDs, then filter submissions by those IDs.
    if (search) {
      const s = sanitizePostgrestInput(search);
      const { data: matchingApplicants } = await supabase
        .from('applicants')
        .select('id')
        .or(`full_name.ilike.%${s}%,phone.ilike.%${s}%`);

      const matchingIds = matchingApplicants?.map((a) => a.id) || [];

      if (matchingIds.length > 0) {
        query = query.in('applicant_id', matchingIds);
      } else {
        // No matching applicants — return empty result
        return NextResponse.json({
          submissions: [],
          total: 0,
          page,
          pageSize,
          counts: {
            submitted: 0,
            approved: 0,
            rejected: 0,
          },
        });
      }
    }

    // Order and paginate
    query = query.order('submitted_at', { ascending: false });
    query = query.range(offset, offset + pageSize - 1);

    const { data: submissions, error, count } = await query;

    if (error) {
      console.error('Error fetching submissions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch submissions' },
        { status: 500 }
      );
    }

    // Get status counts for this form
    const { count: submittedCount } = await supabase
      .from('form_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('form_id', formId)
      .eq('status', 'submitted');

    const { count: approvedCount } = await supabase
      .from('form_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('form_id', formId)
      .eq('status', 'approved');

    const { count: rejectedCount } = await supabase
      .from('form_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('form_id', formId)
      .eq('status', 'rejected');

    // Flatten applicant data
    const flattenedSubmissions = submissions?.map((sub) => ({
      ...sub,
      applicant_name: sub.applicants?.full_name || null,
      applicant_phone: sub.applicants?.phone || null,
      applicant_email: sub.applicants?.email || null,
    })) || [];

    return NextResponse.json(
      {
        submissions: flattenedSubmissions,
        total: count || 0,
        page,
        pageSize,
        counts: {
          submitted: submittedCount || 0,
          approved: approvedCount || 0,
          rejected: rejectedCount || 0,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching form submissions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
