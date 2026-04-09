import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/forms/[id]/create-for-client
 *
 * Staff-initiated submission creation. Office staff pre-fills client info
 * (name, phone, DOB, address, etc.) and creates a draft submission that
 * the client can later access via phone lookup.
 *
 * Request body:
 * {
 *   staff_user_id: string,       // office user creating the form
 *   staff_user_email: string,
 *   client_name: string,         // required
 *   client_phone: string,        // required — used for phone lookup
 *   prefill_data: Record<string, any>,  // pre-filled field values
 * }
 *
 * Creates a submission with status "pending_client" and stores
 * the client phone number for lookup. The client can access
 * the form at /form/client/[formId] by entering their phone number.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formId } = await params;
    const body = await request.json();
    const { staff_user_id, staff_user_email, client_name, client_phone, prefill_data = {} } = body;

    // Validate required fields
    if (!client_name || !client_phone) {
      return NextResponse.json(
        { error: 'client_name and client_phone are required' },
        { status: 400 }
      );
    }

    // Normalize phone: strip non-digits, keep last 10
    const normalizedPhone = client_phone.replace(/\D/g, '').slice(-10);
    if (normalizedPhone.length < 10) {
      return NextResponse.json(
        { error: 'Invalid phone number — must be at least 10 digits' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Verify form exists
    const { data: formDef, error: formError } = await supabase
      .from('form_definitions')
      .select('form_id, form_name, metadata')
      .eq('form_id', formId)
      .single();

    if (formError || !formDef) {
      return NextResponse.json(
        { error: 'Form not found' },
        { status: 404 }
      );
    }

    // Check for existing pending submission for this client phone + form
    const { data: existing } = await supabase
      .from('form_submissions')
      .select('submission_id')
      .eq('form_id', formId)
      .eq('status', 'pending_client')
      .like('participant_name', client_name)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          error: 'A pending submission already exists for this client on this form',
          existing_submission_id: existing[0].submission_id,
        },
        { status: 409 }
      );
    }

    // Create applicant record for the client (table uses auto-generated 'id')
    const now = new Date().toISOString();
    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const { data: newApplicant, error: applicantError } = await supabase
      .from('applicants')
      .insert({
        full_name: client_name,
        phone: normalizedPhone,
        created_at: now,
      })
      .select('id')
      .single();

    if (applicantError || !newApplicant) {
      console.error('Failed to create applicant:', applicantError);
      return NextResponse.json(
        { error: 'Failed to create client record' },
        { status: 500 }
      );
    }

    const applicantId = newApplicant.id;

    // Build initial form data with pre-filled values
    const formData: Record<string, any> = {
      ...prefill_data,
      _staff_initiated: true,
      _created_by: staff_user_email || staff_user_id,
      _client_phone: normalizedPhone,
    };

    // Create the submission with status "pending_client"
    const insertData: Record<string, unknown> = {
      submission_id: submissionId,
      form_id: formId,
      applicant_id: applicantId,
      form_data: formData,
      status: 'pending_client',
      participant_name: client_name,
      created_at: now,
      updated_at: now,
    };

    const { data: submission, error: submitError } = await supabase
      .from('form_submissions')
      .insert([insertData])
      .select()
      .single();

    if (submitError) {
      console.error('Failed to create submission:', submitError);
      return NextResponse.json(
        { error: 'Failed to create submission' },
        { status: 500 }
      );
    }

    // Log audit event
    await supabase.from('audit_logs').insert([{
      event_type: 'staff_created_client_submission',
      form_id: formId,
      submission_id: submissionId,
      applicant_id: applicantId,
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
      metadata: {
        staff_user: staff_user_email || staff_user_id,
        client_name,
        client_phone: normalizedPhone,
      },
      created_at: now,
    }]);

    return NextResponse.json({
      submission_id: submissionId,
      applicant_id: applicantId,
      client_phone: normalizedPhone,
      message: 'Submission created. Client can access via phone lookup.',
    }, { status: 201 });

  } catch (err) {
    console.error('create-for-client error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
