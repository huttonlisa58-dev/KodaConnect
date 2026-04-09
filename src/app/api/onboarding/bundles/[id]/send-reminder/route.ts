import { createServerSupabaseClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

interface SendReminderResponse {
  success: boolean;
  message: string;
  bundle_id?: string;
  applicant_phone?: string;
}

/**
 * POST /api/onboarding/bundles/[id]/send-reminder
 * Send SMS reminder to applicant for incomplete packets
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const bundleId = params.id;

    // Fetch bundle with applicant info
    const { data: bundle, error: bundleError } = await supabase
      .from('onboarding_bundles')
      .select(
        `
        id,
        applicant_id,
        template_id,
        applicants:applicant_id (
          id,
          first_name,
          last_name,
          phone,
          email
        )
      `
      )
      .eq('id', bundleId)
      .single();

    if (bundleError || !bundle) {
      return NextResponse.json(
        { error: 'Bundle not found', success: false },
        { status: 404 }
      );
    }

    const applicant = bundle.applicants?.[0];
    if (!applicant || !applicant.phone) {
      return NextResponse.json(
        { error: 'Applicant phone number not found', success: false },
        { status: 400 }
      );
    }

    // Get all template packets for this bundle
    const { data: templatePackets, error: packetsError } = await supabase
      .from('template_packets')
      .select(
        `
        id,
        form_packet_id,
        is_required,
        form_packets:form_packet_id (
          id,
          name
        )
      `
      )
      .eq('template_id', bundle.template_id);

    if (packetsError) {
      console.error('Error fetching template packets:', packetsError);
      return NextResponse.json(
        { error: 'Failed to fetch packet details', success: false },
        { status: 500 }
      );
    }

    // Find incomplete applicant-assigned packets
    const incompletePackets = [];

    for (const templatePacket of templatePackets || []) {
      // Check if this packet has a non-approved submission
      const { data: submission } = await supabase
        .from('form_submissions')
        .select('id, status')
        .eq('applicant_id', bundle.applicant_id)
        .eq('form_id', templatePacket.form_packet_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // If no submission or not approved, it's incomplete
      if (!submission || submission.status !== 'approved') {
        incompletePackets.push({
          packet_id: templatePacket.id,
          packet_name: templatePacket.form_packets?.[0]?.name || 'Unknown',
        });
      }
    }

    if (incompletePackets.length === 0) {
      return NextResponse.json<SendReminderResponse>(
        {
          success: true,
          message: 'No incomplete packets to remind about',
          bundle_id: bundleId,
        },
        { status: 200 }
      );
    }

    // Generate bundle link
    // TODO: Update the URL to match your actual onboarding URL structure
    const bundleLink = `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/${bundleId}`;

    // TODO: Send SMS via Twilio
    // Steps:
    // 1. Initialize Twilio client with account SID and auth token from env vars
    // 2. Call twilio.messages.create() with:
    //    - to: applicant.phone (ensure E.164 format)
    //    - from: TWILIO_PHONE_NUMBER env var
    //    - body: Construct message with bundle link and incomplete packet count
    // 3. Handle Twilio errors
    // 4. Log successful send for auditing
    //
    // Example message:
    // "Hi {first_name}, you have {incomplete_count} pending documents to complete. "
    // "Please visit: {bundleLink} to continue. Thank you!"

    console.log(
      `TODO: Send SMS reminder to ${applicant.phone} for bundle ${bundleId}`
    );
    console.log(`TODO: Bundle link: ${bundleLink}`);
    console.log(`TODO: Incomplete packets: ${incompletePackets.length}`);
    console.log(`TODO: Incomplete packet details:`, incompletePackets);

    return NextResponse.json<SendReminderResponse>(
      {
        success: true,
        message: 'Reminder sent',
        bundle_id: bundleId,
        applicant_phone: applicant.phone,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/onboarding/bundles/[id]/send-reminder:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
}
