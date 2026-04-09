import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { fillSubFormPdf, combineFilledPdfs } from '@/lib/packet-pdf-fill';

export const dynamic = 'force-dynamic';

interface PacketFieldMapping {
  pool_field_id: string;
  target_label: string;
  position: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    font_size?: number;
  };
}

interface SubFormWithMappings {
  sub_form_id: string;
  name: string;
  page_range: [number, number];
  template_url: string;
  is_reference_only: boolean;
  field_mappings: PacketFieldMapping[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { submission_id } = body;

    if (!submission_id) {
      return NextResponse.json(
        { error: 'submission_id is required' },
        { status: 400 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { error: 'packet id is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch the packet definition (sub_forms is JSONB on form_packets)
    const { data: packet, error: packetError } = await supabase
      .from('form_packets')
      .select('*')
      .eq('packet_id', id)
      .single();

    if (packetError || !packet) {
      console.error('Packet fetch error:', packetError);
      return NextResponse.json(
        { error: 'Packet not found' },
        { status: 404 }
      );
    }

    // Parse sub_forms from JSONB
    const subForms: SubFormWithMappings[] = Array.isArray(packet.sub_forms)
      ? packet.sub_forms
      : JSON.parse(packet.sub_forms || '[]');

    // Fetch the submission and its form data from form_submissions
    const { data: submission, error: submissionError } = await supabase
      .from('form_submissions')
      .select('form_data, applicant_id, created_at')
      .eq('submission_id', submission_id)
      .single();

    if (submissionError || !submission) {
      console.error('Submission fetch error:', submissionError);
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      );
    }

    // Fetch applicant name separately
    let applicantName = 'applicant';
    if (submission.applicant_id) {
      const { data: applicant } = await supabase
        .from('applicants')
        .select('full_name')
        .eq('id', submission.applicant_id)
        .single();
      if (applicant?.full_name) {
        applicantName = applicant.full_name;
      }
    }

    // Parse form data
    let formData: Record<string, unknown> = {};
    if (submission.form_data) {
      if (typeof submission.form_data === 'string') {
        formData = JSON.parse(submission.form_data);
      } else {
        formData = submission.form_data as Record<string, unknown>;
      }
    }

    // Generate filled PDFs for non-reference sub-forms
    const filledPdfs: { pdfBytes: Uint8Array }[] = [];
    const pdfNames: string[] = [];

    for (const subForm of subForms) {
      // Skip reference-only forms
      if (subForm.is_reference_only) {
        console.log(`Skipping reference-only form: ${subForm.name}`);
        continue;
      }

      try {
        // Fetch the template PDF
        const templateResponse = await fetch(subForm.template_url);
        if (!templateResponse.ok) {
          console.error(
            `Failed to fetch template for ${subForm.name}: ${templateResponse.statusText}`
          );
          continue;
        }

        const templateBytes = new Uint8Array(await templateResponse.arrayBuffer());

        // Fill the PDF with form data
        const filledBytes = await fillSubFormPdf(
          templateBytes,
          formData,
          subForm.field_mappings,
          {
            applicantName,
            submissionDate: submission.created_at,
          }
        );

        filledPdfs.push({ pdfBytes: filledBytes });
        pdfNames.push(subForm.name);
      } catch (err) {
        console.error(`Error filling sub-form ${subForm.name}:`, err);
        // Continue with next sub-form instead of failing completely
      }
    }

    if (filledPdfs.length === 0) {
      return NextResponse.json(
        { error: 'No PDFs were generated successfully' },
        { status: 500 }
      );
    }

    // Combine all filled PDFs into one document
    const combinedPdfBytes = await combineFilledPdfs(filledPdfs);

    // Generate filename using local date (not toISOString)
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const safeApplicantName = applicantName.replace(/\s+/g, '_');
    const safePacketName = (packet.packet_name || 'packet').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${safePacketName}_${safeApplicantName}_${dateStr}.pdf`;

    // Return the combined PDF as binary
    return new NextResponse(Buffer.from(combinedPdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Combined PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate combined PDF' },
      { status: 500 }
    );
  }
}
