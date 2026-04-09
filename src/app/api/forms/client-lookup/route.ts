import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/forms/client-lookup?phone=1234567890&form_id=xxx
 *
 * Phone-based submission lookup for client-facing forms.
 * The client enters their phone number and the system finds their
 * pre-filled (staff-initiated) submission.
 *
 * Returns the submission data, form definition, and applicant info
 * so the client can review and complete the form.
 *
 * Query params:
 *   phone    — client phone number (digits only or formatted)
 *   form_id  — the form definition ID to look up
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const formId = searchParams.get('form_id');

    if (!phone || !formId) {
      return NextResponse.json(
        { error: 'phone and form_id are required' },
        { status: 400 }
      );
    }

    // Normalize phone: strip non-digits, keep last 10
    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
    if (normalizedPhone.length < 10) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Look for submissions that have this phone in form_data._client_phone
    // or in the associated applicant record
    // Strategy: search form_submissions where form_data._client_phone matches
    const { data: submissions, error: subError } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('form_id', formId)
      .in('status', ['pending_client', 'draft'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (subError) {
      console.error('Lookup error:', subError);
      return NextResponse.json(
        { error: 'Failed to search for submissions' },
        { status: 500 }
      );
    }

    // Filter by phone in form_data._client_phone
    const matching = (submissions || []).filter((sub: any) => {
      const clientPhone = sub.form_data?._client_phone;
      if (clientPhone === normalizedPhone) return true;
      // Also check applicant record
      return false;
    });

    if (matching.length === 0) {
      // Also try looking up by applicant phone
      const { data: applicants } = await supabase
        .from('applicants')
        .select('applicant_id')
        .eq('phone', normalizedPhone)
        .limit(10);

      if (applicants && applicants.length > 0) {
        const applicantIds = applicants.map((a: any) => a.applicant_id);
        const { data: appSubmissions } = await supabase
          .from('form_submissions')
          .select('*')
          .eq('form_id', formId)
          .in('applicant_id', applicantIds)
          .in('status', ['pending_client', 'draft'])
          .order('created_at', { ascending: false })
          .limit(1);

        if (appSubmissions && appSubmissions.length > 0) {
          matching.push(...appSubmissions);
        }
      }
    }

    if (matching.length === 0) {
      return NextResponse.json(
        { error: 'No pending form found for this phone number. Please contact your agency.' },
        { status: 404 }
      );
    }

    // Return the most recent matching submission
    const submission = matching[0];

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

    // Fetch applicant info
    const { data: applicant } = await supabase
      .from('applicants')
      .select('full_name, phone, email')
      .eq('applicant_id', submission.applicant_id)
      .single();

    return NextResponse.json({
      submission: {
        submission_id: submission.submission_id,
        form_id: submission.form_id,
        status: submission.status,
        form_data: submission.form_data,
        applicant_id: submission.applicant_id,
        created_at: submission.created_at,
      },
      formDefinition: formDef,
      applicant: applicant || { full_name: submission.participant_name || 'Client', phone: normalizedPhone },
    });

  } catch (err) {
    console.error('client-lookup error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
