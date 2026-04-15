import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { validateJsonPackage, JsonFormPackage } from '@/lib/json-package-types';
import { validateFormPackage } from '@/lib/form-validation';
import { convertJsonPackageToAnalyzed, buildFieldPositionMap, FieldPositionCoords } from '@/lib/json-to-analyzed';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/packets/import-package
 *
 * Import a pre-processed JSON form package (from Claude offline workflow)
 * along with the original PDF template.
 *
 * Request body:
 * {
 *   json_package: JsonFormPackage,
 *   pdf_base64?: string,          // Base64-encoded PDF (required for replica and unified, optional for generated)
 *   render_mode: "generated" | "replica" | "unified",
 *   form_type?: "type_a" | "type_b",  // deprecated, maps to render_mode
 *   company_id?: string
 * }
 *
 * render_mode behavior:
 * - "generated": All sub-forms are generated (clean PDF). No positions needed.
 * - "replica": All sub-forms are replicas (overlay on PDF). Positions required. pdf_base64 required.
 * - "unified": Mixed mode. Each sub-form specifies its own pdf_mode. pdf_base64 required for replica sub-forms.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { json_package, pdf_base64, company_id } = body;

    // ─── Resolve render_mode (with backward compat for form_type) ───

    let render_mode: 'generated' | 'replica' | 'unified' = body.render_mode;
    if (!render_mode && body.form_type) {
      // Backward compat: map old form_type to new render_mode
      render_mode = body.form_type === 'type_a' ? 'replica' : 'generated';
    }

    // ─── Validate Inputs ─────────────────────────────────────────────

    if (!json_package) {
      return NextResponse.json(
        { error: 'json_package is required' },
        { status: 400 }
      );
    }

    if (!render_mode || !['generated', 'replica', 'unified'].includes(render_mode)) {
      return NextResponse.json(
        { error: 'render_mode must be "generated", "replica", or "unified"' },
        { status: 400 }
      );
    }

    if ((render_mode === 'replica' || render_mode === 'unified') && !pdf_base64) {
      return NextResponse.json(
        { error: `pdf_base64 is required for ${render_mode} render mode` },
        { status: 400 }
      );
    }

    // Validate JSON package structure (basic schema validation)
    const structureValidation = validateJsonPackage(json_package);
    if (!structureValidation.valid || !structureValidation.package) {
      return NextResponse.json(
        { error: 'Invalid JSON package structure', details: structureValidation.errors },
        { status: 400 }
      );
    }

    const pkg: JsonFormPackage = structureValidation.package;

    // ─── Auto-detect pdf_mode for unified packages ─────────────────────
    // If unified mode is selected but no sub-forms have pdf_mode set,
    // auto-detect: sub-forms whose fields have pos coordinates are "replica",
    // sub-forms without pos coordinates are "generated".
    if (render_mode === 'unified') {
      const hasAnyPdfMode = pkg.sub_forms.some(sf => sf.pdf_mode);
      if (!hasAnyPdfMode) {
        console.log('Unified mode: no sub-forms have pdf_mode set — auto-detecting...');
        for (const sf of pkg.sub_forms) {
          const fieldsWithPos = sf.fields.filter(
            (f: any) => f.pos && (f.pos.x || f.pos.y || f.pos.w || f.pos.h)
          );
          const posRatio = sf.fields.length > 0 ? fieldsWithPos.length / sf.fields.length : 0;
          // If >50% of fields have position data, it's a replica sub-form
          sf.pdf_mode = posRatio > 0.5 ? 'replica' : 'generated';
          console.log(`  ${sf.id}: ${fieldsWithPos.length}/${sf.fields.length} fields with pos → ${sf.pdf_mode}`);
        }
      }
    }

    // Validate form package completeness and semantic correctness
    const validation = validateFormPackage(json_package);
    if (!validation.valid) {
      // Errors indicate breaking issues — return 400
      return NextResponse.json(
        {
          error: 'Form package validation failed',
          errors: validation.errors,
          stats: validation.stats,
        },
        { status: 400 }
      );
    }

    // Log warnings if present (non-breaking issues)
    if (validation.warnings.length > 0) {
      console.warn(
        `Form package validation warnings for ${pkg.form_package.form_name || 'imported form'}:`,
        validation.warnings
      );
    }

    // Log validation stats
    console.log(
      `Form package validated: ${validation.stats.subFormCount} sub-forms, ` +
      `${validation.stats.fieldCount} fields, ${validation.stats.autoFillCount} auto-fill links, ` +
      `${validation.stats.showIfCount} conditional fields`
    );

    // ─── Resolve Company ID ──────────────────────────────────────────

    const supabase = createServerSupabaseClient();
    let resolvedCompanyId = company_id;

    if (!resolvedCompanyId || resolvedCompanyId === 'default' || resolvedCompanyId.length < 36) {
      const { data: companies } = await supabase
        .from('companies')
        .select('id')
        .limit(1)
        .single();
      if (companies) {
        resolvedCompanyId = companies.id;
      }
    }

    // ─── Convert JSON → AnalyzedSubForms ─────────────────────────────

    const analyzedSubForms = convertJsonPackageToAnalyzed(pkg);

    // ─── Build Form Definition (document-order sections) ─────────────

    const formId = `form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sections: any[] = [];
    const dedupLinks: Record<string, { auto_fill_from: string; original_label: string }> = {};
    const seenFields = new Map<string, { field_id: string; label: string }>();

    let sectionOrder = 0;

    for (let sfIdx = 0; sfIdx < analyzedSubForms.length; sfIdx++) {
      const sf = analyzedSubForms[sfIdx];
      const originalSf = pkg.sub_forms[sfIdx]; // Access content/summary from original JSON
      if (sf.reference_only) continue;

      // Determine pdf_mode for this sub-form (for unified mode)
      let subFormPdfMode: 'generated' | 'replica' = render_mode === 'unified'
        ? (originalSf?.pdf_mode || 'generated')
        : render_mode === 'replica'
        ? 'replica'
        : 'generated';

      const sectionId = `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const sectionFields: any[] = [];
      let fieldOrder = 0;

      for (const field of sf.fields) {
        const fieldId = field.extracted_id || `fld_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const entity = field.entity || 'unknown';
        const dedupKey = `${field.label.toLowerCase().trim()}__${entity}`;

        // Dedup: track first occurrence, link subsequent ones
        const previousField = seenFields.get(dedupKey);
        if (previousField) {
          dedupLinks[fieldId] = {
            auto_fill_from: previousField.field_id,
            original_label: field.label,
          };
        } else {
          seenFields.set(dedupKey, { field_id: fieldId, label: field.label });
        }

        // Use the JSON package's required flag if present, otherwise fall back to heuristic
        const isRequired = field.required !== undefined ? field.required : isRequiredField(field.label, field.type);

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
          // Pass through display metadata from JSON package
          ...(field.hidden && { hidden: true }),
          ...(field.auto_fill_from && { auto_fill_from: field.auto_fill_from }),
          ...(field.semantic_type && { semantic_type: field.semantic_type }),
          ...(field._group && { _group: field._group }),
          ...(field._instance !== undefined && { _instance: field._instance }),
          ...(field._initially_hidden && { _initially_hidden: true }),
          ...(field.show_if && { show_if: field.show_if }),
          ...(field.validation && { validation: field.validation }),
          // Date/time default metadata
          ...((field as any).default_today && { default_today: true }),
          ...((field as any).default_now && { default_now: true }),
          ...((field as any).is_dob && { is_dob: true }),
          // Select All group support for e-signature consent
          ...((field as any).select_all_group && { select_all_group: (field as any).select_all_group }),
          ...((field as any).group && { group: (field as any).group }),
          // Staff sign-off role (FIX: was missing — signer_role was dropped during import)
          ...((field as any).signer_role && { signer_role: (field as any).signer_role }),
          // Auto-fill transform (e.g. "last_4" for SSN extraction)
          ...((field as any).transform && { transform: (field as any).transform }),
          // Concatenation support for composite fields (e.g. city/state/zip)
          ...((field as any).concatenate_from && { concatenate_from: (field as any).concatenate_from }),
          ...((field as any).concatenate_separator && { concatenate_separator: (field as any).concatenate_separator }),
          // Default value for pre-selecting radio/select options
          ...((field as any).default_value !== undefined && { default_value: (field as any).default_value }),
          // RN evaluator signature auto-population flag
          ...((field as any).auto_populate_rn && { auto_populate_rn: true }),
          // Exam grading: correct answer for auto-graded test questions
          ...((field as any).correct_answer && { correct_answer: (field as any).correct_answer }),
          // Mobile form text size override (sm/base/lg/xl)
          ...((field as any).text_size && { text_size: (field as any).text_size }),
          // Always render in generated PDF even when empty (shows '--')
          ...((field as any).always_render && { always_render: true }),
          // Field rotation for rotated template pages (e.g. WH-4 Indiana form at -90°)
          ...((field as any).rotation !== undefined && { rotation: (field as any).rotation }),
        });
      }

      sections.push({
        section_id: sectionId,
        title: sf.name,
        description: undefined, // Page references removed — not useful in applicant view
        content: normalizeContent(originalSf?.content),
        summary: originalSf?.summary || undefined,
        order: sectionOrder++,
        fields: sectionFields,
        // Pass through section-level metadata
        ...(originalSf?.hidden_from_applicant && { hidden_from_applicant: true }),
        ...(originalSf?.repeating_groups && { repeating_groups: originalSf.repeating_groups }),
        ...(originalSf?.section_group && { section_group: originalSf.section_group }),
        ...(originalSf?.section_group_label && { section_group_label: originalSf.section_group_label }),
        ...(originalSf?.content_collapsible && { content_collapsible: true }),
        ...(originalSf?.content_summary && { content_summary: originalSf.content_summary }),
        // Force page break before this section in generated PDF
        ...((originalSf as any)?.start_new_page && { start_new_page: true }),
        // For unified mode, store the pdf_mode for this sub-form; for replica sub-forms, set render_mode to web_form
        ...(render_mode === 'unified' && { pdf_mode: subFormPdfMode }),
        ...(subFormPdfMode === 'replica' && { render_mode: 'web_form' }),
      });
    }

    // ─── Build Field Position Map ────────────────────────────────────

    // For unified mode, only include field positions from replica sub-forms
    const fieldPositionMap = render_mode === 'unified'
      ? buildFieldPositionMapForUnified(pkg)
      : buildFieldPositionMap(pkg);

    // Convert to the format expected by generate-pdf (0-indexed pages, with font_size)
    const pdfFieldPositionMap: Record<string, any> = {};
    for (const [fieldId, entry] of Object.entries(fieldPositionMap)) {
      pdfFieldPositionMap[fieldId] = {
        label: entry.label,
        type: entry.type,
        positions: entry.positions.map((p: FieldPositionCoords) => ({
          page: Math.max(0, p.page - 1), // Convert to 0-indexed for pdf-lib (guard: never below 0)
          x: Math.round(p.x * 10) / 10,
          y: Math.round(p.y * 10) / 10,
          width: Math.round(p.width * 10) / 10,
          height: Math.round(p.height * 10) / 10,
          font_size: p.font_size || determineFontSize(entry.type, p.height),
          ...(p.rotation !== undefined && { rotation: p.rotation }),
        })),
        // Pass through option_positions for radio fields (already in bottom-left coords)
        ...(entry.option_positions && { option_positions: entry.option_positions }),
      };
    }

    // ─── Build Form Definition Object ────────────────────────────────

    const formName = pkg.form_package.form_name
      || pkg.form_package.pdf_template?.replace(/\.pdf$/i, '')
      || 'Imported Form';

    const formDefinition = {
      form_id: formId,
      form_name: formName,
      version: '1.0',
      company_id: resolvedCompanyId || '',
      description: `Imported from pre-processed package: ${formName}`,
      status: 'published',
      sections,
      metadata: {
        packet_name: formName,
        render_mode,
        import_source: 'json_package',
        dedup_links: dedupLinks,
        total_sub_forms: analyzedSubForms.filter(sf => !sf.reference_only).length,
        page_sizes: pkg.form_package.page_sizes,
        choice_groups: pkg.form_package.choice_groups || [],
        // For unified mode, add merge_output and render_mode flags
        ...(render_mode === 'unified' && { merge_output: true }),
        ...(pkg.form_package.section_group_order && { section_group_order: pkg.form_package.section_group_order }),
        // Per-form document upload types — ONLY included if this specific JSON package defines them.
        // Each form controls its own document_types independently. Do NOT inherit from other forms.
        ...(pkg.form_package.document_types?.length && { document_types: pkg.form_package.document_types }),
        // Hide document upload step entirely (overrides document_types)
        ...(pkg.form_package.hide_document_uploads && { hide_document_uploads: true }),
        // RN evaluator metadata — for auto-populating RN fields during PDF generation
        ...(pkg.form_package.rn_evaluator_signature && { rn_evaluator_signature: pkg.form_package.rn_evaluator_signature }),
        ...(pkg.form_package.rn_evaluator_initials && { rn_evaluator_initials: pkg.form_package.rn_evaluator_initials }),
        ...(pkg.form_package.rn_evaluator_name && { rn_evaluator_name: pkg.form_package.rn_evaluator_name }),
        ...(pkg.form_package.rn_license_number && { rn_license_number: pkg.form_package.rn_license_number }),
        // CHW field mappings — needed for participant_name/id extraction on submit
        ...(pkg.form_package.participant_name_field && { participant_name_field: pkg.form_package.participant_name_field }),
        ...((pkg.form_package as any).participant_id_field && { participant_id_field: (pkg.form_package as any).participant_id_field }),
        ...(pkg.form_package.chw_name_field && { chw_name_field: pkg.form_package.chw_name_field }),
        ...(pkg.form_package.chw_phone_field && { chw_phone_field: pkg.form_package.chw_phone_field }),
        // Exam grading metadata (auto_grade, passing_score, total_questions, answer_key)
        ...(pkg.form_package.metadata?.auto_grade && {
          auto_grade: true,
          passing_score: pkg.form_package.metadata.passing_score ?? 70,
          total_questions: pkg.form_package.metadata.total_questions,
          answer_key: pkg.form_package.metadata.answer_key,
        }),
        // Sequential sections gating (must pass quiz before advancing to next section group)
        ...(pkg.form_package.metadata?.sequential_sections && { sequential_sections: true }),
        // Retake flow metadata (tutorial content shown to applicants who fail)
        ...(pkg.form_package.metadata?.retake_enabled && {
          retake_enabled: true,
          retake_tutorial: pkg.form_package.metadata.retake_tutorial || [],
        }),
        // Certificate config
        ...(pkg.form_package.metadata?.certificate_config && {
          certificate_config: pkg.form_package.metadata.certificate_config,
        }),
        // Staff-initiated workflow metadata (for client-facing forms)
        ...(pkg.form_package.metadata?.workflow && {
          workflow: pkg.form_package.metadata.workflow,
        }),
        ...(pkg.form_package.metadata?.phone_lookup && {
          phone_lookup: true,
        }),
        // Also store as form_package sub-object for client-side access
        form_package: {
          ...(pkg.form_package.participant_name_field && { participant_name_field: pkg.form_package.participant_name_field }),
          ...((pkg.form_package as any).participant_id_field && { participant_id_field: (pkg.form_package as any).participant_id_field }),
          ...(pkg.form_package.chw_name_field && { chw_name_field: pkg.form_package.chw_name_field }),
          ...(pkg.form_package.chw_phone_field && { chw_phone_field: pkg.form_package.chw_phone_field }),
        },
      },
    };

    // ─── Store in Supabase ───────────────────────────────────────────

    // Insert form definition
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
        metadata: formDefinition.metadata,
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

    // Insert form packet with template PDF and field positions
    const packetId = `pkt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const subFormsData = analyzedSubForms.map(sf => ({
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
        company_id: resolvedCompanyId || null,
        packet_name: formName,
        description: `Imported from pre-processed package`,
        master_form_id: formDefinition.form_id,
        sub_forms: subFormsData,
        template_pdf_base64: pdf_base64 || null,
        field_position_map: pdfFieldPositionMap,
        page_sizes: pkg.form_package.page_sizes,
        import_source: 'json_package',
        render_mode,
        status: 'published', // FIX: Changed from 'draft' — must be 'published' per form_packets_status_check constraint
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
    }

    // ─── Return Success ──────────────────────────────────────────────

    console.log(`Imported package: form=${formDefinition.form_id}, packet=${packetId}, ` +
      `${sections.length} sections, ${Object.keys(pdfFieldPositionMap).length} positioned fields, ` +
      `${Object.keys(dedupLinks).length} auto-fill links`);

    return NextResponse.json({
      success: true,
      form_id: formDefinition.form_id,
      packet_id: packetId,
      render_mode,
      stats: buildStats(sections, pdfFieldPositionMap, dedupLinks),
    });

  } catch (error) {
    console.error('Import package error:', error);
    return NextResponse.json(
      { error: 'Failed to import package' },
      { status: 500 }
    );
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function buildStats(
  sections: any[],
  fieldPositionMap: Record<string, any>,
  dedupLinks: Record<string, any>
) {
  return {
    total_sub_forms: sections.length,
    total_fields: sections.reduce((sum: number, s: any) => sum + s.fields.length, 0),
    positioned_fields: Object.keys(fieldPositionMap).length,
    auto_fill_fields: Object.keys(dedupLinks).length,
  };
}

function isRequiredField(label: string, type: string): boolean {
  if (type === 'signature') return true;
  const lower = label.toLowerCase().trim();
  if (/^(full\s*name|name\s*of\s*client|client\s*name|applicant\s*name|your\s*name|print\s*name|last\s*name|first\s*name|first)$/i.test(lower)) {
    return true;
  }
  if (/^(phone|phone\s*number|contact\s*phone|telephone)$/i.test(lower)) return true;
  return false;
}

function determineFontSize(fieldType: string, heightPts: number): number {
  if (fieldType === 'signature') return 0;
  if (['checkbox', 'checkbox_group', 'radio'].includes(fieldType)) return 10;
  if (heightPts < 15) return 8;
  if (heightPts < 20) return 9;
  if (heightPts < 25) return 10;
  if (heightPts < 35) return 11;
  return 12;
}

/**
 * Normalize sub-form content to an HTML string.
 * Content can be either:
 * - A string (already HTML) — pass through as-is
 * - An array of paragraph objects [{type, text}] — convert to HTML paragraphs
 * - undefined/null — return undefined
 */
function normalizeContent(content: unknown): string | undefined {
  if (!content) return undefined;

  // Already an HTML string
  if (typeof content === 'string') return content;

  // Array of structured content blocks (e.g., [{type: "paragraph", text: "..."}])
  if (Array.isArray(content)) {
    const html = content
      .map((block: any) => {
        if (typeof block === 'string') return `<p>${block}</p>`;
        if (block && typeof block === 'object' && block.text) {
          const tag = block.type === 'heading' ? 'h3' : 'p';
          return `<${tag}>${block.text}</${tag}>`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
    return html || undefined;
  }

  // Unknown format — try to stringify safely
  return String(content);
}

/**
 * Build field position map for unified mode packages.
 * Only includes fields from sub-forms with pdf_mode: "replica".
 * Generated sub-forms don't contribute field positions.
 */
function buildFieldPositionMapForUnified(
  pkg: JsonFormPackage
): Record<string, any> {
  const fullMap = buildFieldPositionMap(pkg);
  const filteredMap: Record<string, any> = {};

  // Identify replica sub-form IDs
  const replicaSubFormIds = new Set<string>();
  for (const sf of pkg.sub_forms) {
    if (sf.pdf_mode === 'replica') {
      replicaSubFormIds.add(sf.id);
    }
  }

  // Filter positions to only include those from replica sub-forms
  for (const [fieldId, entry] of Object.entries(fullMap)) {
    const filteredPositions = (entry as any).positions.filter((pos: any) =>
      replicaSubFormIds.has(pos.sub_form_id)
    );

    // Only include field if it has at least one position from a replica sub-form
    if (filteredPositions.length > 0) {
      filteredMap[fieldId] = {
        ...(entry as any),
        positions: filteredPositions,
      };
    }
  }

  return filteredMap;
}
