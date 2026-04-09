/**
 * API Endpoint: Generate Combined PDF from Package Submissions
 * POST /api/packages/[packageId]/generate-combined-pdf
 *
 * Takes an array of submission IDs belonging to sub-forms in a package,
 * generates individual PDFs for each, applies signatures, and merges them
 * into a single combined document.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 120s for multi-PDF generation and merging

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { FieldPositionMap } from '@/lib/pdf/types';
import { generateTemplateOverlayPdf } from '@/lib/pdf/template-overlay';
import { generateFlatLayoutPdf } from '@/lib/pdf/flat-layout';
import { mergePdfs, applySignatureOverlay, SignaturePlacement } from '@/lib/pdf/merge-pdfs';

/**
 * POST /api/packages/[packageId]/generate-combined-pdf
 *
 * Generate a combined PDF from multiple form submissions in a package.
 * Each submission is rendered individually, then all PDFs are merged.
 *
 * Request body:
 * {
 *   submission_ids: string[]  // Array of submission IDs to include
 * }
 *
 * Response: PDF binary data with Content-Type: application/pdf
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  try {
    const { packageId } = await params;
    const body = await request.json();
    const { submission_ids } = body;

    // ── Validate inputs ──
    if (!packageId) {
      return NextResponse.json(
        { error: 'Package ID is required' },
        { status: 400 }
      );
    }

    if (!submission_ids || !Array.isArray(submission_ids) || submission_ids.length === 0) {
      return NextResponse.json(
        { error: 'submission_ids array is required and must contain at least one ID' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // ── Fetch package metadata ──
    const { data: packageData, error: packageError } = await supabase
      .from('form_packets')
      .select('packet_id, master_form_id, template_pdf_base64, field_position_map')
      .eq('packet_id', packageId)
      .maybeSingle();

    if (packageError || !packageData) {
      console.log(`Package ${packageId} not found or error:`, packageError);
      return NextResponse.json(
        { error: 'Package not found', details: packageError?.message },
        { status: 404 }
      );
    }

    // ── Fetch master form definition ──
    const { data: masterForm, error: formError } = await supabase
      .from('form_definitions')
      .select('*')
      .eq('form_id', packageData.master_form_id)
      .single();

    if (formError || !masterForm) {
      return NextResponse.json(
        { error: 'Master form not found', details: formError?.message },
        { status: 404 }
      );
    }

    // Determine render mode from master form metadata
    const renderMode = masterForm.metadata?.render_mode || 'generated';

    // ── Fetch all requested submissions ──
    const { data: submissions, error: submissionError } = await supabase
      .from('form_submissions')
      .select(`
        submission_id, form_id, form_data, applicant_id, participant_name, chw_name,
        signature_metadata,
        applicants:applicant_id(full_name),
        form_definitions:form_id(form_name)
      `)
      .in('submission_id', submission_ids);

    if (submissionError || !submissions) {
      return NextResponse.json(
        { error: 'Failed to fetch submissions', details: submissionError?.message },
        { status: 500 }
      );
    }

    if (submissions.length === 0) {
      return NextResponse.json(
        { error: 'No submissions found for the provided IDs' },
        { status: 404 }
      );
    }

    console.log(`Generating combined PDF: ${submissions.length} submissions for package ${packageId}`);

    // ── Generate individual PDFs ──
    const pdfBuffers: Uint8Array[] = [];
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const submission of submissions) {
      try {
        // Cast joined relations to access nested fields
        const applicant = submission.applicants as unknown as { full_name: string } | null;
        const formDef = submission.form_definitions as unknown as { form_name: string } | null;

        const applicantName = applicant?.full_name || submission.participant_name || submission.chw_name || 'Unknown';
        const formName = formDef?.form_name || 'Form';

        let pdfBytes: Uint8Array;

        // ── Determine which rendering method to use ──

        // If this is a replica mode form with a packet template, use template overlay
        if (renderMode === 'replica' && packageData.template_pdf_base64 && packageData.field_position_map) {
          console.log(`Rendering submission ${submission.submission_id} using template overlay`);

          // Note: generateTemplateOverlayPdf returns a NextResponse, so we need to extract the bytes
          const response = await generateTemplateOverlayPdf(
            packageData.template_pdf_base64,
            packageData.field_position_map as FieldPositionMap,
            submission.form_data,
            applicantName,
            formName,
            submission.signature_metadata
          );

          // Extract PDF bytes from NextResponse
          if (response.body) {
            pdfBytes = new Uint8Array(await response.arrayBuffer());
          } else {
            throw new Error('Failed to generate PDF: empty response');
          }
        } else {
          // Use flat layout (generated mode)
          console.log(`Rendering submission ${submission.submission_id} using flat layout PDF`);

          // Fetch the full form definition for this submission
          const { data: submissionFormDef, error: formDefError } = await supabase
            .from('form_definitions')
            .select('*')
            .eq('form_id', submission.form_id)
            .single();

          if (formDefError || !submissionFormDef) {
            throw new Error(`Form definition not found for form ${submission.form_id}`);
          }

          const response = await generateFlatLayoutPdf(
            submissionFormDef,
            submission.form_data,
            applicantName,
            submission.signature_metadata
          );

          // Extract PDF bytes from NextResponse
          if (response.body) {
            pdfBytes = new Uint8Array(await response.arrayBuffer());
          } else {
            throw new Error('Failed to generate PDF: empty response');
          }
        }

        pdfBuffers.push(pdfBytes);
        successCount++;
        console.log(`Successfully generated PDF for submission ${submission.submission_id}`);
      } catch (error) {
        errorCount++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Failed to generate PDF for submission ${submission.submission_id}:`, error);
        errors.push(`${submission.submission_id}: ${errorMsg}`);
      }
    }

    if (successCount === 0) {
      return NextResponse.json(
        {
          error: 'Failed to generate any PDFs',
          details: errors,
        },
        { status: 500 }
      );
    }

    console.log(`Generated ${successCount}/${submissions.length} PDFs successfully`);

    // ── Merge all PDFs ──
    let mergedPdfBytes: Uint8Array;
    try {
      mergedPdfBytes = await mergePdfs(pdfBuffers);
      console.log(`Successfully merged ${pdfBuffers.length} PDFs`);
    } catch (error) {
      console.error('Failed to merge PDFs:', error);
      return NextResponse.json(
        {
          error: 'Failed to merge PDFs',
          details: error instanceof Error ? error.message : String(error),
          partial_success: { generated: successCount, merged: 0, total: submissions.length },
        },
        { status: 500 }
      );
    }

    // ── Apply static signatures if defined in package metadata ──
    const packageSignatures = masterForm.metadata?.static_signatures || [];

    if (packageSignatures.length > 0) {
      try {
        console.log(`Applying ${packageSignatures.length} static signatures from package`);

        for (const signature of packageSignatures) {
          const { image_base64, placements } = signature;

          if (!image_base64 || !placements || placements.length === 0) {
            console.warn('Skipping invalid signature entry');
            continue;
          }

          // Convert placement format if needed
          const signaturePlacements: SignaturePlacement[] = placements.map((p: any) => ({
            page: p.page,
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
          }));

          try {
            mergedPdfBytes = await applySignatureOverlay(mergedPdfBytes, image_base64, signaturePlacements);
            console.log(`Applied signature overlay successfully`);
          } catch (overlayError) {
            console.error('Failed to apply signature overlay:', overlayError);
            // Continue with other signatures rather than failing entirely
          }
        }
      } catch (error) {
        console.error('Error processing package signatures:', error);
        // Don't fail the entire operation if signature application fails
      }
    }

    // ── Return merged PDF ──
    const safePackageName = packageData.packet_id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safePackageName}_combined.pdf`;

    return new NextResponse(Buffer.from(mergedPdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(mergedPdfBytes.length),
      },
    });
  } catch (error) {
    console.error('Generate combined PDF error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate combined PDF',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
