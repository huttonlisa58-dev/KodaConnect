/**
 * Text Utilities for PDF Generation
 * Handles text sanitization, formatting, and HTML cleaning
 */

/**
 * Sanitize text for pdf-lib (WinAnsi encoding only supports basic Latin characters)
 */
export function sanitizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '--')
    .replace(/\u2022/g, '*')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u00C0-\u00FF]/g, (char) => char)
    .replace(/[^\x00-\xFF]/g, '');
}

/**
 * Decode HTML entities in text (e.g. &quot; → ", &amp; → &)
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const num = parseInt(code, 10);
      return num < 256 ? String.fromCharCode(num) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const num = parseInt(hex, 16);
      return num < 256 ? String.fromCharCode(num) : '';
    });
}

/**
 * Strip HTML anchor tags, keeping the link text (or URL if no text)
 */
export function stripAnchorTags(html: string): string {
  if (!html) return '';
  return html.replace(/<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, text) => {
    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    return cleanText || url;
  });
}

/**
 * Convert a field_id like "friday_am" to a readable label like "Friday AM"
 */
export function fieldIdToLabel(fieldId: string): string {
  if (!fieldId) return '';
  return fieldId
    .replace(/__/g, ' / ')
    .replace(/_/g, ' ')
    .replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase())
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Auto-capitalize the first letter of each word in a name
 */
export function capitalizeName(name: string): string {
  if (!name) return '';
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Format a date string to readable format
 */
export function formatDateValue(value: string): string {
  if (!value || !value.match(/^\d{4}-\d{2}-\d{2}/)) return value;
  const d = new Date(value + 'T00:00:00');
  return !isNaN(d.getTime())
    ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : value;
}

/**
 * Format a time string to 12-hour format
 */
export function formatTimeValue(value: string): string {
  if (!value || !value.match(/^\d{2}:\d{2}/)) return value;
  const [h, m] = value.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

/**
 * Get readable option label for radio/select values
 */
export function getOptionLabel(field: any, value: string): string {
  if (!field.options || !value) return value;
  const opt = field.options.find((o: any) => o.value === value);
  return opt ? opt.label : value;
}

/**
 * Get readable labels for checkbox_group array values
 */
export function getCheckboxGroupLabels(field: any, values: string[]): string[] {
  if (!Array.isArray(values)) return values;
  return values.map((v: string) => {
    if (field.options) {
      const opt = field.options.find((o: any) => o.value === v);
      if (opt) return opt.label;
    }
    // Fallback: convert field_id-style values to readable labels
    return fieldIdToLabel(v);
  });
}

/**
 * Check if a field is visible based on show_if conditional
 */
export function isFieldVisible(field: any, data: Record<string, any>): boolean {
  if (!field.show_if) return true;
  const depValue = data[field.field_id ? field.show_if.field : field.show_if.field];
  if (field.show_if.equals === true) return depValue === true || depValue === 'true';
  if (field.show_if.equals === false) return depValue === false || depValue === 'false';
  return depValue === field.show_if.equals;
}

/**
 * Strip HTML tags from text
 */
export function stripHtmlTags(text: string): string {
  // First convert anchor tags to their text content
  let result = stripAnchorTags(text);
  // Then strip all remaining tags
  result = result
    .replace(/<[^>]*>/g, '');
  // Decode HTML entities
  result = decodeHtmlEntities(result);
  // Collapse whitespace
  result = result
    .replace(/\s+/g, ' ')
    .trim();
  return result;
}
