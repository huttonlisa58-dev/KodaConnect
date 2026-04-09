/**
 * Form Package JSON Validation System
 *
 * Run at import time to catch structural, referential, and semantic errors
 * before form packages reach production. Validation is thorough but not
 * overly strict — warnings for non-critical issues, errors only for things
 * that will break rendering or data processing.
 */

import { JsonFormPackage, JsonSubForm, JsonFormField, JsonFieldType } from './json-package-types';

// ─────────────────────────────────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────────────────────────────────

export interface ValidationError {
  type: 'error' | 'warning';
  field?: string;
  subForm?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  stats: {
    subFormCount: number;
    fieldCount: number;
    autoFillCount: number;
    showIfCount: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Valid Values
// ─────────────────────────────────────────────────────────────────────────

const VALID_FIELD_TYPES: JsonFieldType[] = [
  'text', 'email', 'phone', 'date', 'time', 'number',
  'textarea', 'signature',
  'checkbox', 'checkbox_group', 'checkbox_grid',
  'radio', 'select', 'file_upload',
];

const SUPPORTED_HTML_TAGS = new Set([
  'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'u',
]);

// ─────────────────────────────────────────────────────────────────────────
// Main Validator
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate a complete form package JSON
 * Calls all sub-validators and aggregates results
 */
export function validateFormPackage(pkg: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Validate that pkg is a valid object
  if (!pkg || typeof pkg !== 'object') {
    return {
      valid: false,
      errors: [{ type: 'error', message: 'Package must be an object' }],
      warnings: [],
      stats: { subFormCount: 0, fieldCount: 0, autoFillCount: 0, showIfCount: 0 },
    };
  }

  // Run all validators
  const structureErrors = validatePackageStructure(pkg);
  errors.push(...structureErrors);

  // If structure is invalid, return early
  if (structureErrors.some(e => e.type === 'error')) {
    return {
      valid: false,
      errors,
      warnings,
      stats: { subFormCount: 0, fieldCount: 0, autoFillCount: 0, showIfCount: 0 },
    };
  }

  const subForms = pkg.sub_forms || [];

  // Validate field IDs are unique
  const fieldIdErrors = validateFieldIds(subForms);
  errors.push(...fieldIdErrors.filter(e => e.type === 'error'));
  warnings.push(...fieldIdErrors.filter(e => e.type === 'warning'));

  // If duplicate field IDs, return early
  if (fieldIdErrors.some(e => e.type === 'error' && e.message.includes('Duplicate'))) {
    return {
      valid: false,
      errors,
      warnings,
      stats: { subFormCount: 0, fieldCount: 0, autoFillCount: 0, showIfCount: 0 },
    };
  }

  // Validate auto_fill_from references
  const autoFillErrors = validateAutoFillReferences(subForms);
  errors.push(...autoFillErrors.filter(e => e.type === 'error'));
  warnings.push(...autoFillErrors.filter(e => e.type === 'warning'));

  // Validate show_if references
  const showIfErrors = validateShowIfReferences(subForms);
  errors.push(...showIfErrors.filter(e => e.type === 'error'));
  warnings.push(...showIfErrors.filter(e => e.type === 'warning'));

  // Validate HTML content
  const htmlErrors = validateHtmlContent(subForms);
  warnings.push(...htmlErrors);

  // Validate field types
  const fieldTypeErrors = validateFieldTypes(subForms);
  errors.push(...fieldTypeErrors.filter(e => e.type === 'error'));
  warnings.push(...fieldTypeErrors.filter(e => e.type === 'warning'));

  // Build stats
  let autoFillCount = 0;
  let showIfCount = 0;
  let fieldCount = 0;

  for (const sf of subForms) {
    if (Array.isArray(sf.fields)) {
      for (const field of sf.fields) {
        fieldCount++;
        if (field.auto_fill_from) autoFillCount++;
        if (field.show_if) showIfCount++;
      }
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    stats: {
      subFormCount: subForms.length,
      fieldCount,
      autoFillCount,
      showIfCount,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Package-Level Structure Validator
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate package-level structure and metadata
 * Checks: form_package exists, sub_forms is array, required metadata fields
 */
function validatePackageStructure(pkg: any): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check form_package exists
  if (!pkg.form_package) {
    errors.push({
      type: 'error',
      message: 'Missing form_package metadata object',
    });
    return errors;
  }

  if (typeof pkg.form_package !== 'object') {
    errors.push({
      type: 'error',
      message: 'form_package must be an object',
    });
    return errors;
  }

  const meta = pkg.form_package;

  // Check version
  if (!meta.version || typeof meta.version !== 'string') {
    errors.push({
      type: 'error',
      message: 'form_package.version is required and must be a string',
    });
  }

  // Check total_pages
  if (typeof meta.total_pages !== 'number' || meta.total_pages < 1) {
    errors.push({
      type: 'error',
      message: 'form_package.total_pages must be a positive number',
    });
  }

  // Check page_sizes
  if (!meta.page_sizes || typeof meta.page_sizes !== 'object') {
    errors.push({
      type: 'error',
      message: 'form_package.page_sizes is required and must be an object',
    });
  } else {
    // Validate page_sizes structure: should be Record<string, [number, number]>
    for (const [pageNum, size] of Object.entries(meta.page_sizes)) {
      if (!Array.isArray(size) || size.length !== 2 || !size.every(v => typeof v === 'number')) {
        errors.push({
          type: 'error',
          message: `form_package.page_sizes["${pageNum}"] must be [width, height]`,
        });
      }
    }
  }

  // Check sub_forms exists and is non-empty array
  if (!Array.isArray(pkg.sub_forms) || pkg.sub_forms.length === 0) {
    errors.push({
      type: 'error',
      message: 'sub_forms must be a non-empty array',
    });
    return errors;
  }

  // Validate each sub-form's basic structure
  for (let i = 0; i < pkg.sub_forms.length; i++) {
    const sf = pkg.sub_forms[i];
    if (!sf || typeof sf !== 'object') {
      errors.push({
        type: 'error',
        subForm: `sub_forms[${i}]`,
        message: 'Sub-form must be an object',
      });
      continue;
    }

    if (!sf.id || typeof sf.id !== 'string') {
      errors.push({
        type: 'error',
        subForm: `sub_forms[${i}]`,
        message: 'Sub-form must have an id (string)',
      });
    }

    if (!sf.name || typeof sf.name !== 'string') {
      errors.push({
        type: 'error',
        subForm: `sub_forms[${i}]`,
        message: 'Sub-form must have a name (string)',
      });
    }

    if (!Array.isArray(sf.pages) || sf.pages.length === 0) {
      errors.push({
        type: 'error',
        subForm: sf.id,
        message: 'Sub-form must have at least one page',
      });
    }

    if (!Array.isArray(sf.fields)) {
      errors.push({
        type: 'error',
        subForm: sf.id,
        message: 'Sub-form.fields must be an array',
      });
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────
// Field ID Uniqueness Validator
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate all field IDs are unique across the entire package
 * Collects all field_ids across all sub-forms and checks for duplicates
 */
function validateFieldIds(subForms: any[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenIds = new Map<string, { subForm: string; index: number }>();

  for (const sf of subForms) {
    if (!sf.id || !Array.isArray(sf.fields)) {
      continue;
    }

    for (let i = 0; i < sf.fields.length; i++) {
      const field = sf.fields[i];

      // Check field has ID
      if (!field.id || typeof field.id !== 'string') {
        errors.push({
          type: 'error',
          subForm: sf.id,
          field: `fields[${i}]`,
          message: 'Field must have an id (string)',
        });
        continue;
      }

      // Check for duplicates
      if (seenIds.has(field.id)) {
        const prev = seenIds.get(field.id)!;
        errors.push({
          type: 'error',
          subForm: sf.id,
          field: field.id,
          message: `Duplicate field ID (previously seen in ${prev.subForm})`,
        });
      } else {
        seenIds.set(field.id, { subForm: sf.id, index: i });
      }
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────
// Auto-Fill Reference Validator
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate auto_fill_from references point to existing fields
 * Builds set of all field_ids and checks that auto_fill_from targets exist
 */
function validateAutoFillReferences(subForms: any[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Build set of all field IDs and their sub-form positions
  const allFields = new Map<string, { subFormId: string; subFormIndex: number }>();

  for (let sfIdx = 0; sfIdx < subForms.length; sfIdx++) {
    const sf = subForms[sfIdx];
    if (!sf.id || !Array.isArray(sf.fields)) continue;

    for (const field of sf.fields) {
      if (field.id && typeof field.id === 'string') {
        allFields.set(field.id, { subFormId: sf.id, subFormIndex: sfIdx });
      }
    }
  }

  // Special auto_fill_from values that don't reference other fields
  const SPECIAL_AUTO_FILL_VALUES = new Set(['profile', 'applicant_profile', 'current_user', 'system']);

  // Validate auto_fill_from references
  for (let sfIdx = 0; sfIdx < subForms.length; sfIdx++) {
    const sf = subForms[sfIdx];
    if (!sf.id || !Array.isArray(sf.fields)) continue;

    for (const field of sf.fields) {
      if (!field.auto_fill_from) continue;

      // Skip special values (these are resolved at runtime, not field references)
      if (SPECIAL_AUTO_FILL_VALUES.has(field.auto_fill_from)) continue;

      // Check target field exists — cross-package references are allowed (warning only)
      if (!allFields.has(field.auto_fill_from)) {
        errors.push({
          type: 'warning',
          subForm: sf.id,
          field: field.id,
          message: `auto_fill_from references field "${field.auto_fill_from}" not found in this package (may be a cross-package reference)`,
        });
        continue;
      }

      // Warning: if target is in a later sub-form, auto-fill won't work as expected
      const targetInfo = allFields.get(field.auto_fill_from)!;
      if (targetInfo.subFormIndex > sfIdx) {
        errors.push({
          type: 'warning',
          subForm: sf.id,
          field: field.id,
          message: `auto_fill_from references field in later sub-form (${targetInfo.subFormId}), which may not have been filled yet`,
        });
      }
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────
// Show-If Reference Validator
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate show_if references point to fields in the same sub-form
 * Conditional visibility only works within a single sub-form
 */
function validateShowIfReferences(subForms: any[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const sf of subForms) {
    if (!sf.id || !Array.isArray(sf.fields)) continue;

    // Build set of field IDs in this sub-form
    const localFields = new Set<string>();
    for (const field of sf.fields) {
      if (field.id && typeof field.id === 'string') {
        localFields.add(field.id);
      }
    }

    // Check show_if references
    // Accept both formats: { field, equals } and { field_id, operator, value }
    for (const field of sf.fields) {
      if (!field.show_if) continue;

      const refField = field.show_if.field || field.show_if.field_id;
      if (!refField) {
        errors.push({
          type: 'error',
          subForm: sf.id,
          field: field.id,
          message: 'show_if must have a "field" or "field_id" property',
        });
        continue;
      }

      // show_if target must reference a field in the same sub-form
      if (!localFields.has(refField)) {
        errors.push({
          type: 'error',
          subForm: sf.id,
          field: field.id,
          message: `show_if references field "${refField}" which doesn't exist in this sub-form`,
        });
      }

      // Check that a comparison value exists (either "equals" or "value")
      if (field.show_if.equals === undefined && field.show_if.value === undefined) {
        errors.push({
          type: 'error',
          subForm: sf.id,
          field: field.id,
          message: 'show_if must have an "equals" or "value" property',
        });
      }
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────
// HTML Content Validator
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate HTML content uses only supported tags
 * Supported: h2, h3, h4, p, ul, ol, li, strong, em, u
 * Warns about other tags that might not render as expected
 */
function validateHtmlContent(subForms: any[]): ValidationError[] {
  const warnings: ValidationError[] = [];

  for (const sf of subForms) {
    if (!sf.id) continue;

    // Check content field
    if (sf.content && typeof sf.content === 'string') {
      const htmlWarnings = findUnsupportedTags(sf.content);
      for (const warning of htmlWarnings) {
        warnings.push({
          type: 'warning',
          subForm: sf.id,
          message: warning,
        });
      }
    }

    // Check summary field (optional)
    if (sf.summary && typeof sf.summary === 'string') {
      // Summary should not contain complex HTML
      if (sf.summary.includes('<') && sf.summary.includes('>')) {
        warnings.push({
          type: 'warning',
          subForm: sf.id,
          message: 'summary field should be plain text, not HTML',
        });
      }
    }
  }

  return warnings;
}

/**
 * Find HTML tags that aren't in the supported set
 */
function findUnsupportedTags(html: string): string[] {
  const warnings: string[] = [];

  // Simple regex to find opening tags
  const tagRegex = /<(\w+)[^>]*>/g;
  const foundTags = new Set<string>();

  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    foundTags.add(tag);
  }

  // Check for unsupported tags
  for (const tag of foundTags) {
    if (!SUPPORTED_HTML_TAGS.has(tag) && !['html', 'body'].includes(tag)) {
      warnings.push(`Unsupported HTML tag <${tag}> (supported: ${Array.from(SUPPORTED_HTML_TAGS).join(', ')})`);
    }
  }

  return warnings;
}

// ─────────────────────────────────────────────────────────────────────────
// Field Type Validator
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate field types are recognized and have appropriate config
 * Checks: known type, select/radio have options, checkbox_grid has rows/columns
 */
function validateFieldTypes(subForms: any[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const sf of subForms) {
    if (!sf.id || !Array.isArray(sf.fields)) continue;

    for (const field of sf.fields) {
      if (!field.id) continue;

      const type = field.type;

      // Check type is a string and is recognized
      if (!type || typeof type !== 'string') {
        errors.push({
          type: 'error',
          subForm: sf.id,
          field: field.id,
          message: 'Field must have a type (string)',
        });
        continue;
      }

      if (!VALID_FIELD_TYPES.includes(type as JsonFieldType)) {
        errors.push({
          type: 'error',
          subForm: sf.id,
          field: field.id,
          message: `Unknown field type "${type}" (valid: ${VALID_FIELD_TYPES.join(', ')})`,
        });
        continue;
      }

      // Type-specific validations
      if (type === 'select' || type === 'radio') {
        if (!Array.isArray(field.options) || field.options.length === 0) {
          errors.push({
            type: 'warning',
            subForm: sf.id,
            field: field.id,
            message: `${type} field should have options array`,
          });
        } else {
          // Validate option structure — accept both string[] and {value,label}[] formats
          for (let i = 0; i < field.options.length; i++) {
            const opt = field.options[i];
            // String options are valid shorthand (auto-normalized downstream)
            if (typeof opt === 'string') continue;
            if (!opt.value || !opt.label) {
              errors.push({
                type: 'error',
                subForm: sf.id,
                field: field.id,
                message: `Option ${i} in ${type} field must have value and label (or be a string)`,
              });
            }
          }
        }
      }

      if (type === 'checkbox_group') {
        if (!Array.isArray(field.options) || field.options.length === 0) {
          errors.push({
            type: 'warning',
            subForm: sf.id,
            field: field.id,
            message: 'checkbox_group field should have options array',
          });
        }
      }

      if (type === 'checkbox_grid') {
        if (!Array.isArray(field.rows) || field.rows.length === 0) {
          errors.push({
            type: 'warning',
            subForm: sf.id,
            field: field.id,
            message: 'checkbox_grid field should have rows array',
          });
        }
        if (!Array.isArray(field.columns) || field.columns.length === 0) {
          errors.push({
            type: 'warning',
            subForm: sf.id,
            field: field.id,
            message: 'checkbox_grid field should have columns array',
          });
        }
      }

      // Validate label exists
      if (!field.label || typeof field.label !== 'string') {
        errors.push({
          type: 'error',
          subForm: sf.id,
          field: field.id,
          message: 'Field must have a label (string)',
        });
      }

      // Validate position exists for replica mode (generated mode can omit)
      if (field.pos) {
        if (typeof field.pos !== 'object') {
          errors.push({
            type: 'error',
            subForm: sf.id,
            field: field.id,
            message: 'Field.pos must be an object',
          });
        } else {
          const requiredPosKeys = ['x', 'y', 'w', 'h'];
          for (const key of requiredPosKeys) {
            if (typeof field.pos[key] !== 'number' || field.pos[key] < 0) {
              errors.push({
                type: 'error',
                subForm: sf.id,
                field: field.id,
                message: `Field.pos.${key} must be a non-negative number`,
              });
            }
          }
        }
      }
    }
  }

  return errors;
}
