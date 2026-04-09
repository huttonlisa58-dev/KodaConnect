import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { FieldPositionMap } from '@/lib/pdf/types';
import { generateTemplateOverlayPdf } from '@/lib/pdf/template-overlay';
import { generateFlatLayoutPdf } from '@/lib/pdf/flat-layout';
import { PDFDocument } from 'pdf-lib';

export const dynamic = 'force-dynamic';

/**
 * Sanitize a filename for use in Content-Disposition headers.
 * Replaces non-ASCII characters (em-dash, en-dash, etc.) with ASCII equivalents.
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[\u2014\u2013]/g, '-')  // em-dash, en-dash → hyphen
    .replace(/[\u2018\u2019]/g, "'")  // smart quotes → apostrophe
    .replace(/[\u201C\u201D]/g, '"')  // smart double quotes → quote
    .replace(/[^\x20-\x7E]/g, '_');   // any remaining non-ASCII → underscore
}

/**
 * Option C: Each field maps to EXACTLY one position on one page.
 * No data bleeding — field_id → single position entry.
 * dedup_links are handled at form-fill time (auto-fill), not at PDF overlay time.
 * Server-side auto-fill fallback ensures replica fields are populated for PDF overlay.
 */

/**
 * POST /api/forms/[id]/generate-pdf
 * Generate a filled PDF from a form submission.
 * Option C: Each field has one position → no data bleeding.
 *
 * For unified packages (render_mode === 'unified'):
 *   1. Generates flat-layout PDF for generated sub-form sections
 *   2. Generates template-overlay PDF for replica sub-form sections
 *   3. Merges them into a single combined PDF
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formId } = await params;
    const body = await request.json();
    const { submission_data, applicant_name, signature_metadata } = body;

    if (!submission_data) {
      return NextResponse.json(
        { error: 'submission_data is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Load the form definition
    const { data: formDef, error: formError } = await supabase
      .from('form_definitions')
      .select('*')
      .eq('form_id', formId)
      .single();

    if (formError || !formDef) {
      return NextResponse.json(
        { error: 'Form not found', details: formError?.message },
        { status: 404 }
      );
    }

    // Check if there's a packet template for this form
    const { data: packet, error: packetError } = await supabase
      .from('form_packets')
      .select('packet_id, template_pdf_base64, field_position_map, sub_forms')
      .eq('master_form_id', formId)
      .maybeSingle();

    // Determine render mode from form metadata
    const renderMode = formDef.metadata?.render_mode || 'generated';

    // ─── UNIFIED MODE: Generate combined PDF with both pipelines ───
    if (renderMode === 'unified' && packet && packet.template_pdf_base64 && packet.field_position_map) {
      console.log(`Generating unified PDF for form ${formId} (packet: ${packet.packet_id})`);

      // Split sections into generated vs replica based on pdf_mode
      const allSections = formDef.sections || [];
      const generatedSections = allSections.filter(
        (s: any) => !s.pdf_mode || s.pdf_mode === 'generated'
      );
      const replicaSections = allSections.filter(
        (s: any) => s.pdf_mode === 'replica'
      );

      const pdfParts: Uint8Array[] = [];

      // Read RN evaluator signature from form metadata (for auto_populate_rn fields)
      const rnSignatureMetadata = formDef.metadata?.rn_evaluator_signature
        ? { signature_base64: formDef.metadata.rn_evaluator_signature }
        : undefined;

      // Part 1: Generate flat-layout PDF for generated sections
      if (generatedSections.length > 0) {
        const generatedFormDef = {
          ...formDef,
          sections: generatedSections,
        };
        const flatResponse = await generateFlatLayoutPdf(
          generatedFormDef,
          submission_data,
          applicant_name,
          signature_metadata,
          rnSignatureMetadata
        );
        const flatBytes = new Uint8Array(await flatResponse.arrayBuffer());
        pdfParts.push(flatBytes);
        console.log(`  Generated flat-layout PDF: ${generatedSections.length} sections`);
      }

      // Part 2: Generate template-overlay PDF for replica sections
      if (replicaSections.length > 0) {
        // Server-side auto-fill fallback: ensure replica fields have values
        // even if the client-side auto-fill chain didn't propagate them.
        const resolvedData = resolveAutoFillForOverlay(submission_data, allSections, replicaSections);

        const overlayResponse = await generateTemplateOverlayPdf(
          packet.template_pdf_base64,
          packet.field_position_map as FieldPositionMap,
          resolvedData,
          applicant_name,
          formDef.form_name,
          signature_metadata
        );
        const overlayBytes = new Uint8Array(await overlayResponse.arrayBuffer());
        pdfParts.push(overlayBytes);
        console.log(`  Generated template-overlay PDF: ${replicaSections.length} sections`);
      }

      // Merge all PDF parts into one document
      if (pdfParts.length === 0) {
        return NextResponse.json(
          { error: 'No PDF content generated' },
          { status: 500 }
        );
      }

      if (pdfParts.length === 1) {
        // Only one part — return directly
        return new NextResponse(Buffer.from(pdfParts[0]), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${sanitizeFilename(formDef.form_name || 'form')}.pdf"`,
          },
        });
      }

      // Merge multiple PDF parts
      const mergedDoc = await PDFDocument.create();
      for (const pdfBytes of pdfParts) {
        try {
          const srcDoc = await PDFDocument.load(pdfBytes);
          const copiedPages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
          copiedPages.forEach(page => mergedDoc.addPage(page));
        } catch (mergeErr) {
          console.error('Error merging PDF part:', mergeErr);
        }
      }

      const mergedBytes = await mergedDoc.save();
      console.log(`  Merged unified PDF: ${mergedDoc.getPageCount()} total pages`);

      return new NextResponse(Buffer.from(mergedBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${sanitizeFilename(formDef.form_name || 'form')}.pdf"`,
        },
      });
    }

    // ─── REPLICA MODE: Use template overlay ───
    if (renderMode === 'replica' && packet && packet.template_pdf_base64 && packet.field_position_map) {
      console.log(`Using packet template overlay for form ${formId} (packet: ${packet.packet_id})`);
      const allSections = formDef.sections || [];
      const resolvedData = resolveAutoFillForOverlay(submission_data, allSections, allSections);
      return await generateTemplateOverlayPdf(
        packet.template_pdf_base64,
        packet.field_position_map as FieldPositionMap,
        resolvedData,
        applicant_name,
        formDef.form_name,
        signature_metadata
      );
    }

    // ─── GENERATED MODE: Flat layout PDF ───
    console.log(`Generating flat layout PDF for form ${formId}`);
    const rnSigMeta = formDef.metadata?.rn_evaluator_signature
      ? { signature_base64: formDef.metadata.rn_evaluator_signature }
      : undefined;
    return await generateFlatLayoutPdf(formDef, submission_data, applicant_name, signature_metadata, rnSigMeta);
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * Server-side auto-fill fallback for replica (template overlay) fields.
 *
 * The client-side MobileFormWizard resolves auto_fill_from chains during form filling.
 * However, if the client didn't propagate values (e.g., field was hidden, section wasn't
 * reached, or auto-fill chain broke), replica fields end up empty in submission_data.
 * This causes blank spots on the generated PDF.
 *
 * This function fills in missing values by:
 * 1. Resolving auto_fill_from references (e.g., "applicant_info__signature" → copy that value)
 * 2. Applying default_today for date fields that are still empty
 * 3. Building full_name from first_name + last_name if needed
 * 4. Propagating the first available signature to all empty signature fields in replica sections
 */
function resolveAutoFillForOverlay(
  submissionData: Record<string, any>,
  allSections: any[],
  replicaSections: any[]
): Record<string, any> {
  const resolved = { ...submissionData };
  const todayStr = new Date().toISOString().split('T')[0];

  // Build a flat lookup of all fields across ALL sections (source fields may be in generated sections)
  const allFieldsMap = new Map<string, any>();
  for (const section of allSections) {
    for (const field of section.fields || []) {
      allFieldsMap.set(field.field_id, field);
    }
  }

  // Find the first available signature from submission data (for global signature propagation)
  let globalSignature: string | null = null;
  for (const section of allSections) {
    for (const field of section.fields || []) {
      if (field.type === 'signature') {
        const val = resolved[field.field_id];
        if (val && typeof val === 'string' && val.startsWith('data:image')) {
          globalSignature = val;
          break;
        }
      }
    }
    if (globalSignature) break;
  }

  // Build full_name from common patterns if not already in submission data
  let fullName: string | null = null;
  const fullNamePatterns = ['applicant_info__full_name', 'full_name'];
  for (const key of fullNamePatterns) {
    if (resolved[key] && typeof resolved[key] === 'string') {
      fullName = resolved[key];
      break;
    }
  }
  if (!fullName) {
    // Try to construct from first_name + last_name
    const firstNamePatterns = ['applicant_info__first_name', 'first_name'];
    const lastNamePatterns = ['applicant_info__last_name', 'last_name'];
    let firstName = '';
    let lastName = '';
    for (const key of firstNamePatterns) {
      if (resolved[key] && typeof resolved[key] === 'string') { firstName = resolved[key]; break; }
    }
    for (const key of lastNamePatterns) {
      if (resolved[key] && typeof resolved[key] === 'string') { lastName = resolved[key]; break; }
    }
    if (firstName || lastName) {
      fullName = `${firstName} ${lastName}`.trim();
    }
  }

  let fieldsResolved = 0;

  // Now resolve missing replica fields
  for (const section of replicaSections) {
    for (const field of section.fields || []) {
      const fieldId = field.field_id;
      const currentValue = resolved[fieldId];
      const isEmpty = currentValue === undefined || currentValue === null || currentValue === '';

      if (!isEmpty) continue; // Field already has a value

      // 1. Resolve auto_fill_from reference
      if (field.auto_fill_from) {
        const sourceValue = resolved[field.auto_fill_from];
        if (sourceValue !== undefined && sourceValue !== null && sourceValue !== '') {
          resolved[fieldId] = sourceValue;
          fieldsResolved++;
          continue;
        }
        // Special handling: auto_fill_from references "full_name" or similar
        if (field.auto_fill_from.includes('full_name') && fullName) {
          resolved[fieldId] = fullName;
          fieldsResolved++;
          continue;
        }
      }

      // 2. Apply default_today for empty date fields
      if (field.type === 'date' && field.default_today) {
        resolved[fieldId] = todayStr;
        fieldsResolved++;
        continue;
      }

      // 3. Propagate global signature to empty signature fields
      //    Only apply to applicant fields — skip hr_admin and rn_evaluator
      //    signature fields so they remain blank until signed by staff.
      if (field.type === 'signature' && globalSignature
          && (field.signer_role || 'applicant') === 'applicant') {
        resolved[fieldId] = globalSignature;
        fieldsResolved++;
        continue;
      }

      // 4. Try to fill name fields from fullName
      if (field.type === 'text' && fullName) {
        const labelLower = (field.label || '').toLowerCase();
        if (labelLower.includes('employee name') || labelLower.includes('print name') ||
            labelLower.includes('name (print') || labelLower.includes('full name')) {
          resolved[fieldId] = fullName;
          fieldsResolved++;
          continue;
        }
      }
    }
  }

  if (fieldsResolved > 0) {
    console.log(`  Server-side auto-fill resolved ${fieldsResolved} missing replica field(s)`);
  }

  return resolved;
}
