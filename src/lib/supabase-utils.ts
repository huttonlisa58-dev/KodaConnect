/**
 * Utility functions for safe Supabase/PostgREST query building
 */

/**
 * Sanitize user input before interpolation into PostgREST .or() filter strings.
 * Escapes special PostgREST characters that could be used for injection attacks.
 *
 * PostgREST uses these characters as operators in filter strings:
 * - . (dot) — column separator
 * - , (comma) — OR separator
 * - ( ) — grouping
 * - % — wildcard (already used in ilike patterns, but user input shouldn't contain raw %)
 * - \ — escape character
 */
export function sanitizePostgrestInput(input: string): string {
  if (!input) return '';

  // Replace backslash first (to avoid double-escaping)
  return input
    .replace(/\\/g, '\\\\')   // \ → \\
    .replace(/\./g, '\\.')     // . → \.
    .replace(/,/g, '\\,')     // , → \,
    .replace(/\(/g, '\\(')    // ( → \(
    .replace(/\)/g, '\\)')    // ) → \)
    .replace(/%/g, '');        // Strip % (don't allow wildcard manipulation)
}
