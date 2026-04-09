/**
 * JSON Package → AnalyzedSubForm Converter
 *
 * Bridges the JSON form package format (from Claude preprocessing)
 * to the existing AnalyzedSubForm format used by packet-engine.ts
 * for deduplication and master form generation.
 */

import { AnalyzedSubForm, AnalyzedField, FieldEntity } from './packet-engine';
import { JsonFormPackage, JsonSubForm, JsonFormField, mapEntityType } from './json-package-types';
import { topLeftToBottomLeft, getPageHeight } from './coordinate-utils';

/**
 * Convert a full JSON form package into AnalyzedSubForm[] compatible with
 * the existing deduplicateFields() and generateMasterFormDefinition() functions.
 *
 * Coordinates are converted from top-left (JSON/PyMuPDF) to bottom-left (pdf-lib).
 */
export function convertJsonPackageToAnalyzed(
  pkg: JsonFormPackage
): AnalyzedSubForm[] {
  const pageSizes = pkg.form_package.page_sizes;

  return pkg.sub_forms.map(sf => convertSubForm(sf, pageSizes));
}

/**
 * Convert a single JSON sub-form to an AnalyzedSubForm.
 */
function convertSubForm(
  sf: JsonSubForm,
  pageSizes: Record<string, [number, number]>
): AnalyzedSubForm {
  return {
    sub_form_id: sf.id,
    name: sf.name,
    page_count: sf.pages.length,
    page_numbers: sf.pages,
    fields: sf.fields.map(field => convertField(field, pageSizes)),
    boilerplate_sections: [],
    reference_only: false,
  };
}

/**
 * Convert a single JSON field to an AnalyzedField.
 * Converts position from top-left to bottom-left coordinates.
 */
function convertField(
  field: JsonFormField,
  pageSizes: Record<string, [number, number]>
): AnalyzedField {
  // Handle missing pos gracefully (generated mode doesn't need positions)
  let position = { x: 0, y: 0, width: 0, height: 0 };

  if (field.pos && (field.pos.x || field.pos.y || field.pos.w || field.pos.h)) {
    const pageHeight = getPageHeight(field.page, pageSizes);
    const bottomLeftPos = topLeftToBottomLeft(
      field.pos.x,
      field.pos.y,
      field.pos.w,
      field.pos.h,
      pageHeight
    );
    position = {
      x: bottomLeftPos.x,
      y: bottomLeftPos.y,
      width: bottomLeftPos.width,
      height: bottomLeftPos.height,
    };
  }

  const entity: FieldEntity = mapEntityType(field.entity);

  // Keep checkbox_grid as-is so it flows through to the form definition
  // The DynamicForm and MobileFormWizard renderers both support checkbox_grid
  const mappedType = field.type;

  return {
    extracted_id: field.id,
    label: field.label,
    type: mappedType as AnalyzedField['type'],
    required: field.required,
    page_number: field.page,
    position,
    entity,
    // Pass through optional fields if present — normalize string[] to {value,label}[]
    ...(field.options && { options: normalizeOptions(field.options) }),
    ...(field.rows && { rows: field.rows.map(r => ({ row_id: r.row_id || r.value, label: r.label })) }),
    ...(field.columns && { columns: field.columns.map(c => ({ col_id: c.col_id || c.value, label: c.label })) }),
    // Pass through display metadata from JSON package
    ...(field.hidden && { hidden: true }),
    ...(field.auto_fill_from && { auto_fill_from: field.auto_fill_from }),
    ...(field.transform && { transform: field.transform }),
    ...(field.concatenate_from && { concatenate_from: field.concatenate_from }),
    ...(field.concatenate_separator && { concatenate_separator: field.concatenate_separator }),
    ...(field.default_value !== undefined && { default_value: field.default_value }),
    ...(field.auto_populate_rn && { auto_populate_rn: true }),
    ...(field._group && { _group: field._group }),
    ...(field._instance !== undefined && { _instance: field._instance }),
    ...(field._initially_hidden && { _initially_hidden: true }),
    ...(field.show_if && { show_if: field.show_if }),
    ...(field.validation && { validation: field.validation }),
    // Date/time default metadata
    ...(field.default_today && { default_today: true }),
    ...(field.default_now && { default_now: true }),
    ...(field.is_dob && { is_dob: true }),
    // Select All group support for e-signature consent
    ...(field.select_all_group && { select_all_group: field.select_all_group }),
    ...(field.group && { group: field.group }),
    // Exam grading: correct answer for auto-graded test questions
    ...(field.correct_answer && { correct_answer: field.correct_answer }),
    // Always render in generated PDF even when empty
    ...((field as any).always_render && { always_render: true }),
    // Mobile form text size override
    ...((field as any).text_size && { text_size: (field as any).text_size }),
    // Staff sign-off role — controls visibility in applicant wizard and read-only in client view
    ...((field as any).signer_role && { signer_role: (field as any).signer_role }),
    // Semantic type for cross-section auto-fill (e.g. applicant_full_name)
    ...((field as any).semantic_type && { semantic_type: (field as any).semantic_type }),
    // Participant name field reference
    ...((field as any).placeholder && { placeholder: (field as any).placeholder }),
  };
}

/**
 * Normalize options from either string[] or {value,label}[] to {value,label}[].
 * Allows JSON packages to use shorthand string arrays like ["S", "U"].
 */
function normalizeOptions(options: any[]): { value: string; label: string }[] {
  return options.map(opt => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  });
}

/**
 * Build a field_position_map from the JSON package.
 * This maps each field to its PDF position(s) for the template overlay renderer.
 *
 * The positions are stored in bottom-left coordinates (matching packet-pdf-fill.ts).
 *
 * Returns a map compatible with the existing form_packets.field_position_map JSONB column.
 */
export function buildFieldPositionMap(
  pkg: JsonFormPackage
): Record<string, FieldPositionMapEntry> {
  const pageSizes = pkg.form_package.page_sizes;
  const map: Record<string, FieldPositionMapEntry> = {};

  for (const sf of pkg.sub_forms) {
    for (const field of sf.fields) {
      // Skip fields without valid positions (e.g. generated-only consent checkboxes)
      if (!field.pos || (!field.pos.x && !field.pos.y && !field.pos.w && !field.pos.h)) {
        continue;
      }

      const pageHeight = getPageHeight(field.page, pageSizes);
      const bottomLeftPos = topLeftToBottomLeft(
        field.pos.x,
        field.pos.y,
        field.pos.w,
        field.pos.h,
        pageHeight
      );

      // Convert option_positions from top-left to bottom-left if present
      // option_positions now store actual ☐ checkbox CENTER coordinates,
      // so we just flip y (no height subtraction needed for center points)
      let convertedOptionPositions: Record<string, { x: number; y: number }> | undefined;
      if ((field as any).option_positions) {
        convertedOptionPositions = {};
        for (const [optValue, optPos] of Object.entries((field as any).option_positions as Record<string, { x: number; y: number }>)) {
          convertedOptionPositions[optValue] = {
            x: optPos.x,
            y: pageHeight - optPos.y,
          };
        }
      }

      // If field already exists in map (dedup case), add another position
      if (map[field.id]) {
        map[field.id].positions.push({
          sub_form_id: sf.id,
          page: field.page,
          x: bottomLeftPos.x,
          y: bottomLeftPos.y,
          width: bottomLeftPos.width,
          height: bottomLeftPos.height,
          ...((field.pos as any).font_size && { font_size: (field.pos as any).font_size }),
          ...((field as any).rotation !== undefined && { rotation: (field as any).rotation }),
        });
      } else {
        // Convert ssn_positions from top-left to bottom-left if present
        let convertedSsnPositions: Record<string, { x: number; y: number; width: number; height: number }> | undefined;
        if ((field as any).ssn_positions) {
          convertedSsnPositions = {};
          for (const [group, gPos] of Object.entries((field as any).ssn_positions as Record<string, { x: number; y: number; w: number; h: number }>)) {
            const converted = topLeftToBottomLeft(gPos.x, gPos.y, gPos.w, gPos.h, pageHeight);
            convertedSsnPositions[group] = {
              x: converted.x,
              y: converted.y,
              width: converted.width,
              height: converted.height,
            };
          }
        }

        map[field.id] = {
          label: field.label,
          type: field.type,
          entity: field.entity,
          positions: [{
            sub_form_id: sf.id,
            page: field.page,
            x: bottomLeftPos.x,
            y: bottomLeftPos.y,
            width: bottomLeftPos.width,
            height: bottomLeftPos.height,
            ...((field.pos as any).font_size && { font_size: (field.pos as any).font_size }),
            ...((field as any).rotation !== undefined && { rotation: (field as any).rotation }),
          }],
          ...(convertedOptionPositions && { option_positions: convertedOptionPositions }),
          ...(convertedSsnPositions && { ssn_positions: convertedSsnPositions }),
        };
      }
    }
  }

  return map;
}

export interface FieldPositionMapEntry {
  label: string;
  type: string;
  entity: string;
  positions: FieldPositionCoords[];
  option_positions?: Record<string, { x: number; y: number }>;
  ssn_positions?: Record<string, { x: number; y: number; width: number; height: number }>;
}

export interface FieldPositionCoords {
  sub_form_id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  font_size?: number;
  rotation?: number;
}
