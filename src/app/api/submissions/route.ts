import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') || '';
    const formId = searchParams.get('formId') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));
    const offset = (page - 1) * pageSize;

    // Build query
    let query = supabase
      .from('form_submissions')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (formId) query = query.eq('form_id', formId);

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data: submissions, error, count } = await query;

    if (error) {
      console.error('Submissions error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch submissions: ' + error.message }, { status: 500 });
    }

    // Fetch form names
    const formIds = [...new Set((submissions || []).map(s => s.form_id).filter(Boolean))];
    const applicantIds = [...new Set((submissions || []).map(s => s.applicant_id).filter(Boolean))];

    let formsMap: Record<string, any> = {};
    let applicantsMap: Record<string, any> = {};

    if (formIds.length > 0) {
      const { data: forms } = await supabase
        .from('form_definitions')
        .select('form_id, form_name, company_id')
        .in('form_id', formIds);
      (forms || []).forEach(f => { formsMap[f.form_id] = f; });
    }

    if (applicantIds.length > 0) {
      const { data: applicants } = await supabase
        .from('applicants')
        .select('id, full_name, phone, email')
        .in('id', applicantIds);
      (applicants || []).forEach(a => { applicantsMap[a.id] = a; });
    }

    // Count by status
    const countByStatus = async (s: string) => {
      const { count: c } = await supabase
        .from('form_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('status', s);
      return c || 0;
    };

    const [draftCount, submittedCount, approvedCount, rejectedCount] = await Promise.all([
      countByStatus('draft'),
      countByStatus('submitted'),
      countByStatus('approved'),
      countByStatus('rejected'),
    ]);

    const result = (submissions || []).map(sub => ({
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
  } catch (err: any) {
    console.error('Submissions API crash:', err?.message || err);
    return NextResponse.json({ error: 'Internal server error: ' + (err?.message || 'unknown') }, { status: 500 });
  }
}
