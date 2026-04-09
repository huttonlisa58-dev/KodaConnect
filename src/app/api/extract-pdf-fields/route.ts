import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface ExtractedField {
  name: string;
  type: string;
  value?: string | boolean;
  options?: string[];
}

function mapPdfFieldType(fieldType: string): string {
  // Map PDF field types to our form field types
  const typeMap: Record<string, string> = {
    'PDFTextField': 'text',
    'PDFCheckBox': 'checkbox',
    'PDFRadioGroup': 'radio',
    'PDFDropdown': 'select',
    'PDFSignature': 'signature',
    'PDFOptionList': 'select',
  };
  return typeMap[fieldType] || 'text';
}

function inferFieldTypeFromName(name: string): string {
  const nameLower = name.toLowerCase();

  if (nameLower.includes('signature') || nameLower.includes('_es_:signer')) {
    return 'signature';
  }
  if (nameLower.includes('date') || nameLower.includes('dob')) {
    return 'date';
  }
  if (nameLower.includes('phone') || nameLower.includes('tel')) {
    return 'phone';
  }
  if (nameLower.includes('email')) {
    return 'email';
  }
  if (nameLower.includes('ssn') || nameLower.includes('social security')) {
    return 'ssn';
  }
  if (nameLower.includes('initial')) {
    return 'initial';
  }

  return 'text';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { template_id, pdf_base64 } = body;

    if (!template_id || !pdf_base64) {
      return NextResponse.json(
        { error: 'template_id and pdf_base64 are required' },
        { status: 400 }
      );
    }

    // Decode base64 to Uint8Array
    const pdfBytes = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0));

    // Load PDF with pdf-lib
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    const extractedFields: ExtractedField[] = [];

    for (const field of fields) {
      const name = field.getName();
      const type = field.constructor.name;

      const extractedField: ExtractedField = {
        name,
        type: mapPdfFieldType(type),
      };

      // Get additional info based on field type
      try {
        if (type === 'PDFTextField') {
          const textField = form.getTextField(name);
          const value = textField.getText();
          if (value) extractedField.value = value;

          // Check if field name suggests a specific type
          extractedField.type = inferFieldTypeFromName(name);
        } else if (type === 'PDFCheckBox') {
          const checkbox = form.getCheckBox(name);
          extractedField.value = checkbox.isChecked();
        } else if (type === 'PDFDropdown') {
          const dropdown = form.getDropdown(name);
          extractedField.options = dropdown.getOptions();
          extractedField.type = 'select';
        } else if (type === 'PDFRadioGroup') {
          const radioGroup = form.getRadioGroup(name);
          extractedField.options = radioGroup.getOptions();
          extractedField.type = 'radio';
        }
      } catch (e) {
        console.error(`Error processing field ${name}:`, e);
      }

      extractedFields.push(extractedField);
    }

    // Create detected_fields structure from PDF fields
    const detectedFields = extractedFields.map((field, index) => ({
      field_key: field.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      field_type: field.type,
      label: formatFieldLabel(field.name),
      page_numbers: [1], // PDF form fields don't specify pages
      is_required: false, // Can be updated by developer
      similar_labels: [field.name],
      options: field.options,
      approved: true, // Auto-approve for fillable PDFs
      pdf_field_name: field.name, // Store original PDF field name for filling
    }));

    // Update the template with extracted fields
    const supabase = createServerSupabaseClient();

    const { error: updateError } = await supabase
      .from('document_templates')
      .update({
        pdf_form_fields: extractedFields,
        detected_fields: {
          detected_fields: detectedFields,
          raw_fields_by_page: [{ page: 1, fields: extractedFields }],
          status: 'pending_review',
        },
        detection_status: 'pending_review',
        updated_at: new Date().toISOString(),
      })
      .eq('id', template_id);

    if (updateError) {
      console.error('Failed to save extracted fields:', updateError);
      return NextResponse.json(
        { error: 'Failed to save extracted fields' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      template_id,
      total_fields: extractedFields.length,
      fields: extractedFields,
      detected_fields: detectedFields,
    });

  } catch (error) {
    console.error('PDF field extraction error:', error);
    return NextResponse.json(
      { error: 'Failed to extract PDF fields' },
      { status: 500 }
    );
  }
}

function formatFieldLabel(fieldName: string): string {
  // Convert PDF field names to human-readable labels
  // Remove common suffixes like _es_:signer:signature
  let label = fieldName
    .replace(/_es_:signer:signature/gi, '')
    .replace(/_es_:signer/gi, '')
    .replace(/[_-]/g, ' ')
    .trim();

  // Capitalize first letter of each word
  label = label
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return label || fieldName;
}
