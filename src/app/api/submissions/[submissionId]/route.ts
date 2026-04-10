export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  try {
    const { submissionId } = params;
    const supabase = createServerSupabaseClient();

    // Fetch submission
    const { data: submission, error } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('submission_id', submissionId)
      .single();

    if (error || !submission) {
      console.error('Submission not found:', error?.message);
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Fetch applicant separately (applicant_id is TEXT, applicants.id is UUID)
    let applicant = { full_name: 'Unknown', phone: undefined as string | undefined, email: undefined as string | undefined };
    if (submission.applicant_id) {
      const { data: applicantData } = await supabase
        .from('applicants')
        .select('id, full_name, phone, email')
        .eq('id', submission.applicant_id)
        .single();
      if (applicantData) {
        applicant = {
          full_name: applicantData.full_name || 'Unknown',
          phone: applicantData.phone,
          email: applicantData.email,
        };
      }
    }

    // Fetch form definition
    let formDefinition = null;
    if (submission.form_id) {
      const { data: formDef } = await supabase
        .from('form_definitions')
        .select('*')
        .eq('form_id', submission.form_id)
        .single();

      if (formDef) {
        formDefinition = {
          form_id: formDef.form_id,
          form_name: formDef.form_name,
          company_id: formDef.company_id,
          sections: formDef.sections || [],
          metadata: formDef.metadata || {},
          dedup_links: formDef.dedup_links || {},
          render_mode: formDef.render_mode || 'generated',
          status: formDef.status,
        };
      }
    }

    return NextResponse.json({
      submission: {
        ...submission,
        applicant_name: applicant.full_name,
        applicant_phone: applicant.phone,
        applicant_email: applicant.email,
      },
      formDefinition,
      applicant,
    });
  } catch (err: any) {
    console.error('Submission detail error:', err?.message || err);
    return NextResponse.json({ error: 'Internal server error: ' + (err?.message || 'unknown') }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { submissionId: string } }
) {
  try {
    const { submissionId } = params;
    const body = await request.json();
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('form_submissions')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('submission_id', submissionId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ submission: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
