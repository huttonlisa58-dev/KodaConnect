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

interface BundleDetail {
  id: string;
  template_id: string;
  applicant_id: string;
  company_id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  notes: string | null;
  applicant: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string | null;
  };
  template: {
    id: string;
    name: string;
    state: string;
  };
  company: {
    id: string;
    name: string;
  };
  packets: BundlePacket[];
}

/**
 * GET /api/onboarding/bundles/[id]
 * Get full bundle detail with all packets and submission status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const bundleId = params.id;

    // Fetch bundle with relations
    const { data: bundle, error: bundleError } = await supabase
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
      `
      )
      .eq('id', bundleId)
      .single();

    if (bundleError || !bundle) {
      return NextResponse.json(
        { error: 'Bundle not found' },
        { status: 404 }
      );
    }

    // Fetch template packets
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
      return NextResponse.json(
        { error: 'Failed to fetch packet details' },
        { status: 500 }
      );
    }

    // Build packets array with submission status
    const packets: BundlePacket[] = [];

    for (const templatePacket of templatePackets || []) {
      const { data: submission, error: submissionError } = await supabase
        .from('form_submissions')
        .select('id, status, submitted_at')
        .eq('applicant_id', bundle.applicant_id)
        .eq('form_id', templatePacket.form_packet_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Determine submission status based on submission data
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

    const response: { bundle: BundleDetail } = {
      bundle: {
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
        packets,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Unexpected error in GET /api/onboarding/bundles/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/onboarding/bundles/[id]
 * Update bundle status, notes, or completion status
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const bundleId = params.id;

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check user role (must be admin or super_admin)
    const { data: userRole, error: roleError } = await supabase
      .from('office_users')
      .select('role')
      .eq('id', user.id)
      .single();

    const userRoleValue = userRole?.role;
    if (!['admin', 'super_admin'].includes(userRoleValue)) {
      return NextResponse.json(
        { error: 'Forbidden: admin access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { status, notes, completed_at } = body;

    // Build update object with only provided fields
    const updateData: Record<string, any> = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (completed_at !== undefined) updateData.completed_at = completed_at;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Update the bundle
    const { data: updatedBundle, error: updateError } = await supabase
      .from('onboarding_bundles')
      .update(updateData)
      .eq('id', bundleId)
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

    if (updateError || !updatedBundle) {
      console.error('Error updating bundle:', updateError);
      return NextResponse.json(
        { error: 'Failed to update bundle' },
        { status: 500 }
      );
    }

    const response = {
      bundle: {
        id: updatedBundle.id,
        template_id: updatedBundle.template_id,
        applicant_id: updatedBundle.applicant_id,
        company_id: updatedBundle.company_id,
        status: updatedBundle.status,
        created_at: updatedBundle.created_at,
        completed_at: updatedBundle.completed_at,
        notes: updatedBundle.notes,
        applicant: updatedBundle.applicants?.[0],
        template: updatedBundle.onboarding_templates?.[0],
        company: updatedBundle.companies?.[0],
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Unexpected error in PUT /api/onboarding/bundles/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
