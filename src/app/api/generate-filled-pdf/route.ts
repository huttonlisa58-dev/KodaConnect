import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1 minute for PDF generation

interface SubmissionData {
  [key: string]: string | boolean | string[];
}

interface DocumentField {
  field_key: string;
  field_type: string;
  label: string;
  pdf_field_name?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { submission_id } = body;

    if (!submission_id) {
      return NextResponse.json(
        { error: 'submission_id is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Get submission with template data
    const { data: submission, error: submissionError } = await supabase
      .from('submissions')
      .select(`
        *,
        template:document_templates(
          id,
          name,
          pdf_url,
          is_fillable_pdf,
          pdf_form_fields
        ),
        applicant:applicants(
          first_name,
          last_name,
          phone
        )
      `)
      .eq('id', submission_id)
      .single();

    if (submissionError || !submission) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      );
    }

    // Get document fields for this template
    const { data: fields } = await supabase
      .from('document_fields')
      .select('*')
      .eq('template_id', submission.template_id)
      .order('sort_order');

    const template = submission.template;

    if (!template || !template.pdf_url) {
      return NextResponse.json(
        { error: 'Template PDF not found' },
        { status: 404 }
      );
    }

    // Fetch the original PDF
    const pdfResponse = await fetch(template.pdf_url);
    if (!pdfResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch template PDF' },
        { status: 500 }
      );
    }

    const pdfBytes = await pdfResponse.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Parse submission data
    const submissionData: SubmissionData = typeof submission.form_data === 'string'
      ? JSON.parse(submission.form_data)
      : submission.form_data || {};

    // If this is a fillable PDF, fill in the form fields
    if (template.is_fillable_pdf) {
      await fillPdfFormFields(pdfDoc, submissionData, fields || []);
    }

    // Add signature image if present
    if (submission.signature_data?.signature) {
      await addSignatureToLastPage(pdfDoc, submission.signature_data.signature);
    }

    // Save the filled PDF
    const filledPdfBytes = await pdfDoc.save();

    // Return the PDF as a download
    const applicantName = submission.applicant
      ? `${submission.applicant.first_name}_${submission.applicant.last_name}`
      : 'applicant';

    const filename = `${template.name.replace(/[^a-zA-Z0-9]/g, '_')}_${applicantName}_filled.pdf`;

    return new NextResponse(Buffer.from(filledPdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate filled PDF' },
      { status: 500 }
    );
  }
}

async function fillPdfFormFields(
  pdfDoc: PDFDocument,
  data: SubmissionData,
  fields: DocumentField[]
): Promise<void> {
  const form = pdfDoc.getForm();

  for (const field of fields) {
    const pdfFieldName = field.pdf_field_name || field.field_key;
    const value = data[field.field_key];

    if (value === undefined || value === null) continue;

    try {
      // Try to fill the field based on its type
      switch (field.field_type) {
        case 'text':
        case 'textarea':
        case 'phone':
        case 'email':
        case 'ssn':
        case 'date':
        case 'number':
        case 'currency':
          try {
            const textField = form.getTextField(pdfFieldName);
            textField.setText(String(value));
          } catch {
            // Field might not exist or be a different type
            console.log(`Could not fill text field: ${pdfFieldName}`);
          }
          break;

        case 'checkbox':
          try {
            const checkbox = form.getCheckBox(pdfFieldName);
            if (value === true || value === 'true' || value === 'yes') {
              checkbox.check();
            } else {
              checkbox.uncheck();
            }
          } catch {
            console.log(`Could not fill checkbox field: ${pdfFieldName}`);
          }
          break;

        case 'radio':
          try {
            const radioGroup = form.getRadioGroup(pdfFieldName);
            if (typeof value === 'string') {
              radioGroup.select(value);
            }
          } catch {
            console.log(`Could not fill radio field: ${pdfFieldName}`);
          }
          break;

        case 'select':
          try {
            const dropdown = form.getDropdown(pdfFieldName);
            if (typeof value === 'string') {
              dropdown.select(value);
            }
          } catch {
            console.log(`Could not fill dropdown field: ${pdfFieldName}`);
          }
          break;

        case 'signature':
        case 'initial':
          // Signatures are handled separately with image embedding
          break;
      }
    } catch (err) {
      console.error(`Error filling field ${pdfFieldName}:`, err);
    }
  }

  // Flatten the form to make fields non-editable
  form.flatten();
}

async function addSignatureToLastPage(
  pdfDoc: PDFDocument,
  signatureBase64: string
): Promise<void> {
  try {
    // Get the last page
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();

    // Decode the signature image (assuming it's a PNG data URL)
    const signatureData = signatureBase64.replace(/^data:image\/\w+;base64,/, '');
    const signatureBytes = Uint8Array.from(atob(signatureData), c => c.charCodeAt(0));

    // Embed the signature image
    const signatureImage = await pdfDoc.embedPng(signatureBytes);

    // Calculate signature dimensions (max 200x80, maintaining aspect ratio)
    const maxWidth = 200;
    const maxHeight = 80;
    const imgDims = signatureImage.scale(1);
    const ratio = Math.min(maxWidth / imgDims.width, maxHeight / imgDims.height);
    const sigWidth = imgDims.width * ratio;
    const sigHeight = imgDims.height * ratio;

    // Position signature at bottom right of last page
    const x = width - sigWidth - 50;
    const y = 50;

    // Draw the signature
    lastPage.drawImage(signatureImage, {
      x,
      y,
      width: sigWidth,
      height: sigHeight,
    });

    // Add a label below the signature
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    lastPage.drawText('Applicant Signature', {
      x: x + (sigWidth / 2) - 40,
      y: y - 15,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });

  } catch (err) {
    console.error('Error adding signature to PDF:', err);
    // Continue without signature if it fails
  }
}

// GET endpoint for direct download via URL
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const submissionId = searchParams.get('submission_id');

  if (!submissionId) {
    return NextResponse.json(
      { error: 'submission_id is required' },
      { status: 400 }
    );
  }

  // Reuse POST logic
  const fakeRequest = {
    json: async () => ({ submission_id: submissionId }),
  } as NextRequest;

  return POST(fakeRequest);
}
