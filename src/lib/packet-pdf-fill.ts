import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Field mapping for template PDF positions
 */
export interface PacketFieldMapping {
  pool_field_id: string;
  target_label: string;
  position: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    font_size?: number;
  };
  cell_positions?: Array<{
    row_id: string;
    col_id: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

/**
 * Sub-form definition in a packet
 */
export interface PacketSubForm {
  sub_form_id: string;
  name: string;
  page_range: [number, number];
  template_url: string;
  is_reference_only: boolean;
  field_mappings: PacketFieldMapping[];
}

/**
 * Complete form packet
 */
export interface FormPacket {
  id: string;
  name: string;
  sub_forms: PacketSubForm[];
}

/**
 * Text sanitization for WinAnsi encoding compatibility
 */
function sanitizeTextForWinAnsi(text: string): string {
  if (!text) return text;
  return text
    .replace(/[“”]/g, '"')  // Smart double quotes
    .replace(/[‘’]/g, "'")  // Smart single quotes
    .replace(/[—]/g, '-')         // Em dash
    .replace(/[–]/g, '-')         // En dash
    .replace(/[•]/g, '*')         // Bullet
    .replace(/[…]/g, '...')       // Ellipsis
    .replace(/[©]/g, '(c)')       // Copyright
    .replace(/[®]/g, '(R)')       // Registered
    .replace(/[ ]/g, ' ')         // Non-breaking space
    .replace(/[^\x00-\x7F]/g, '?');   // Any remaining non-ASCII
}

function formatDate(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateRegex.test(value)) {
      const [year, month, day] = value.split('-');
      return `${month}/${day}/${year}`;
    }
    return value;
  }
  if (value instanceof Date) {
    return value.toLocaleDateString('en-US');
  }
  return String(value);
}

/**
 * Truncate text to fit within a pixel width constraint.
 */
function fitText(
  text: string,
  maxWidth: number,
  fontSize: number,
  font: any
): { text: string; finalFontSize: number } {
  const charWidth = fontSize * 0.5;
  const maxChars = Math.floor(maxWidth / charWidth);
  let truncated = text;
  if (text.length > maxChars) {
    truncated = text.substring(0, Math.max(1, maxChars - 2)) + '..';
  }
  return { text: truncated, finalFontSize: fontSize };
}


// ─── Stub exports required by generate-pdf routes ───────────────────────────
// These maintain backward compatibility with existing API routes.

export async function fillSubFormPdf(
  pdfBytes: Uint8Array,
  fieldMappings: PacketFieldMapping[],
  formData: Record<string, any>
): Promise<Uint8Array> {
  // Delegate to the main fill logic via packet-level fill
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const font = await doc.embedFont('Helvetica');

  for (const mapping of fieldMappings) {
    const value = formData[mapping.pool_field_id];
    if (!value && value !== 0) continue;
    for (const pos of [mapping.position]) {
      const pageIndex = pos.page;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      const page = pages[pageIndex];
      const { height } = page.getSize();
      const text = String(value);
      const fontSize = pos.font_size || 10;
      page.drawText(text, {
        x: pos.x,
        y: pos.y,
        size: fontSize,
        font,
        maxWidth: pos.width,
      });
    }
  }

  return await doc.save();
}

export async function combineFilledPdfs(
  pdfBytesArray: Uint8Array[]
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  for (const bytes of pdfBytesArray) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }
  return await merged.save();
}
