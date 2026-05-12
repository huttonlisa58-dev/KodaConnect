/**
 * PDF Drawing Helpers
 * Low-level drawing functions for overlays, signatures, and metadata
 */

import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib';
import { sanitizeText } from './text-utils';

/**
 * Add signature metadata (timestamp, IP) as a small footer on the last page
 */
export function addSignatureMetadataFooter(
  page: PDFPage,
  font: PDFFont,
  metadata: { timestamp?: string; ip_address?: string; user_agent?: string }
): void {
  const parts: string[] = [];
  if (metadata.timestamp) {
    try {
      const d = new Date(metadata.timestamp);
      parts.push(`Signed: ${d.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
    } catch {
      parts.push(`Signed: ${metadata.timestamp}`);
    }
  }
  if (metadata.ip_address) {
    parts.push(`IP: ${metadata.ip_address}`);
  }
  if (parts.length === 0) return;
  const text = parts.join('  |  ');
  try {
    page.drawText(text, {
      x: 50,
      y: 15,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  } catch { /* skip */ }
}

/**
 * Draw text at a position, fitting within field width
 */
export function drawTextOverlay(
  page: PDFPage,
  text: string,
  pos: { x: number; y: number; width: number; height: number },
  font: PDFFont,
  fontSize: number
): void {
  if (!text) return;

  let displayText = text;
  const charWidth = fontSize * 0.5;
  const maxChars = Math.floor(pos.width / charWidth);

  if (displayText.length > maxChars && maxChars > 3) {
    displayText = displayText.substring(0, maxChars - 2) + '..';
  }

  const textX = pos.x + 2;
  const textY = pos.y + (pos.height - fontSize) / 2;

  try {
    page.drawText(displayText, {
      x: textX,
      y: textY,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  } catch (err) {
    console.error('Error drawing text:', err);
  }
}

/**
 * Draw a vector check-mark (✓) at a checkbox position.
 */
export function drawCheckmarkOverlay(
  page: PDFPage,
  pos: { x: number; y: number; width: number; height: number },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  font: PDFFont
): void {
  const size = Math.min(pos.width, pos.height, 14);
  const centerX = pos.x + pos.width / 2;
  const centerY = pos.y + pos.height / 2;
  const h = size / 2;

  const p1 = { x: centerX - h * 0.70, y: centerY + h * 0.10 };
  const p2 = { x: centerX - h * 0.10, y: centerY - h * 0.50 };
  const p3 = { x: centerX + h * 0.80, y: centerY + h * 0.70 };
  const thickness = Math.max(1, size * 0.15);

  try {
    page.drawLine({ start: p1, end: p2, thickness, color: rgb(0, 0, 0) });
    page.drawLine({ start: p2, end: p3, thickness, color: rgb(0, 0, 0) });
  } catch (err) {
    console.error('Error drawing checkmark:', err);
  }
}
/**
 * Draw a filled black circle for radio fields in replica mode.
 */
export function drawFilledCircleOverlay(
  page: PDFPage,
  x: number,
  y: number,
  fieldHeight: number,
  isDirectCenter: boolean = false
): void {
  const radius = Math.min(fieldHeight * 0.3, 5);
  const centerX = isDirectCenter ? x : x + 6;
  const centerY = isDirectCenter ? y : y + fieldHeight / 2;

  try {
    page.drawCircle({
      x: centerX,
      y: centerY,
      size: radius,
      color: rgb(0, 0, 0),
      borderColor: rgb(0, 0, 0),
      borderWidth: 0,
    });
  } catch (err) {
    console.error('Error drawing filled circle:', err);
  }
}

/**
 * Draw multi-line wrapped text within a bounding box (for template overlay textareas).
 */
export function drawWrappedTextOverlay(
  page: PDFPage,
  text: string,
  pos: { x: number; y: number; width: number; height: number },
  font: PDFFont,
  fontSize: number
): void {
  if (!text) return;

  const lineHeight = fontSize * 1.3;
  const maxWidth = pos.width - 4;
  const maxLines = Math.floor(pos.height / lineHeight);
  const charWidth = fontSize * 0.48;
  const maxCharsPerLine = Math.floor(maxWidth / charWidth);

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines) break;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  const startY = pos.y + pos.height - fontSize - 2;

  for (let i = 0; i < lines.length; i++) {
    const lineY = startY - (i * lineHeight);
    if (lineY < pos.y) break;

    try {
      page.drawText(lines[i], {
        x: pos.x + 2,
        y: lineY,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    } catch (err) {
      console.error('Error drawing wrapped text line:', err);
    }
  }
}

/**
 * Overlay a signature image at a position
 */
export async function overlaySignature(
  pdfDoc: PDFDocument,
  page: PDFPage,
  imageDataUrl: string,
  pos: { x: number; y: number; width: number; height: number }
): Promise<void> {
  try {
    const base64Data = imageDataUrl.split(',')[1];
    if (!base64Data) return;

    const imageBytes = Uint8Array.from(
      Buffer.from(base64Data, 'base64')
    );

    let image;
    try {
      image = await pdfDoc.embedPng(imageBytes);
    } catch {
      try {
        image = await pdfDoc.embedJpg(imageBytes);
      } catch {
        console.error('Could not embed signature image');
        return;
      }
    }

    const imgDims = image.scale(1);
    const scaleX = pos.width / imgDims.width;
    const scaleY = pos.height / imgDims.height;
    const scale = Math.min(scaleX, scaleY, 1);

    const finalWidth = imgDims.width * scale;
    const finalHeight = imgDims.height * scale;

    const drawX = pos.x + (pos.width - finalWidth) / 2;
    const drawY = pos.y + (pos.height - finalHeight) / 2;

    page.drawImage(image, {
      x: drawX,
      y: drawY,
      width: finalWidth,
      height: finalHeight,
    });
  } catch (err) {
    console.error('Error overlaying signature:', err);
  }
}
