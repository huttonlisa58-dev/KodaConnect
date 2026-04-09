/**
 * Company management utilities
 * Slug generation, validation, and stats helpers
 */

/**
 * Generate a URL-safe slug from a company name.
 * Examples: "Complete Homecare Inc." → "complete-homecare-inc"
 *           "Xtreme Care LLC" → "xtreme-care-llc"
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except hyphens
    .replace(/\s+/g, '-')          // Spaces to hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '');        // Trim leading/trailing hyphens
}

/**
 * Validate a company name meets minimum requirements
 */
export function validateCompanyName(name: string): string | null {
  if (!name || name.trim().length < 2) {
    return 'Company name must be at least 2 characters';
  }
  if (name.trim().length > 100) {
    return 'Company name must be 100 characters or less';
  }
  return null; // Valid
}

/**
 * Validate a hex color code
 */
export function validateHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Default brand colors for new companies
 */
export const DEFAULT_BRAND_COLORS = {
  primary_color: '#0F766E',
  secondary_color: '#0D9488',
  accent_color: '#D1FAE5',
  light_bg: '#F0FDFA',
  dark_text: '#134E4A',
};
