/**
 * E-Signature Security Metadata Capture
 * Full suite: timestamp, IP, browser/device info, session ID, geolocation
 *
 * Captures security context at the moment of signing for legal defensibility.
 */

import { v4 as uuidv4 } from 'uuid';

export interface SignatureSecurityMetadata {
  /** Unique signing session identifier */
  signing_session_id: string;
  /** ISO 8601 timestamp of when signature was captured */
  signed_at: string;
  /** Timezone of the signing device */
  timezone: string;
  /** Browser user agent string */
  user_agent: string;
  /** Screen resolution */
  screen_resolution: string;
  /** Device pixel ratio */
  device_pixel_ratio: number;
  /** Platform (OS) */
  platform: string;
  /** Browser language */
  language: string;
  /** Touch device detection */
  is_touch_device: boolean;
  /** Geolocation (if permitted) */
  geolocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null;
  /** IP address (captured server-side, placeholder here) */
  ip_address?: string;
}

/**
 * Generate a unique signing session ID
 */
function generateSessionId(): string {
  // Use crypto API if available, otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Simple fallback UUID-like string
  return 'sig-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 11);
}

/**
 * Request geolocation from the browser
 * Returns null if denied or unavailable
 */
async function captureGeolocation(): Promise<SignatureSecurityMetadata['geolocation']> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 10000); // 10 second timeout

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeout);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      () => {
        clearTimeout(timeout);
        resolve(null); // User denied or error
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  });
}

/**
 * Capture full e-signature security metadata
 * Call this at the moment the user signs (not before)
 */
export async function captureSignatureMetadata(): Promise<SignatureSecurityMetadata> {
  const geolocation = await captureGeolocation();

  return {
    signing_session_id: generateSessionId(),
    signed_at: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
    screen_resolution: typeof screen !== 'undefined'
      ? `${screen.width}x${screen.height}`
      : 'Unknown',
    device_pixel_ratio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    platform: typeof navigator !== 'undefined' ? (navigator.platform || 'Unknown') : 'Unknown',
    language: typeof navigator !== 'undefined' ? (navigator.language || 'en') : 'en',
    is_touch_device: typeof navigator !== 'undefined'
      ? ('ontouchstart' in window || navigator.maxTouchPoints > 0)
      : false,
    geolocation,
  };
}

/**
 * Format metadata for display in the signature area
 */
export function formatSignatureTimestamp(metadata: SignatureSecurityMetadata): string {
  const date = new Date(metadata.signed_at);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}
