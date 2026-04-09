/**
 * Phone number utilities
 * Shared between client and server components
 */

export function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Add +1 if US number without country code
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // Add + if has country code but missing +
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return `+${digits}`;
}
