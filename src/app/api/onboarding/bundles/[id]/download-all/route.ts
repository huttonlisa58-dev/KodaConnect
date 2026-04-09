import { createServerSupabaseClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// Note: The actual ZIP creation would require archiver or JSZip
// This is a stub implementation that shows the logic flow

interface DownloadAllResponse {
  success: boolean;
  message: string;
  bundle_id?: string;
  submission_count?: number;
}

/**
 * POST /api/onboarding/bundles/[id]/download-all
 * Download all form submissions as PDFs bundled in a ZIP file
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const bundleId = params.id;

    // Fetch bundle with applicant and template info
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
        ),
        onboarding_templates:template_id (
          id,
          name,
          state
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

    // Fetch all template packets for this template
    const { data: templatePackets, error: packetsError } = await supabase
      .from('template_packets')
      .select(
        `
        id,
        form_packet_id,
        render_mode,
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

    // Collect all form submissions for this applicant and template
    const submissions = [];

    for (const templatePacket of templatePackets || []) {
      const { data: submission, error: submissionError } = await supabase
        .from('form_submissions')
        .select(
          `
          id,
          applicant_id,
          form_id,
          status,
          data,
          submitted_at,
          form_packets:form_id (
            id,
            name
          )
        `
        )
        .eq('applicant_id', bundle.applicant_id)
        .eq('form_id', templatePacket.form_packet_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (submission && submission.status !== 'draft') {
        submissions.push({
          submission_id: submission.id,
          packet_name: templatePacket.form_packets?.[0]?.name || 'Unknown',
          render_mode: templatePacket.render_mode,
          form_data: submission.data,
          submitted_at: submission.submitted_at,
          status: submission.status,
        });
      }
    }

    if (submissions.length === 0) {
      return NextResponse.json<DownloadAllResponse>(
        {
          success: true,
          message: 'No submitted forms to download',
          bundle_id: bundleId,
          submission_count: 0,
        },
        { status: 200 }
      );
    }

    // TODO: Generate PDFs and create ZIP file
    // Implementation steps:
    // 1. Initialize a new ZIP archive using archiver or JSZip:
    //    const archive = archiver('zip', { zlib: { level: 9 } });
    //
    // 2. For each submission, generate the appropriate PDF:
    //    - If render_mode is "flat_layout", call generateFlatLayoutPdf(formData)
    //    - If render_mode is "template_overlay", call generateTemplateOverlayPdf(formData)
    //    - See /lib/pdf/generators.ts for these functions
    //
    // 3. Add each generated PDF to the ZIP with a descriptive filename:
    //    archive.append(pdfBuffer, {
    //      name: `${packet_name}_${submission_id}.pdf`
    //    });
    //
    // 4. Finalize the archive and get the buffer:
    //    const buffer = await archive.finalize();
    //
    // 5. Return the ZIP file as a downloadable response:
    //    response.headers.set(
    //      'Content-Disposition',
    //      `attachment; filename="${applicant_fullname}_${template_name}_${bundleId}.zip"`
    //    );
    //    response.headers.set('Content-Type', 'application/zip');
    //    return new NextResponse(buffer, { status: 200, headers: response.headers });

    console.log(`TODO: Generate PDFs for ${submissions.length} submissions`);
    console.log(`TODO: Use generateFlatLayoutPdf or generateTemplateOverlayPdf`);
    console.log(`TODO: Bundle PDFs into ZIP file using archiver or JSZip`);
    console.log(`TODO: Return ZIP as downloadable response`);
    console.log('TODO: Submissions to process:', submissions);

    // Placeholder response indicating what would be done
    return NextResponse.json<DownloadAllResponse>(
      {
        success: true,
        message: 'PDF generation and ZIP creation not yet implemented',
        bundle_id: bundleId,
        submission_count: submissions.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/onboarding/bundles/[id]/download-all:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
}

/**
 * GET /api/onboarding/bundles/[id]/download-all
 * (Optional) Get information about available downloads without creating the file
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const bundleId = params.id;

    // Fetch bundle info
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
          last_name
        ),
        onboarding_templates:template_id (
          id,
          name
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

    // Count available submissions
    const { data: templatePackets } = await supabase
      .from('template_packets')
      .select('form_packet_id')
      .eq('template_id', bundle.template_id);

    let submissionCount = 0;
    for (const packet of templatePackets || []) {
      const { count } = await supabase
        .from('form_submissions')
        .select('id', { count: 'exact' })
        .eq('applicant_id', bundle.applicant_id)
        .eq('form_id', packet.form_packet_id)
        .not('status', 'eq', 'draft');

      if (count) submissionCount += count;
    }

    return NextResponse.json(
      {
        bundle_id: bundleId,
        applicant_name: `${bundle.applicants?.[0]?.first_name} ${bundle.applicants?.[0]?.last_name}`,
        template_name: bundle.onboarding_templates?.[0]?.name,
        available_submissions: submissionCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in GET /api/onboarding/bundles/[id]/download-all:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
}
