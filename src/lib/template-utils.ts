/**
 * Template Variable Substitution Utility
 *
 * Replaces {{field_id}} placeholders in section content with actual
 * submission data values. Used in:
 * - Office submission viewer (page.tsx)
 * - Applicant-facing form (DynamicForm.tsx)
 * - Caregiver part card (CaregiverPartCard.tsx)
 * - PDF generation (flat-layout.ts has its own copy for server-side use)
 */

/**
 * Replace {{template_variable}} placeholders in HTML content
 * with actual values from form data.
 *
 * @param content - HTML string containing {{field_id}} placeholders
 * @param formData - Object mapping field_id → submitted value
 * @param fields - Array of field definitions (used for fuzzy matching)
 * @returns HTML string with placeholders replaced by values
 */
export function replaceTemplateVariables(
  content: string,
  formData: Record<string, any>,
  fields?: { field_id?: string; id?: string; label?: string }[]
): string {
  if (!content) return content;

  return content.replace(/\{\{([^}]+)\}\}/g, (_match, varName) => {
    const trimmed = varName.trim();

    // Direct match in form data
    if (formData[trimmed] !== undefined && formData[trimmed] !== null && formData[trimmed] !== '') {
      return formatDisplayValue(String(formData[trimmed]), trimmed);
    }

    // Try fuzzy match — field_id ending with the variable name
    if (fields) {
      for (const field of fields) {
        const fid = field.field_id || field.id || '';
        if (fid === trimmed || fid.endsWith('__' + trimmed) || fid.endsWith('_' + trimmed)) {
          const fieldVal = formData[fid];
          if (fieldVal !== undefined && fieldVal !== null && fieldVal !== '') {
            return formatDisplayValue(String(fieldVal), fid);
          }
        }
      }
    }

    // Remove unresolved placeholders (cleaner than showing raw {{...}})
    return '';
  });
}

/**
 * Format a value for display, applying context-aware formatting.
 * - Name fields get title-cased
 * - Date fields get formatted if they look like ISO dates
 */
function formatDisplayValue(value: string, fieldId: string): string {
  // Auto-capitalize name fields
  if (isNameField(fieldId)) {
    return capitalizeName(value);
  }

  // Format ISO date strings (e.g., "2026-03-13" → "03/13/2026")
  if (isDateField(fieldId) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.substring(0, 10).split('-');
    return `${month}/${day}/${year}`;
  }

  return value;
}

function isNameField(fieldId: string): boolean {
  const lower = fieldId.toLowerCase();
  return lower.includes('name') && !lower.includes('rename') && !lower.includes('filename');
}

function isDateField(fieldId: string): boolean {
  const lower = fieldId.toLowerCase();
  return lower.includes('date') || lower.includes('_dob') || lower.includes('birth');
}

function capitalizeName(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
