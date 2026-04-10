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

    // Get accessible company IDs for this user
    let accessibleCompanyIds: string[] | null = null;
    try {
      const user = await getAuthenticatedUser(request);
      if (user && user.role !== 'super_admin') {
        const companies = user.assigned_companies?.length > 0
          ? user.assigned_companies
          : user.company_id ? [user.company_id] : [];
        if (companies.length === 0) {
          return NextResponse.json({ submissions: [], total: 0, page, pageSize,
            counts: { total: 0, draft: 0, submitted: 0, approved: 0, rejected: 0 } });
        }
        accessibleCompanyIds = companies;
      }
    } catch { /* no auth header = super_admin */ }

    if (companyId) accessibleCompanyIds = [companyId];

    // Step 1: Get form IDs accessible to this user via company filter
    let accessibleFormIds: string[] | null = null;
    if (accessibleCompanyIds !== null) {
      const { data: forms } = await supabase
        .from('form_definitions')
        .select('form_id')
        .in('company_id', accessibleCompanyIds)
        .neq('status', 'deleted');
      accessibleFormIds = forms?.map(f => f.form_id) || [];
      if (accessibleFormIds.length === 0) {
        return NextResponse.json({ submissions: [], total: 0, page, pageSize,
          counts: { total: 0, draft: 0, submitted: 0, approved: 0, rejected: 0 } });
      }
    }

    // Step 2: Query submissions
    let query = supabase
      .from('form_submissions')
      .select('*', { count: 'exact' });

    if (accessibleFormIds !== null) query = query.in('form_id', accessibleFormIds);
    if (formId) query = query.eq('form_id', formId);
    if (status) query = query.eq('status', status);
    if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00');
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data: submissions, error, count } = await query;

    if (error) {
      console.error('Submissions query error:', error);
      return NextResponse.json({ error: 'Failed to fetch submissions: ' + error.message }, { status: 500 });
    }

    // Step 3: Fetch related data
    const formIds = [...new Set(submissions?.map(s => s.form_id).filter(Boolean))];
    const applicantIds = [...new Set(submissions?.map(s => s.applicant_id).filter(Boolean))];

    let formsMap: Record<string, any> = {};
    let applicantsMap: Record<string, any> = {};

    if (formIds.length > 0) {
      const { data: forms } = await supabase
        .from('form_definitions')
        .select('form_id, form_name, company_id')
        .in('form_id', formIds);
      forms?.forEach(f => { formsMap[f.form_id] = f; });
    }

    if (applicantIds.length > 0) {
      const { data: applicants } = await supabase
        .from('applicants')
        .select('id, full_name, phone, email')
        .in('id', applicantIds);
      applicants?.forEach(a => { applicantsMap[a.id] = a; });
    }

    // Step 4: Apply search filter
    let filtered = submissions || [];
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(sub => {
        const name = (applicantsMap[sub.applicant_id]?.full_name || '').toLowerCase();
        const phone = applicantsMap[sub.applicant_id]?.phone || '';
        return name.includes(s) || phone.includes(s);
      });
    }

    // Step 5: Count by status
    const getCount = async (s: string) => {
      let q = supabase.from('form_submissions').select('*', { count: 'exact', head: true }).eq('status', s);
      if (accessibleFormIds) q = q.in('form_id', accessibleFormIds);
      if (formId) q = q.eq('form_id', formId);
      const { count: c } = await q;
      return c || 0;
    };

    const [draftCount, submittedCount, approvedCount, rejectedCount] = await Promise.all([
      getCount('draft'), getCount('submitted'), getCount('approved'), getCount('rejected')
    ]);

    const result = filtered.map(sub => ({
      ...sub,
      applicant_name: applicantsMap[sub.applicant_id]?.full_name || null,
      applicant_phone: applicantsMap[sub.applicant_id]?.phone || null,
      applicant_email: applicantsMap[sub.applicant_id]?.email || null,
      form_name: formsMap[sub.form_id]?.form_name || null,
    }));

    return NextResponse.json({
      submissions: result,
      total: count || 0,
      page,
      pageSize,
      counts: {
        total: count || 0,
        draft: draftCount,
        submitted: submittedCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
    });
  } catch (error) {
    console.error('Submissions API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
