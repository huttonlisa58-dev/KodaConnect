/**
 * PDF Type Definitions
 * Core interfaces for field position mapping and PDF overlays
 */

export interface FieldPositionEntry {
  label: string;
  type?: string;
  positions: Array<{
    page: number;     // 0-indexed
    x: number;        // PDF points from left
    y: number;        // PDF points from bottom
    width: number;
    height: number;
    font_size: number;
    rotation?: number;  // Field-level rotation in degrees (e.g., -90 for WH-4 sideways form)
  }>;
  option_positions?: Record<string, { x: number; y: number }>;
  /** SSN split positions: 3 boxes for rendering XXX-XX-XXXX across separate PDF fields */
  ssn_positions?: Record<string, { x: number; y: number; width: number; height: number }>;
}

export interface FieldPositionMap {
  [fieldId: string]: FieldPositionEntry;
}
