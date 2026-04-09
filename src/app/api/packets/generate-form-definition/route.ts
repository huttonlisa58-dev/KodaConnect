import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Option C: Form definition is structured by sub-form (mirrors the original PDF).
 * Each section = one sub-form from the packet, with fields in document order.
 * Duplicate fields are tracked via a dedup_links map for auto-fill.
 * Legal text is stored in the section's content field.
 * Only full_name, phone, and signatures are required.
 */

interface AnalyzedField {
  extracted_id: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
  help_text?: string;
  options?: Array<{ value: string; label: string }>;
  rows?: Array<{ row_id: string; label: string }>;
  columns?: Array<{ col_id: string; label: string }>;
  page_number: number;
  position?: { x: number; y: number; width: number; height: number };
  entity?: string;
  cell_positions?: Array<{
    row_id: string;
    col_id: string;
    position: { x: number; y: number; width: number; height: number };
  }>;
}

interface AnalyzedSubForm {
  sub_form_id: string;
  name: string;
  page_count: number;
  page_numbers: number[];
  fields: AnalyzedField[];
  legal_text?: string;
  boilerplate_sections: string[];
  reference_only: boolean;
}

interface FieldPositionEntry {
  label: string;
  positions: Array<{
    page: number; // 0-indexed for pdf-lib
    x: number;
    y: number;
    width: number;
    height: number;
    font_size: number;
  }>;
  cell_positions?: Array<{
    row_id: string;
    col_id: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

interface FieldPositionMap {
  [fieldId: string]: FieldPositionEntry;
}

/**
 * Dedup link: maps a field_id to the "primary" field_id that it gets auto-filled from
 */
interface DedupLinks {
  [fieldId: string]: {
    auto_fill_from: string; // The primary field_id to copy the value from
    original_label: string; // The label as it appeared in this sub-form
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<any>> {
  try {
    const body = await request.json();
    const { packetName, analyzedSubForms, templatePdfBase64 } = body;
    const companyId = body.companyId || null;

    if (!packetName || !analyzedSubForms || !Array.isArray(analyzedSubForms)) {
      return NextResponse.json(
        { error: 'packetName and analyzedSubForms are required' },
        { status: 400 }
      );
    }

    if (analyzedSubForms.length === 0) {
      return NextResponse.json(
        { error: 'At least one sub-form must be analyzed' },
        { status: 400 }
      );
    }

    // =============================================
    // STEP 1: Build form sections from sub-forms (document order)
    // =============================================
    const sections: any[] = [];
    const fieldPositionMap: FieldPositionMap = {};
    const dedupLinks: DedupLinks = {};

    // Track which labels+entities we've seen (for auto-fill linking)
    // Key: "label_lowercase__entity" → first field_id that had this label
    const seenFields = new Map<string, { field_id: string; label: string }>();

    let sectionOrder = 0;

    for (const sf of analyzedSubForms as AnalyzedSubForm[]) {
      if (sf.reference_only) continue;

      const sectionId = `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const sectionFields: any[] = [];
      let fieldOrder = 0;

      for (const field of sf.fields) {
        const fieldId = field.extracted_id || `fld_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const entity = field.entity || 'unknown';
        const dedupKey = `${field.label.toLowerCase().trim()}__${entity}`;

        // Check if this is a duplicate field (same label + entity seen before)
        const previousField = seenFields.get(dedupKey);
        if (previousField) {
          // This is a duplicate — mark it for auto-fill from the first occurrence
          dedupLinks[fieldId] = {
            auto_fill_from: previousField.field_id,
            original_label: field.label,
          };
        } else {
          // First time seeing this label+entity — register it
          seenFields.set(dedupKey, { field_id: fieldId, label: field.label });
        }

        // Determine if this field should be required
        const isRequired = isRequiredField(field.label, field.type);

        sectionFields.push({
          field_id: fieldId,
          label: field.label,
          type: field.type,
          required: isRequired,
          placeholder: field.placeholder,
          help_text: field.help_text,
          options: field.options,
          rows: field.rows,
          columns: field.columns,
          order: fieldOrder++,
        });

        // Build position map: each field → its EXACT position on its EXACT page
        if (field.position) {
          const entry: FieldPositionEntry = {
            label: field.label,
            positions: [{
              page: field.page_number - 1, // Convert to 0-indexed
              x: Math.round(field.position.x * 10) / 10,
              y: Math.round(field.position.y * 10) / 10,
              width: Math.round(field.position.width * 10) / 10,
              height: Math.round(field.position.height * 10) / 10,
              font_size: determineFontSize(field.type, field.position.height),
            }],
          };

          // Include cell positions for grid fields (checkbox_grid, checkbox_matrix, etc.)
          if (field.cell_positions && field.cell_positions.length > 0) {
            entry.cell_positions = field.cell_positions.map(cp => ({
              row_id: cp.row_id,
              col_id: cp.col_id,
              page: field.page_number - 1, // 0-indexed
              x: Math.round(cp.position.x * 10) / 10,
              y: Math.round(cp.position.y * 10) / 10,
              width: Math.round(cp.position.width * 10) / 10,
              height: Math.round(cp.position.height * 10) / 10,
            }));
          }

          fieldPositionMap[fieldId] = entry;
        }
      }

      // Build the section (= one sub-form)
      sections.push({
        section_id: sectionId,
        title: sf.name,
        description: sf.page_numbers.length > 0
          ? `Pages ${sf.page_numbers.join('-')} of the original document`
          : undefined,
        content: sf.legal_text || undefined, // Legal text stored here
        order: sectionOrder++,
        fields: sectionFields,
      });
    }

    // =============================================
    // STEP 2: Create the form definition
    // =============================================
    const formId = `form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const formDefinition = {
      form_id: formId,
      form_name: `${packetName}`,
      version: '1.0',
      company_id: companyId || '',
      description: `Imported from PDF: ${packetName}`,
      status: 'published', // FIX: Changed from 'draft' — imported forms should be immediately usable
      sections,
      metadata: {
        packet_name: packetName,
        option_c_structure: true, // Flag that this uses sub-form-ordered structure
        dedup_links: dedupLinks, // Store auto-fill links in metadata
        total_sub_forms: (analyzedSubForms as AnalyzedSubForm[]).filter(sf => !sf.reference_only).length,
      },
    };

    // =============================================
    // STEP 3: Store in Supabase
    // =============================================
    const supabase = createServerSupabaseClient();

    const { error: formError } = await supabase
      .from('form_definitions')
      .insert({
        form_id: formDefinition.form_id,
        form_name: formDefinition.form_name,
        version: formDefinition.version,
        company_id: formDefinition.company_id || null,
        description: formDefinition.description,
        status: formDefinition.status,
        sections: formDefinition.sections,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (formError) {
      console.error('Error storing form definition:', formError);
      return NextResponse.json(
        { error: `Failed to store form definition: ${formError.message}` },
        { status: 500 }
      );
    }

    // =============================================
    // STEP 4: Create form_packets record with template + positions
    // FIX: Always create a packet (was previously conditional on having a template or positions,
    //       which caused generated-mode forms to have no packet — breaking Template Picker sync)
    // =============================================
    const hasTemplate = !!templatePdfBase64;
    const packetId = `pkt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const subFormsData = (analyzedSubForms as AnalyzedSubForm[]).map(sf => ({
      sub_form_id: sf.sub_form_id,
      name: sf.name,
      page_count: sf.page_count,
      page_numbers: sf.page_numbers,
      is_reference_only: sf.reference_only,
      field_count: sf.fields.length,
    }));

    const { error: packetError } = await supabase
      .from('form_packets')
      .insert({
        packet_id: packetId,
        company_id: companyId || null,
        packet_name: packetName,
        description: `Imported packet: ${packetName}`,
        master_form_id: formDefinition.form_id,
        sub_forms: subFormsData,
        template_pdf_base64: templatePdfBase64 || null,
        field_position_map: fieldPositionMap,
        status: 'published', // FIX: Changed from 'draft' — packets should be immediately usable
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (packetError) {
      console.error('Error storing form packet:', packetError);
      // FIX: Roll back the form_definition so we don't end up with orphaned definitions
      await supabase.from('form_definitions').delete().eq('form_id', formDefinition.form_id);
      console.error('Rolled back form_definition due to packet creation failure');
      return NextResponse.json(
        { error: `Import failed: could not create form packet. The form definition has been rolled back. Error: ${packetError.message}` },
        { status: 500 }
      );
    } else {
      console.log(`Created form_packets: ${packetId} with ${Object.keys(fieldPositionMap).length} field positions, ${Object.keys(dedupLinks).length} auto-fill links`);
    }

    // =============================================
    // STEP 5: Return response
    // =============================================
    return NextResponse.json({
      success: true,
      form_definition: formDefinition,
      packet_id: packetId, // Always present now (packet creation is unconditional)
      has_template: hasTemplate,
      dedup_links: dedupLinks,
      stats: {
        total_sub_forms: sections.length,
        total_fields: sections.reduce((sum: number, s: any) => sum + s.fields.length, 0),
        positioned_fields: Object.keys(fieldPositionMap).length,
        auto_fill_fields: Object.keys(dedupLinks).length,
      },
    });
  } catch (error) {
    console.error('Form definition generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate form definition' },
      { status: 500 }
    );
  }
}

/**
 * Determine if a field should be required (only name, phone, signatures)
 */
function isRequiredField(label: string, type: string): boolean {
  const lower = label.toLowerCase().trim();

  // Signatures and e-sign consent are required
  if (type === 'signature') return true;

  // Full name on the first form (Client Name, Name of Client, Full Name, Applicant Name)
  if (/^(full\s*name|name\s*of\s*client|client\s*name|applicant\s*name|your\s*name|print\s*name)$/i.test(lower)) {
    return true;
  }

  // Phone number
  if (/^(phone|phone\s*number|contact\s*phone|telephone)$/i.test(lower)) {
    return true;
  }

  // Everything else is optional
  return false;
}

/**
 * Determine appropriate font size based on field type and available height
 */
function determineFontSize(fieldType: string, heightPts: number): number {
  if (fieldType === 'signature') return 0;
  if (fieldType === 'checkbox' || fieldType === 'checkbox_group' || fieldType === 'radio') return 10;
  if (heightPts < 15) return 8;
  if (heightPts < 20) return 9;
  if (heightPts < 25) return 10;
  if (heightPts < 35) return 11;
  return 12;
}
