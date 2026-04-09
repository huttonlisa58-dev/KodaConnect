/**
 * JSON Form Package Types
 *
 * These types define the structure of form packages exported by Claude
 * during the offline PDF preprocessing workflow.
 *
 * Coordinate system: top-left origin (y increases downward)
 * Units: PDF points (1/72 inch)
 */

import { FieldEntity } from './packet-engine';

// ─── Core Package Structure ─────────────────────────────────────────

export interface JsonFormPackage {
  form_package: JsonFormPackageMeta;
  sub_forms: JsonSubForm[];
  dedup_map?: Record<string, string[]>; // canonical_key → [field_ids]
}

export interface JsonFormPackageMeta {
  version: string;
  form_name?: string;
  company?: string;
  pdf_template?: string;           // original filename
  total_pages: number;
  page_sizes: Record<string, [number, number]>; // "1" → [612, 792]
  coordinate_system?: 'top-left';
  units?: 'points';
  render_mode?: 'generated' | 'replica';  // generated = clean PDF from content, replica = overlay on original PDF
  choice_groups?: JsonChoiceGroup[];
  /**
   * Per-form document upload types. When present, the applicant flow shows a
   * "Document Upload" step with these document categories.
   *
   * IMPORTANT: This is PER-FORM — only include in the JSON package if this
   * specific form requires document uploads. Do NOT copy from other packages.
   * Forms without this field will not show a document upload step.
   */
  document_types?: { id: string; label: string; required?: boolean; description?: string }[];
  /** Set true to hide the document upload step entirely (overrides document_types) */
  hide_document_uploads?: boolean;
  /** RN evaluator signature (base64 data URI) for auto-populating RN signature fields */
  rn_evaluator_signature?: string;
  /** RN evaluator initials for PDF table pre-fill (e.g., "K.A") */
  rn_evaluator_initials?: string;
  /** RN evaluator full name */
  rn_evaluator_name?: string;
  /** RN license number */
  rn_license_number?: string;
  /** Participant name field ID (for CHW forms) */
  participant_name_field?: string;
  /** CHW name field ID */
  chw_name_field?: string;
  /** CHW phone field ID */
  chw_phone_field?: string;
  /** Exam grading sub-metadata */
  metadata?: {
    auto_grade?: boolean;
    passing_score?: number;
    total_questions?: number;
    answer_key?: Record<string, string>;
    /** Per-question explanations for correct answers (shown in office portal scoring guide) */
    answer_explanations?: Record<string, string>;
    /** Enable retake flow for applicants who fail */
    retake_enabled?: boolean;
    /** Tutorial content shown to applicants before retake */
    retake_tutorial?: { title: string; content: string }[];
    /** When true, section_groups must be completed in order and quizzes must be passed before advancing */
    sequential_sections?: boolean;
    /** Certificate generation config */
    certificate_config?: Record<string, any>;
    /** Staff-initiated workflow type (e.g., "staff_initiated") */
    workflow?: string;
    /** Enable phone-based client lookup for staff-initiated forms */
    phone_lookup?: boolean;
  };
  /** Ordered list of section groups for progress tracking and sequential gating */
  section_group_order?: { key: string; label: string }[];
}

export interface JsonChoiceGroup {
  id: string;
  label: string;
  options: {
    value: string;
    label: string;
    shows_subforms: string[];
  }[];
}

export interface JsonSubForm {
  id: string;
  name: string;
  title?: string;
  pages: number[];
  always_show?: boolean;
  choice_group?: string;
  choice_value?: string;
  /** Static document content — either an HTML string or structured paragraphs [{type, text}] */
  content?: string | { type?: string; text: string }[];
  /** AI-generated 2-3 sentence summary for "Quick Review" mode */
  summary?: string;
  fields: JsonFormField[];
  /** Hide entire section from applicant flow (e.g., office copies) */
  hidden_from_applicant?: boolean;
  /** Auto-copy field values from another sub-form */
  auto_copy_from?: string;
  /** Repeating group metadata for "Add More" UI */
  repeating_groups?: JsonRepeatingGroup[];
  /** Section group key for progress indicator grouping */
  section_group?: string;
  /** Human-readable label for the section group */
  section_group_label?: string;
  /** Whether the content block should be collapsible */
  content_collapsible?: boolean;
  /** Short summary for collapsed content */
  content_summary?: string;
  /** PDF mode for unified packages: "generated" for clean PDF from content, "replica" for overlay on original PDF */
  pdf_mode?: 'generated' | 'replica';
}

export interface JsonRepeatingGroup {
  group_id: string;
  instance_keys: string[];
  min_visible: number;
  labels: Record<number, string>;
  fields_per_instance?: string[];
  add_label?: string;
}

export interface JsonFormField {
  id: string;
  label: string;
  type: JsonFieldType;
  entity: JsonEntityType;
  page: number;
  pos: JsonFieldPosition;
  required: boolean;
  options?: { value: string; label: string }[];
  rows?: { value: string; label: string; row_id?: string }[];
  columns?: { value: string; label: string; col_id?: string }[];
  /** Hide from applicant (auto-fill on backend) */
  hidden?: boolean;
  /** Auto-fill this field's value from another field */
  auto_fill_from?: string;
  /** Transform the auto-filled value (e.g., "last_4" to extract last 4 digits of SSN) */
  transform?: string;
  /** Concatenate multiple source fields into this field's value */
  concatenate_from?: string[];
  /** Separator for concatenation (default: ", ") */
  concatenate_separator?: string;
  /** Default value for pre-filling (e.g., for radio buttons) */
  default_value?: string;
  /** Correct answer for auto-graded exam questions */
  correct_answer?: string;
  /** Auto-populate with RN evaluator signature during PDF generation */
  auto_populate_rn?: boolean;
  /** Repeating group this field belongs to */
  _group?: string;
  /** Instance index within the repeating group */
  _instance?: number;
  /** Initially hidden — revealed by "Add More" */
  _initially_hidden?: boolean;
  placeholder?: string;
  help_text?: string;
  /** Conditional visibility — show this field only when another field has a specific value */
  show_if?: { field: string; equals: string | boolean };
  /** Validation rules (e.g., min_selections for checkbox_group) */
  validation?: { min_selections?: number; max_selections?: number; min_length?: number; max_length?: number; pattern?: string; min?: number; max?: number };
  /** Pre-fill date fields with today's date */
  default_today?: boolean;
  /** Pre-fill time fields with current time */
  default_now?: boolean;
  /** Mark as date-of-birth field (never auto-fill with today) */
  is_dob?: boolean;
  /** Select All group: when checked, toggles all fields with matching 'group' value */
  select_all_group?: string;
  /** Group membership for Select All functionality */
  group?: string;
  /** Semantic type for cross-section auto-fill (e.g., "applicant_full_name", "applicant_ssn") */
  semantic_type?: string;
  /** Signer role controlling field visibility: "applicant" (default), "hr_admin", "rn_evaluator" */
  signer_role?: string;
}

export interface JsonFieldPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type JsonFieldType =
  | 'text' | 'email' | 'phone' | 'date' | 'time' | 'number'
  | 'textarea' | 'signature'
  | 'checkbox' | 'checkbox_group' | 'checkbox_grid'
  | 'radio' | 'select' | 'file_upload';

export type JsonEntityType =
  | 'employee' | 'patient' | 'caregiver'
  | 'emergency_contact' | 'employer'
  | 'physician' | 'agency'
  | 'insurance' | 'shared' | 'unknown'
  | string; // Allow extended entity types — mapEntityType maps them to known FieldEntity values

// ─── Validation ─────────────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  package?: JsonFormPackage;
}

/** Map JSON entity types to packet-engine FieldEntity types */
export function mapEntityType(entity: JsonEntityType): FieldEntity {
  const map: Record<JsonEntityType, FieldEntity> = {
    employee: 'caregiver',
    patient: 'patient',
    caregiver: 'caregiver',
    emergency_contact: 'emergency_contact',
    employer: 'unknown',      // no direct mapping, treated as unknown
    physician: 'physician',
    agency: 'agency',
    insurance: 'insurance',
    shared: 'shared',
    unknown: 'unknown',
  };
  return map[entity] || 'unknown';
}

/** Validate a JSON form package structure */
export function validateJsonPackage(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [{ path: '', message: 'Package must be an object' }] };
  }

  const pkg = data as Record<string, unknown>;

  // Validate form_package metadata
  if (!pkg.form_package || typeof pkg.form_package !== 'object') {
    errors.push({ path: 'form_package', message: 'Missing form_package metadata' });
  } else {
    const meta = pkg.form_package as Record<string, unknown>;
    if (!meta.version) errors.push({ path: 'form_package.version', message: 'Missing version' });
    if (!meta.total_pages || typeof meta.total_pages !== 'number' || meta.total_pages < 1) {
      errors.push({ path: 'form_package.total_pages', message: 'total_pages must be a positive number' });
    }
    if (!meta.page_sizes || typeof meta.page_sizes !== 'object') {
      errors.push({ path: 'form_package.page_sizes', message: 'Missing page_sizes' });
    }
    // coordinate_system is optional, defaults to 'top-left'
  }

  // Validate sub_forms
  if (!Array.isArray(pkg.sub_forms) || pkg.sub_forms.length === 0) {
    errors.push({ path: 'sub_forms', message: 'Must have at least one sub_form' });
  } else {
    const allFieldIds = new Set<string>();

    for (let i = 0; i < pkg.sub_forms.length; i++) {
      const sf = pkg.sub_forms[i] as Record<string, unknown>;
      const prefix = `sub_forms[${i}]`;

      if (!sf.id || typeof sf.id !== 'string') {
        errors.push({ path: `${prefix}.id`, message: 'Missing or invalid sub_form id' });
      }
      if (!sf.name || typeof sf.name !== 'string') {
        errors.push({ path: `${prefix}.name`, message: 'Missing sub_form name' });
      }
      if (!Array.isArray(sf.pages) || sf.pages.length === 0) {
        errors.push({ path: `${prefix}.pages`, message: 'Must have at least one page' });
      }
      if (!Array.isArray(sf.fields)) {
        errors.push({ path: `${prefix}.fields`, message: 'fields must be an array' });
      } else {
        for (let j = 0; j < sf.fields.length; j++) {
          const field = sf.fields[j] as Record<string, unknown>;
          const fp = `${prefix}.fields[${j}]`;

          if (!field.id || typeof field.id !== 'string') {
            errors.push({ path: `${fp}.id`, message: 'Missing field id' });
          } else if (allFieldIds.has(field.id as string)) {
            errors.push({ path: `${fp}.id`, message: `Duplicate field id: ${field.id}` });
          } else {
            allFieldIds.add(field.id as string);
          }

          if (!field.label || typeof field.label !== 'string') {
            errors.push({ path: `${fp}.label`, message: 'Missing field label' });
          }
          if (!field.type || typeof field.type !== 'string') {
            errors.push({ path: `${fp}.type`, message: 'Missing field type' });
          }
          // pos is required for replica mode but optional for generated mode
          if (field.pos && typeof field.pos === 'object') {
            const pos = field.pos as Record<string, unknown>;
            for (const key of ['x', 'y', 'w', 'h']) {
              if (typeof pos[key] !== 'number' || (pos[key] as number) < 0) {
                errors.push({ path: `${fp}.pos.${key}`, message: `pos.${key} must be a non-negative number` });
              }
            }
          }
        }
      }
    }
  }

  // Validate dedup_map (optional but must be valid if present)
  if (pkg.dedup_map && typeof pkg.dedup_map === 'object') {
    const map = pkg.dedup_map as Record<string, unknown>;
    for (const [key, value] of Object.entries(map)) {
      if (!Array.isArray(value)) {
        errors.push({ path: `dedup_map.${key}`, message: 'Dedup map values must be arrays of field IDs' });
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], package: data as JsonFormPackage };
}
