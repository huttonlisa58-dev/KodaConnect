/**
 * Logo display utilities for KodaConnect
 * Handles broken logos gracefully with initials fallback
 */

/**
 * Extract 2-character initials from a company name.
 * Examples: "Xtreme Care" → "XC", "Complete Homecare Inc." → "CH", "KodaConnect" → "KC"
 */
export function getCompanyInitials(name: string): string {
  if (!name) return '??';

  const words = name
    .replace(/[^a-zA-Z\s]/g, '') // Remove non-alpha chars (Inc., LLC, etc.)
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0);

  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();

  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Validate and normalize a logo URL.
 * Returns null if the URL is clearly invalid or empty.
 */
export function getLogoUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl || logoUrl.trim() === '') return null;

  const url = logoUrl.trim();

  // Accept absolute URLs (http/https)
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  // Accept Supabase storage paths that start with /storage/
  if (url.startsWith('/storage/')) return url;

  // Accept relative paths starting with /
  if (url.startsWith('/')) return url;

  // Accept data URIs
  if (url.startsWith('data:image/')) return url;

  // Reject anything else
  return null;
}

/**
 * Generate a consistent background color from a company name (for initials avatar)
 */
export function getInitialsColor(name: string): { bg: string; text: string } {
  const colors = [
    { bg: '#0F766E', text: '#FFFFFF' }, // teal
    { bg: '#1D4ED8', text: '#FFFFFF' }, // blue
    { bg: '#7C3AED', text: '#FFFFFF' }, // purple
    { bg: '#DB2777', text: '#FFFFFF' }, // pink
    { bg: '#EA580C', text: '#FFFFFF' }, // orange
    { bg: '#16A34A', text: '#FFFFFF' }, // green
    { bg: '#CA8A04', text: '#FFFFFF' }, // yellow
    { bg: '#DC2626', text: '#FFFFFF' }, // red
  ];

  // Simple hash from name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }

  return colors[Math.abs(hash) % colors.length];
}
