import { createServerSupabaseClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

type PacketStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'needs_revision';

interface BundlePacket {
  packet_id: string;
  packet_name: string;
  render_mode: string;
  assigned_to_role: string | null;
  is_required: boolean;
  submission_status: PacketStatus;
  submission_id: string | null;
  submitted_at: string | null;
}

interface BundleProgress {
  total_packets: number;
  completed_packets: number;
  packets: BundlePacket[];
}

interface Bundle {
  id: string;
  template_id: string;
  applicant_id: string;
  company_id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  notes: string | null;
  applicant?: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string | null;
  };
  template?: {
    id: string;
    name: string;
    state: string;
  };
  company?: {
    id: string;
    name: string;
  };
  progress?: BundleProgress;
}

interface ListResponse {
  bundles: Bundle[];
  total_count: number;
  page: number;
}

/**
 * GET /api/onboarding/bundles
 * List onboarding bundles with filters and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const company_id = searchParams.get('company_id');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const date_from = searchParams.get('date_from');
    const date_to = searchParams.get('date_to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const per_page = parseInt(searchParams.get('per_page') || '20', 10);

    // Start building the query
    let query = supabase
      .from('onboarding_bundles')
      .select(
        `
        id,
        template_id,
        applicant_id,
        company_id,
        status,
        created_at,
        completed_at,
        notes,
        applicants:applicant_id (
          id,
          first_name,
          last_name,
          phone,
          email
        ),
        onboarding_templates:template_id (
          id,
          name,
          state
        ),
        companies:company_id (
          id,
          name
        )
      `,
        { count: 'exact' }
      );

    // Apply filters
    if (company_id) {
      query = query.eq('company_id', company_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (date_from) {
      query = query.gte('created_at', date_from);
    }

    if (date_to) {
      query = query.lte('created_at', date_to);
    }

    // Apply pagination
    const from = (page - 1) * per_page;
    const to = from + per_page - 1;
    query = query.range(from, to);

    // Order by created_at descending
    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching bundles:', error);
      return NextResponse.json(
        { error: 'Failed to fetch bundles' },
        { status: 500 }
      );
    }

    // Process search filter (applicant name) - done in-memory for simplicity
    let bundles: Bundle[] = (data || []).map((bundle: any) => ({
      id: bundle.id,
      template_id: bundle.template_id,
      applicant_id: bundle.applicant_id,
      company_id: bundle.company_id,
      status: bundle.status,
      created_at: bundle.created_at,
      completed_at: bundle.completed_at,
      notes: bundle.notes,
      applicant: bundle.applicants?.[0],
      template: bundle.onboarding_templates?.[0],
      company: bundle.companies?.[0],
    }));

    // Filter by applicant name if search provided
    if (search) {
      const searchLower = search.toLowerCase();
      bundles = bundles.filter((bundle) => {
        if (!bundle.applicant) return false;
        const fullName =
          `${bundle.applicant.first_name} ${bundle.applicant.last_name}`.toLowerCase();
        return fullName.includes(searchLower);
      });
    }

    // Derive packet progress for each bundle
    const bundlesWithProgress = await Promise.all(
      bundles.map(async (bundle) => {
        const progress = await derivePacketProgress(supabase, bundle);
        return {
          ...bundle,
          progress,
        };
      })
    );

    return NextResponse.json<ListResponse>(
      {
        bundles: bundlesWithProgress,
        total_count: count || 0,
        page,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in GET /api/onboarding/bundles:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/onboarding/bundles
 * Create a new onboarding bundle
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    const body = await request.json();
    const {
      template_id,
      applicant,
      company_id,
      send_sms = false,
      notes,
    } = body;

    // Validate required fields
    if (!template_id || !applicant || !company_id) {
      return NextResponse.json(
        { error: 'Missing required fields: template_id, applicant, company_id' },
        { status: 400 }
      );
    }

    if (!applicant.first_name || !applicant.last_name || !applicant.phone) {
      return NextResponse.json(
        { error: 'Applicant must have first_name, last_name, and phone' },
        { status: 400 }
      );
    }

    // Step 1: Verify template exists and is active
    const { data: template, error: templateError } = await supabase
      .from('onboarding_templates')
      .select('id, name, state')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: 'Template not found or inactive' },
        { status: 404 }
      );
    }

    // Step 2: Create or find applicant by phone number
    let applicantId: string;
    const { data: existingApplicant, error: applicantFetchError } =
      await supabase
        .from('applicants')
        .select('id')
        .eq('phone', applicant.phone)
        .single();

    if (existingApplicant) {
      applicantId = existingApplicant.id;
      // Optionally update applicant info
      await supabase
        .from('applicants')
        .update({
          first_name: applicant.first_name,
          last_name: applicant.last_name,
          email: applicant.email || null,
        })
        .eq('id', applicantId);
    } else {
      // Create new applicant
      const { data: newApplicant, error: createApplicantError } = await supabase
        .from('applicants')
        .insert({
          first_name: applicant.first_name,
          last_name: applicant.last_name,
          phone: applicant.phone,
          email: applicant.email || null,
        })
        .select('id')
        .single();

      if (createApplicantError || !newApplicant) {
        console.error('Error creating applicant:', createApplicantError);
        return NextResponse.json(
          { error: 'Failed to create applicant' },
          { status: 500 }
        );
      }

      applicantId = newApplicant.id;
    }

    // Step 3: Create onboarding bundle
    const { data: newBundle, error: bundleError } = await supabase
      .from('onboarding_bundles')
      .insert({
        template_id,
        applicant_id: applicantId,
        company_id,
        status: 'active',
        notes: notes || null,
      })
      .select(
        `
        id,
        template_id,
        applicant_id,
        company_id,
        status,
        created_at,
        completed_at,
        notes,
        applicants:applicant_id (
          id,
          first_name,
          last_name,
          phone,
          email
        ),
        onboarding_templates:template_id (
          id,
          name,
          state
        ),
        companies:company_id (
          id,
          name
        )
      `
      )
      .single();

    if (bundleError || !newBundle) {
      console.error('Error creating bundle:', bundleError);
      return NextResponse.json(
        { error: 'Failed to create bundle' },
        { status: 500 }
      );
    }

    const bundleResponse: Bundle = {
      id: newBundle.id,
      template_id: newBundle.template_id,
      applicant_id: newBundle.applicant_id,
      company_id: newBundle.company_id,
      status: newBundle.status,
      created_at: newBundle.created_at,
      completed_at: newBundle.completed_at,
      notes: newBundle.notes,
      applicant: newBundle.applicants?.[0],
      template: newBundle.onboarding_templates?.[0],
      company: newBundle.companies?.[0],
    };

    // Step 4: Send SMS if requested
    if (send_sms) {
      // TODO: Generate bundle link and send via Twilio
      // This would involve:
      // 1. Building the onboarding link (e.g., /onboarding/[bundleId])
      // 2. Calling Twilio API to send SMS to applicant.phone
      // 3. Logging the SMS send attempt
      console.log(
        `TODO: Send SMS reminder to ${applicant.phone} for bundle ${newBundle.id}`
      );
    }

    return NextResponse.json(
      { bundle: bundleResponse },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/onboarding/bundles:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Helper function to derive packet progress for a bundle
 */
async function derivePacketProgress(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  bundle: Bundle
): Promise<BundleProgress> {
  try {
    // Fetch template packets for this bundle's template
    const { data: templatePackets, error: packetsError } = await supabase
      .from('template_packets')
      .select(
        `
        id,
        form_packet_id,
        template_id,
        render_mode,
        assigned_to_role,
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
      return {
        total_packets: 0,
        completed_packets: 0,
        packets: [],
      };
    }

    const packets: BundlePacket[] = [];
    let completedCount = 0;

    // For each packet, find the latest form submission
    for (const templatePacket of templatePackets || []) {
      const { data: submission, error: submissionError } = await supabase
        .from('form_submissions')
        .select('id, status, submitted_at')
        .eq('applicant_id', bundle.applicant_id)
        .eq('form_id', templatePacket.form_packet_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Determine submission status
      let submissionStatus: PacketStatus = 'not_started';
      let submissionId: string | null = null;
      let submittedAt: string | null = null;

      if (submission) {
        submissionId = submission.id;
        submittedAt = submission.submitted_at;

        if (submission.status === 'draft') {
          submissionStatus = 'in_progress';
        } else if (submission.status === 'submitted') {
          submissionStatus = 'submitted';
        } else if (submission.status === 'approved') {
          submissionStatus = 'approved';
          completedCount++;
        } else if (submission.status === 'rejected') {
          submissionStatus = 'needs_revision';
        }
      }

      packets.push({
        packet_id: templatePacket.id,
        packet_name: templatePacket.form_packets?.[0]?.name || 'Unknown',
        render_mode: templatePacket.render_mode,
        assigned_to_role: templatePacket.assigned_to_role,
        is_required: templatePacket.is_required,
        submission_status: submissionStatus,
        submission_id: submissionId,
        submitted_at: submittedAt,
      });
    }

    return {
      total_packets: packets.length,
      completed_packets: completedCount,
      packets,
    };
  } catch (error) {
    console.error('Error deriving packet progress:', error);
    return {
      total_packets: 0,
      completed_packets: 0,
      packets: [],
    };
  }
}
