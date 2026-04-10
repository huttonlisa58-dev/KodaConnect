import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getAuthenticatedUser } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const formId = searchParams.get('formId');
    const companyId = searchParams.get('companyId');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    if (page < 1 || pageSize < 1 || pageSize > 1000) {
      return NextResponse.json({ error: 'Invalid pagination parameters' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const offset = (page - 1) * pageSize;

    // Company access control
    let accessibleCompanyIds: string[] | null = null;
    const user = await getAuthenticatedUser(request);
    if (user && user.role !== 'super_admin') {
      const companies = user.assigned_companies?.length > 0
        ? user.assigned_companies
        : user.company_id ? [user.company_id] : [];
      if (companies.length === 0) {
        return NextResponse.json({ submissions: [], total: 0, page, pageSize, counts: { total: 0, draft: 0, submitted: 0, approved: 0, rejected: 0 } });
      }
      accessibleCompanyIds = companies;
    }
    if (companyId) {
      accessibleCompanyIds = [companyId];
    }

    // Build query — join form_definitions via FK
    let query = supabase
      .from('form_submissions')
      .select('*, form_definitions!fk_form_submissions_form_def(form_id, form_name, company_id, status)', { count: 'exact' });

    if (accessibleCompanyIds) {
      query = query.in('form_definitions.company_id', accessibleCompanyIds);
    }
    if (status) query = query.eq('status', status);
    if (formId) query = query.eq('form_id', formId);
    if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00');
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');

    query = query.order('created_at', { ascending: false });
    query = query.range(offset, offset + pageSize - 1);

    const { data: submissions, error, count } = await query;

    if (error) {
      console.error('Error fetching submissions:', error);
      return NextResponse.json({ error: 'Failed to fetch submissions: ' + error.message }, { status: 500 });
    }

    // Fetch applicant data separately (applicant_id is TEXT, applicants.id is UUID)
    const applicantIds = [...new Set(submissions?.map(s => s.applicant_id).filter(Boolean))];
    let applicantsMap: Record<string, any> = {};
    if (applicantIds.length > 0) {
      const { data: applicants } = await supabase
        .from('applicants')
        .select('id, full_name, phone, email')
        .in('id', applicantIds);
      applicants?.forEach(a => { applicantsMap[a.id] = a; });
    }

    // Get status counts
    const getCount = async (s: string) => {
      let q = supabase.from('form_submissions').select('*', { count: 'exact', head: true }).eq('status', s);
      if (formId) q = q.eq('form_id', formId);
      const { count: c } = await q;
      return c || 0;
    };
    const [draftCount, submittedCount, approvedCount, rejectedCount] = await Promise.all([
      getCount('draft'), getCount('submitted'), getCount('approved'), getCount('rejected')
    ]);

    const flattenedSubmissions = submissions?.map(sub => ({
      ...sub,
      applicant_name: applicantsMap[sub.applicant_id]?.full_name || sub.applicant_id || 'Unknown',
      applicant_phone: applicantsMap[sub.applicant_id]?.phone || null,
      applicant_email: applicantsMap[sub.applicant_id]?.email || null,
      form_name: sub.form_definitions?.form_name || null,
    })) || [];

    return NextResponse.json({
      submissions: flattenedSubmissions,
      total: count || 0,
      page,
      pageSize,
      counts: { total: count || 0, draft: draftCount, submitted: submittedCount, approved: approvedCount, rejected: rejectedCount },
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
