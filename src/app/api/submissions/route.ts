export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase';
import { sanitizePostgrestInput } from '@/lib/supabase-utils';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';

/**
 * GET /api/submissions
 * List ALL submissions across all forms
 * Enforces company-based access control when auth headers are present
 * Uses inner join on form_definitions to filter by company access
 * Query params: status, formId, companyId, search, chw_name, date_from, date_to, page, pageSize
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Get query parameters
    const status = searchParams.get('status');
    const formId = searchParams.get('formId');
    const companyId = searchParams.get('companyId');
    const search = searchParams.get('search');
    const chwName = searchParams.get('chw_name');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    // Validate pagination params
    // FIX: Raised max pageSize from 100 to 1000 to support "Show All" option
    if (page < 1 || pageSize < 1 || pageSize > 1000) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const offset = (page - 1) * pageSize;

    // --- Company-based access control ---
    // Determine which companies this user can access
    let accessibleCompanyIds: string[] | null = null; // null = no filtering (super_admin or no auth)

    const user = await getAuthenticatedUser(request);
    if (user && user.role !== 'super_admin') {
      // Build list of accessible companies (multi-company + legacy fallback)
      const companies = user.assigned_companies.length > 0
        ? user.assigned_companies
        : user.company_id ? [user.company_id] : [];

      if (companies.length === 0) {
        // User has no company assignments — return empty
        return NextResponse.json({
          submissions: [],
          total: 0,
          page,
          pageSize,
          counts: { total: 0, draft: 0, submitted: 0, approved: 0, rejected: 0 },
        });
      }

      accessibleCompanyIds = companies;
    }

    // If a specific companyId filter is provided, narrow to that company
    // (also verifies user has access to this company)
    if (companyId) {
      if (accessibleCompanyIds !== null && !accessibleCompanyIds.includes(companyId)) {
        // User doesn't have access to this company
        return NextResponse.json({
          submissions: [],
          total: 0,
          page,
          pageSize,
          counts: { total: 0, draft: 0, submitted: 0, approved: 0, rejected: 0 },
        });
      }
      // Narrow to just this company
      accessibleCompanyIds = [companyId];
    }

    // Build query with inner join on form_definitions for company filtering
    // Using !inner ensures only submissions with matching form_definitions are returned
    let query = supabase
      .from('form_submissions')
      .select(
        `
        *,
        applicants:applicant_id(id, full_name, phone, email),
        form_definitions!inner(form_id, form_name, company_id)
        `,
        { count: 'exact' }
      );

    // Apply company access filter directly on the joined form_definitions
    if (accessibleCompanyIds !== null) {
      query = query.in('form_definitions.company_id', accessibleCompanyIds);
    }

    // Exclude submissions for deleted forms
    query = query.neq('form_definitions.status', 'deleted');

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Filter by formId if provided
    if (formId) {
      query = query.eq('form_id', formId);
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
          counts: { total: 0, draft: 0, submitted: 0, approved: 0, rejected: 0 },
        });
      }
    }

    // Filter by CHW name
    if (chwName) {
      query = query.ilike('chw_name', `%${chwName}%`);
    }

    // FIX: Filter by date range
    // Previously used only submitted_at, which excluded Draft submissions (submitted_at is null).
    // Now includes drafts by also checking created_at when submitted_at is null.
    if (dateFrom) {
      query = query.or(
        `submitted_at.gte.${dateFrom}T00:00:00,and(submitted_at.is.null,created_at.gte.${dateFrom}T00:00:00)`
      );
    }
    if (dateTo) {
      query = query.or(
        `submitted_at.lte.${dateTo}T23:59:59,and(submitted_at.is.null,created_at.lte.${dateTo}T23:59:59)`
      );
    }

    // Order and paginate — use updated_at so drafts (which have no submitted_at) also appear
    query = query.order('updated_at', { ascending: false });
    query = query.range(offset, offset + pageSize - 1);

    const { data: submissions, error, count } = await query;

    if (error) {
      console.error('Error fetching submissions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch submissions' },
        { status: 500 }
      );
    }

    // Get status counts (scoped to accessible companies via inner join)
    const buildCountQuery = (statusValue: string) => {
      let q = supabase
        .from('form_submissions')
        .select('*, form_definitions!inner(company_id)', { count: 'exact', head: true })
        .eq('status', statusValue);

      if (accessibleCompanyIds !== null) {
        q = q.in('form_definitions.company_id', accessibleCompanyIds);
      }
      q = q.neq('form_definitions.status', 'deleted');
      if (formId) q = q.eq('form_id', formId);
      if (chwName) q = q.ilike('chw_name', `%${chwName}%`);

      // FIX: Use same date filter logic for counts — include drafts via created_at fallback
      if (dateFrom) {
        q = q.or(
          `submitted_at.gte.${dateFrom}T00:00:00,and(submitted_at.is.null,created_at.gte.${dateFrom}T00:00:00)`
        );
      }
      if (dateTo) {
        q = q.or(
          `submitted_at.lte.${dateTo}T23:59:59,and(submitted_at.is.null,created_at.lte.${dateTo}T23:59:59)`
        );
      }

      return q;
    };

    const [
      { count: draftCount },
      { count: submittedCount },
      { count: approvedCount },
      { count: rejectedCount },
    ] = await Promise.all([
      buildCountQuery('draft'),
      buildCountQuery('submitted'),
      buildCountQuery('approved'),
      buildCountQuery('rejected'),
    ]);

    // Flatten applicant and form data
    const flattenedSubmissions = submissions?.map((sub) => ({
      ...sub,
      applicant_name: sub.applicants?.full_name || null,
      applicant_phone: sub.applicants?.phone || null,
      applicant_email: sub.applicants?.email || null,
      form_name: sub.form_definitions?.form_name || null,
    })) || [];

    return NextResponse.json(
      {
        submissions: flattenedSubmissions,
        total: count || 0,
        page,
        pageSize,
        counts: {
          total: count || 0,
          draft: draftCount || 0,
          submitted: submittedCount || 0,
          approved: approvedCount || 0,
          rejected: rejectedCount || 0,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
