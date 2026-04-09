/**
 * Coordinate Conversion Utilities
 *
 * PDF has two common coordinate systems:
 * - Bottom-left origin: standard PDF (used by pdf-lib for rendering)
 * - Top-left origin: used by PyMuPDF extraction and PDF.js canvas rendering
 *
 * The JSON form packages from Claude use top-left coordinates.
 * The existing app code (packet-pdf-fill.ts, FieldPositionEditor.tsx) uses bottom-left.
 * These utilities convert between the two.
 */

export interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Convert top-left origin coordinates to bottom-left origin.
 * Used when storing extracted fields into the database for pdf-lib rendering.
 *
 * Top-left: y=0 is at the top of the page, increases downward.
 * Bottom-left: y=0 is at the bottom of the page, increases upward.
 *
 * Formula: y_bottom = pageHeight - y_top - fieldHeight
 */
export function topLeftToBottomLeft(
  x: number,
  y: number,
  width: number,
  height: number,
  pageHeight: number
): Position {
  return {
    x,
    y: pageHeight - y - height,
    width,
    height,
  };
}

/**
 * Convert bottom-left origin coordinates to top-left origin.
 * Used when rendering fields on PDF.js canvas (which uses top-left).
 *
 * Formula: y_top = pageHeight - y_bottom - fieldHeight
 */
export function bottomLeftToTopLeft(
  x: number,
  y: number,
  width: number,
  height: number,
  pageHeight: number
): Position {
  return {
    x,
    y: pageHeight - y - height,
    width,
    height,
  };
}

/**
 * Convert a Position object from top-left to bottom-left coordinates.
 */
export function convertPositionToBottomLeft(pos: Position, pageHeight: number): Position {
  return topLeftToBottomLeft(pos.x, pos.y, pos.width, pos.height, pageHeight);
}

/**
 * Convert a Position object from bottom-left to top-left coordinates.
 */
export function convertPositionToTopLeft(pos: Position, pageHeight: number): Position {
  return bottomLeftToTopLeft(pos.x, pos.y, pos.width, pos.height, pageHeight);
}

/**
 * Scale a position by a given factor (e.g., PDF.js canvas scale).
 * Used when mapping PDF point coordinates to screen pixels.
 */
export function scalePosition(pos: Position, scale: number): Position {
  return {
    x: pos.x * scale,
    y: pos.y * scale,
    width: pos.width * scale,
    height: pos.height * scale,
  };
}

/**
 * Get the page height for a given page number from the page_sizes map.
 * Falls back to US Letter (792) if not found.
 */
export function getPageHeight(
  pageNumber: number,
  pageSizes: Record<string, [number, number]>
): number {
  const size = pageSizes[String(pageNumber)];
  if (size) return size[1];

  // Check if there's a default page size (most pages share the same size)
  // Use the first available size as fallback, or US Letter
  const sizes = Object.values(pageSizes);
  if (sizes.length > 0) return sizes[0][1];
  return 792; // US Letter height in points
}

/**
 * Get the page width for a given page number from the page_sizes map.
 * Falls back to US Letter (612) if not found.
 */
export function getPageWidth(
  pageNumber: number,
  pageSizes: Record<string, [number, number]>
): number {
  const size = pageSizes[String(pageNumber)];
  if (size) return size[0];

  const sizes = Object.values(pageSizes);
  if (sizes.length > 0) return sizes[0][0];
  return 612; // US Letter width in points
}
