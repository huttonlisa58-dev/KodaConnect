/**
 * Form Engine - Core types and utilities for the dynamic form system
 */

export interface FormDefinition {
  form_id: string;
  form_name: string;
  version: string;
  company_id: string;
  doc_number?: string;
  description?: string;
  status: 'draft' | 'published' | 'archived';
  sections: FormSection[];
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface FormSection {
  section_id: string;
  title: string;
  description?: string;
  /** Static document content (policy text, legal language, etc.) displayed before fields */
  content?: string;
  /** AI-generated 2-3 sentence summary of the content for "Quick Review" mode */
  summary?: string;
  order: number;
  fields: FormField[];
  /** Hide entire section from applicant flow (e.g., office copies) */
  hidden_from_applicant?: boolean;
  /** Repeating group metadata for "Add More" UI */
  repeating_groups?: RepeatingGroup[];
  /** Section group key for progress indicator grouping */
  section_group?: string;
  /** Human-readable label for the section group */
  section_group_label?: string;
  /** Whether the content block should be collapsible */
  content_collapsible?: boolean;
  /** Short summary for collapsed content */
  content_summary?: string;
}

export interface RepeatingGroup {
  group_id: string;
  instance_keys: string[];
  min_visible: number;
  labels: Record<number, string>;
  fields_per_instance?: string[];
  add_label?: string;
}

/**
 * Semantic Type Taxonomy for Cross-Section Auto-Fill
 *
 * Each semantic_type categorizes a field for intelligent auto-population across form steps.
 * When a field with a semantic_type is encountered on a new screen, MobileFormWizard checks
 * if any previously filled field shares the same semantic_type and pre-populates the field.
 *
 * Standard semantic types:
 * - applicant_full_name, applicant_first_name, applicant_last_name
 * - applicant_ssn, applicant_dob
 * - applicant_address_line_1, applicant_city, applicant_state, applicant_zip
 * - applicant_phone, applicant_email
 * - applicant_signature
 * - employer_name, employer_address
 * - emergency_contact_name, emergency_contact_phone
 *
 * Custom semantic types can be created for domain-specific needs (e.g., "license_number").
 */

export interface FormField {
  field_id: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'date' | 'time' | 'number' | 'textarea' | 'signature' | 'checkbox' | 'checkbox_group' | 'checkbox_grid' | 'radio' | 'select' | 'file_upload';
  required: boolean;
  placeholder?: string;
  help_text?: string;
  options?: { value: string; label: string }[];
  // For checkbox_grid
  rows?: { row_id: string; label: string }[];
  columns?: { col_id: string; label: string }[];
  validation?: {
    pattern?: string;
    min_length?: number;
    max_length?: number;
    min_selections?: number;
    max_selections?: number;
    min?: number;
    max?: number;
  };
  show_if?: { field: string; equals: string | boolean };
  /** Layout for side-by-side field rendering in PDFs and forms.
   *  Fields with the same row number are rendered on the same line.
   *  width controls how much horizontal space the field takes. */
  layout?: {
    row?: number;
    width?: 'full' | 'half' | 'third' | 'quarter';
  };
  order: number;
  /** Hide from applicant (auto-fill on backend) */
  hidden?: boolean;
  /** Auto-fill this field's value from another field */
  auto_fill_from?: string;
  /** Semantic type for cross-section auto-fill (e.g., "applicant_full_name", "applicant_ssn").
   *  Used by MobileFormWizard to detect and pre-populate matching fields across screens. */
  semantic_type?: string;
  /** Repeating group this field belongs to */
  _group?: string;
  /** Instance index within the repeating group */
  _instance?: number;
  /** Initially hidden — revealed by "Add More" */
  _initially_hidden?: boolean;
  /** Who fills this field: applicant (default), rn_evaluator, or hr_admin.
   *  Staff-role fields are hidden from applicants and shown in office Review & Sign mode. */
  signer_role?: 'applicant' | 'rn_evaluator' | 'hr_admin';
  /** Override the default text input size on the mobile form.
   *  Maps to Tailwind classes: sm=14px, base=16px (default), lg=18px, xl=20px, 2xl=24px. */
  text_size?: 'sm' | 'base' | 'lg' | 'xl' | '2xl';
}

export interface FormSubmissionData {
  [fieldId: string]: string | boolean | string[] | Record<string, boolean> | null;
}

export interface ValidationError {
  field_id: string;
  label: string;
  message: string;
}

// ── Staff signer_role utilities ──────────────────────────────────────────

/** True when the field is a staff-role field (not applicant). */
export function isStaffField(field: FormField): boolean {
  return !!field.signer_role && field.signer_role !== 'applicant';
}

/** True when a signature field is assigned to a staff role. */
export function isStaffSignatureField(field: FormField): boolean {
  return field.type === 'signature' && isStaffField(field);
}

/** Return every field in the definition whose signer_role matches `role`. */
export function getStaffFields(
  definition: FormDefinition,
  role: 'rn_evaluator' | 'hr_admin',
): FormField[] {
  const result: FormField[] = [];
  for (const section of definition.sections) {
    for (const field of section.fields) {
      if (field.signer_role === role) {
        result.push(field);
      }
    }
  }
  return result;
}

/** Return the set of staff roles that have signable fields in this form. */
export function getRequiredSignerRoles(
  definition: FormDefinition,
): Array<'rn_evaluator' | 'hr_admin'> {
  const roles = new Set<'rn_evaluator' | 'hr_admin'>();
  for (const section of definition.sections) {
    for (const field of section.fields) {
      if (field.signer_role === 'rn_evaluator' || field.signer_role === 'hr_admin') {
        roles.add(field.signer_role);
      }
    }
  }
  return Array.from(roles);
}

/** Check whether all required staff fields for `role` have been filled in `formData`. */
export function hasAllRequiredStaffFields(
  formData: FormSubmissionData,
  definition: FormDefinition,
  role: 'rn_evaluator' | 'hr_admin',
): boolean {
  const fields = getStaffFields(definition, role);
  return fields.filter(f => f.required).every((field) => {
    const value = formData[field.field_id];
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'string' && value.trim().length === 0) return false;
    return true;
  });
}

/**
 * Validate a single field value against its definition
 */
export function validateField(field: FormField, value: unknown): string | null {
  // Check required
  if (field.required) {
    if (value === null || value === undefined || value === '') {
      return `${field.label} is required`;
    }
    if (Array.isArray(value) && value.length === 0) {
      return `${field.label} is required`;
    }
  }

  // If not required and empty, skip other validations
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return null;
  }

  const validation = field.validation;

  switch (field.type) {
    case 'email':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(value))) {
        return `${field.label} must be a valid email address`;
      }
      break;

    case 'phone':
      const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
      if (!phoneRegex.test(String(value).replace(/\D/g, ''))) {
        return `${field.label} must be a valid phone number`;
      }
      break;

    case 'date':
      const dateValue = new Date(String(value));
      if (isNaN(dateValue.getTime())) {
        return `${field.label} must be a valid date`;
      }
      break;

    case 'number':
      const numValue = Number(value);
      if (isNaN(numValue)) {
        return `${field.label} must be a valid number`;
      }
      if (validation?.min !== undefined && numValue < validation.min) {
        return `${field.label} must be at least ${validation.min}`;
      }
      if (validation?.max !== undefined && numValue > validation.max) {
        return `${field.label} must be no more than ${validation.max}`;
      }
      break;

    case 'text':
    case 'textarea':
      if (validation?.min_length && String(value).length < validation.min_length) {
        return `${field.label} must be at least ${validation.min_length} characters`;
      }
      if (validation?.max_length && String(value).length > validation.max_length) {
        return `${field.label} must be no more than ${validation.max_length} characters`;
      }
      if (validation?.pattern) {
        const regex = new RegExp(validation.pattern);
        if (!regex.test(String(value))) {
          return `${field.label} is invalid`;
        }
      }
      break;

    case 'checkbox_group':
    case 'checkbox_grid':
      const selectedCount = Array.isArray(value) ? value.filter(v => v).length : Object.values(value || {}).filter(v => v).length;
      if (validation?.min_selections && selectedCount < validation.min_selections) {
        return `${field.label} requires at least ${validation.min_selections} selection(s)`;
      }
      if (validation?.max_selections && selectedCount > validation.max_selections) {
        return `${field.label} allows a maximum of ${validation.max_selections} selection(s)`;
      }
      break;
  }

  return null;
}

/**
 * Validate entire form and return all errors.
 *
 * FIX 2026-03-01: Skips hidden_from_applicant sections, hidden fields, and
 * fields in un-expanded repeating group instances. Without this, server-side
 * validation could reject forms for fields the applicant never saw.
 */
export function validateForm(definition: FormDefinition, data: FormSubmissionData): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const section of definition.sections) {
    // Skip sections hidden from applicant (office-only copies, etc.)
    if ((section as any).hidden_from_applicant) continue;

    // Determine repeating group visibility from _draft_metadata or default
    const repeatingGroups: RepeatingGroup[] = (section as any).repeating_groups || [];

    for (const field of section.fields) {
      // Skip hidden fields (auto-filled on backend, never shown to applicant)
      if ((field as any).hidden) continue;

      // Skip staff-only fields — these are filled by office staff, not the
      // applicant. Validating them here would block client submissions when
      // the staff hasn't filled their portion yet.
      if (isStaffField(field)) continue;

      // Check conditional visibility
      if (field.show_if && !isFieldVisible(field, data)) {
        continue;
      }

      // Skip fields in un-expanded repeating group instances.
      // If the field belongs to a repeating group and its instance is beyond
      // what was visible, the applicant never saw it — don't require it.
      if ((field as any)._group && (field as any)._instance !== undefined) {
        const group = repeatingGroups.find(g => g.group_id === (field as any)._group);
        if (group) {
          const minVisible = group.min_visible || 1;
          // If instance is beyond min_visible AND the field has no value,
          // the user likely never expanded to see it — skip validation
          if ((field as any)._instance >= minVisible) {
            const fieldValue = data[field.field_id];
            const isEmpty = fieldValue === null || fieldValue === undefined || fieldValue === '';
            if (isEmpty) continue;
          }
        }
      }

      const fieldValue = data[field.field_id];
      const error = validateField(field, fieldValue);

      if (error) {
        errors.push({
          field_id: field.field_id,
          label: field.label,
          message: error,
        });
      }
    }
  }

  return errors;
}

/**
 * Check if a field should be visible based on show_if conditions
 */
export function isFieldVisible(field: FormField, formData: FormSubmissionData): boolean {
  if (!field.show_if) {
    return true;
  }

  const { field: conditionField, equals: conditionValue } = field.show_if;
  const fieldValue = formData[conditionField];

  return fieldValue === conditionValue;
}

/**
 * Get visible fields in a section based on form data
 */
export function getVisibleFields(section: FormSection, formData: FormSubmissionData): FormField[] {
  return section.fields.filter(field => isFieldVisible(field, formData));
}

/**
 * Create blank submission data from form definition
 */
export function createEmptySubmission(definition: FormDefinition): FormSubmissionData {
  const submission: FormSubmissionData = {};

  for (const section of definition.sections) {
    for (const field of section.fields) {
      switch (field.type) {
        case 'checkbox_group':
          submission[field.field_id] = [];
          break;
        case 'checkbox_grid':
          submission[field.field_id] = {};
          break;
        case 'checkbox':
          submission[field.field_id] = false;
          break;
        case 'number':
          submission[field.field_id] = null;
          break;
        case 'date': {
          // Only pre-fill dates that should default to today (e.g., visit_date).
          // DOB and appointment dates should NOT be pre-filled — the user must
          // enter them manually. Check the field's `default_today` flag, or
          // fall back to heuristics: skip fields whose ID contains "dob" or "birth".
          const fieldMeta = field as any;
          const shouldDefaultToday = fieldMeta.default_today === true;
          if (shouldDefaultToday) {
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            submission[field.field_id] = `${yyyy}-${mm}-${dd}`;
          } else {
            submission[field.field_id] = '';
          }
          break;
        }
        case 'time': {
          // Pre-fill time fields marked with default_now to the current time
          const timeMeta = field as any;
          if (timeMeta.default_now) {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            submission[field.field_id] = `${hh}:${min}`;
          } else {
            submission[field.field_id] = '';
          }
          break;
        }
        case 'file_upload':
          submission[field.field_id] = null;
          break;
        default: {
          // Support default_value for any field type (e.g., radio pre-fills)
          const defaultMeta = field as any;
          submission[field.field_id] = defaultMeta.default_value !== undefined
            ? defaultMeta.default_value
            : '';
          break;
        }
      }
    }
  }

  return submission;
}

/**
 * Calculate form completion percentage.
 *
 * FIX 2026-03-07: Only count required fields toward completion so that
 * optional fields (W-4 Steps 2-4, employer-only checkboxes, etc.) don't
 * penalise the progress bar. Also skip hidden and hidden_from_applicant fields.
 */
export function calculateFormCompletion(definition: FormDefinition, data: FormSubmissionData): number {
  let totalFields = 0;
  let completedFields = 0;

  for (const section of definition.sections) {
    // Skip sections hidden from applicant (office-only copies)
    if ((section as any).hidden_from_applicant) continue;

    for (const field of section.fields) {
      // Skip hidden fields (auto-filled on backend)
      if ((field as any).hidden) continue;

      // Skip staff-role fields — they are not part of applicant completion
      if (isStaffField(field)) continue;

      // Only count visible fields
      if (!isFieldVisible(field, data)) {
        continue;
      }

      // Only count required fields toward completion percentage.
      // Optional fields should not penalise progress.
      if (!field.required) continue;

      totalFields++;

      const value = data[field.field_id];
      let isComplete = false;

      switch (field.type) {
        case 'checkbox_group':
        case 'checkbox_grid':
          isComplete = Array.isArray(value) ? value.some(v => v) : Object.values(value || {}).some(v => v);
          break;
        case 'checkbox':
          isComplete = value === true;
          break;
        default:
          isComplete = value !== null && value !== undefined && value !== '';
      }

      if (isComplete) {
        completedFields++;
      }
    }
  }

  if (totalFields === 0) return 0;
  return Math.round((completedFields / totalFields) * 100);
}

/**
 * Get all fields in a form flattened
 */
export function getAllFields(definition: FormDefinition): FormField[] {
  const fields: FormField[] = [];
  for (const section of definition.sections) {
    fields.push(...section.fields);
  }
  return fields;
}
