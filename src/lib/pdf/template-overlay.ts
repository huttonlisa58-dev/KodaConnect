/**
 * Template Overlay PDF Generator
 * Overlays form submission data onto a template PDF
 *
 * Handles page rotation: some template pages (e.g., LS-62 landscape forms)
 * have /Rotate=90 in the PDF, meaning their MediaBox is portrait (612×792)
 * but they display as landscape (792×612). Field coordinates are stored in
 * the visual (landscape) coordinate system, so we must transform them to
 * the unrotated MediaBox system before drawing with pdf-lib.
 *
 * For /Rotate=90 pages:
 *   - pdf-lib sees MediaBox as 612×792 (portrait)
 *   - Visual display is 792×612 (landscape)
 *   - Coordinate mapping (empirically verified):
 *       visual_bl_x = pdf_y
 *       visual_bl_y = mediaWidth - pdf_x
 *     Therefore to draw at visual bottom-left (vx, vy):
 *       pdf_x = mediaWidth - vy
 *       pdf_y = vx
 *     Text must use rotate: degrees(90) to appear horizontal after page rotation.
 */

import { PDFDocument, PDFPage, PDFFont, StandardFonts, degrees, rgb } from 'pdf-lib';
import { NextResponse } from 'next/server';
import { FieldPositionMap } from './types';
import { sanitizeText } from './text-utils';
import {
  addSignatureMetadataFooter,
  drawTextOverlay,
  drawCheckmarkOverlay,
  drawFilledCircleOverlay,
  drawWrappedTextOverlay,
  overlaySignature,
} from './drawing-helpers';

/**
 * Get the rotation angle of a PDF page in degrees (0, 90, 180, 270).
 */
function getPageRotationAngle(page: PDFPage): number {
  const rot = page.getRotation();
  return rot?.angle || 0;
}

/**
 * Convert a visual bottom-left point to pdf-lib unrotated coordinates.
 * For /Rotate=90: pdf_x = mediaWidth - vy, pdf_y = vx
 */
function visBLPointToPdf(
  vx: number,
  vy: number,
  rotAngle: number,
  mediaWidth: number,
  _mediaHeight: number
): { px: number; py: number } {
  if (rotAngle === 90) {
    return { px: mediaWidth - vy, py: vx };
  }
  if (rotAngle === 270) {
    return { px: vy, py: _mediaHeight - vx };
  }
  // No rotation or 180 (uncommon)
  return { px: vx, py: vy };
}

/**
 * Draw text on a potentially rotated page at visual bottom-left coordinates.
 * Handles coordinate transform and text rotation for /Rotate pages.
 * Also handles field-level rotation (e.g., -90 for WH-4 sideways form fields).
 */
function drawTextOnPage(
  page: PDFPage,
  text: string,
  visPos: { x: number; y: number; width: number; height: number },
  font: PDFFont,
  fontSize: number,
  rotAngle: number,
  mediaWidth: number,
  mediaHeight: number,
  fieldRotation?: number
): void {
  if (!text) return;

  // Field-level rotation (e.g., -90 for WH-4 sideways fields on a non-rotated page)
  if (fieldRotation && rotAngle === 0) {
    // For -90° field rotation: text reads bottom-to-top
    // The field's w/h in JSON are in the rotated frame: w=narrow side, h=long side (text length)
    // Truncate text to fit the field's height (which is the effective text width)
    let displayText = text;
    const charWidth = fontSize * 0.5;
    const maxChars = Math.floor(visPos.height / charWidth);
    if (displayText.length > maxChars && maxChars > 3) {
      displayText = displayText.substring(0, maxChars - 2) + '..';
    }

    // For sideways forms (e.g., WH-4): negate the field rotation so text reads correctly.
    // With degrees(90): text flows +y (left-to-right on sideways form), chars face -x (upright on form).
    // Anchor at bottom of field in BL = left side of fill area on the sideways form.
    const anchorX = visPos.x + (visPos.width + fontSize) / 2;
    const anchorY = visPos.y + 2;

    try {
      page.drawText(displayText, {
        x: anchorX,
        y: anchorY,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        rotate: degrees(-fieldRotation),
      });
    } catch (err) {
      console.error('Error drawing field-rotated text:', err);
    }
    return;
  }

  // Truncate text to fit visual width
  let displayText = text;
  const charWidth = fontSize * 0.5;
  const maxChars = Math.floor(visPos.width / charWidth);
  if (displayText.length > maxChars && maxChars > 3) {
    displayText = displayText.substring(0, maxChars - 2) + '..';
  }

  // Compute anchor in visual bottom-left coords (left-padded, vertically centered)
  const anchorVx = visPos.x + 2;
  const anchorVy = visPos.y + (visPos.height - fontSize) / 2;

  if (rotAngle === 0) {
    // No rotation — draw normally
    try {
      page.drawText(displayText, {
        x: anchorVx,
        y: anchorVy,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    } catch (err) {
      console.error('Error drawing text:', err);
    }
  } else {
    // Rotated page — transform anchor and counter-rotate text
    const { px, py } = visBLPointToPdf(anchorVx, anchorVy, rotAngle, mediaWidth, mediaHeight);
    try {
      page.drawText(displayText, {
        x: px,
        y: py,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        rotate: degrees(rotAngle), // Counter-rotates: +90 cancels page's visual +90
      });
    } catch (err) {
      console.error('Error drawing rotated text:', err);
    }
  }
}

/**
 * Draw a checkmark on a potentially rotated page.
 */
function drawCheckOnPage(
  page: PDFPage,
  visPos: { x: number; y: number; width: number; height: number },
  font: PDFFont,
  rotAngle: number,
  mediaWidth: number,
  mediaHeight: number
): void {
  const size = Math.min(visPos.width, visPos.height, 14);
  const centerVx = visPos.x + visPos.width / 2 - size * 0.3;
  const centerVy = visPos.y + visPos.height / 2 - size * 0.3;

  if (rotAngle === 0) {
    drawCheckmarkOverlay(page, visPos, font);
  } else {
    const { px, py } = visBLPointToPdf(centerVx, centerVy, rotAngle, mediaWidth, mediaHeight);
    try {
      page.drawText('X', {
        x: px,
        y: py,
        size: size,
        font,
        color: rgb(0, 0, 0),
        rotate: degrees(rotAngle),
      });
    } catch (err) {
      console.error('Error drawing rotated checkmark:', err);
    }
  }
}

/**
 * Draw a filled circle on a potentially rotated page.
 */
function drawCircleOnPage(
  page: PDFPage,
  visCenterX: number,
  visCenterY: number,
  fieldHeight: number,
  rotAngle: number,
  mediaWidth: number,
  mediaHeight: number
): void {
  const radius = Math.min(fieldHeight * 0.3, 5);

  if (rotAngle === 0) {
    drawFilledCircleOverlay(page, visCenterX, visCenterY, fieldHeight, true);
  } else {
    const { px, py } = visBLPointToPdf(visCenterX, visCenterY, rotAngle, mediaWidth, mediaHeight);
    try {
      page.drawCircle({
        x: px,
        y: py,
        size: radius,
        color: rgb(0, 0, 0),
        borderColor: rgb(0, 0, 0),
        borderWidth: 0,
      });
    } catch (err) {
      console.error('Error drawing rotated circle:', err);
    }
  }
}

/**
 * Draw wrapped text on a potentially rotated page.
 */
function drawWrappedOnPage(
  page: PDFPage,
  text: string,
  visPos: { x: number; y: number; width: number; height: number },
  font: PDFFont,
  fontSize: number,
  rotAngle: number,
  mediaWidth: number,
  mediaHeight: number
): void {
  if (!text) return;

  if (rotAngle === 0) {
    drawWrappedTextOverlay(page, text, visPos, font, fontSize);
    return;
  }

  // Word-wrap using visual dimensions
  const lineHeight = fontSize * 1.3;
  const maxWidth = visPos.width - 4;
  const maxLines = Math.floor(visPos.height / lineHeight);
  const charW = fontSize * 0.48;
  const maxCharsPerLine = Math.floor(maxWidth / charW);

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
  if (currentLine && lines.length < maxLines) lines.push(currentLine);

  // Draw each line at rotated positions
  const startVy = visPos.y + visPos.height - fontSize - 2;
  for (let i = 0; i < lines.length; i++) {
    const lineVy = startVy - (i * lineHeight);
    if (lineVy < visPos.y) break;

    const lineVx = visPos.x + 2;
    const { px, py } = visBLPointToPdf(lineVx, lineVy, rotAngle, mediaWidth, mediaHeight);
    try {
      page.drawText(lines[i], {
        x: px,
        y: py,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        rotate: degrees(rotAngle),
      });
    } catch (err) {
      console.error('Error drawing rotated wrapped line:', err);
    }
  }
}

/**
 * Overlay a signature image on a potentially rotated page.
 * Handles both page-level rotation and field-level rotation.
 */
async function overlaySignatureOnPage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  imageDataUrl: string,
  visPos: { x: number; y: number; width: number; height: number },
  rotAngle: number,
  mediaWidth: number,
  mediaHeight: number,
  fieldRotation?: number
): Promise<void> {
  // Field-level rotation (e.g., -90 for WH-4 sideways signature)
  if (fieldRotation && rotAngle === 0) {
    try {
      const base64Data = imageDataUrl.split(',')[1];
      if (!base64Data) return;

      const imageBytes = Uint8Array.from(Buffer.from(base64Data, 'base64'));
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
      // For -90° field rotation: field w is narrow, h is long
      // The signature should fit within the field, rotated
      const scaleX = visPos.height / imgDims.width;  // h = effective width
      const scaleY = visPos.width / imgDims.height;   // w = effective height
      const scale = Math.min(scaleX, scaleY, 1);
      const finalWidth = imgDims.width * scale;
      const finalHeight = imgDims.height * scale;

      // For -90° rotation: position image so it stays within page bounds
      // After rotation, the image extends downward by finalWidth from imgY,
      // so imgY must be >= finalWidth to stay on-page
      const imgX = visPos.x + (visPos.width + finalHeight) / 2;
      const centeredY = visPos.y + (visPos.height - finalWidth) / 2;
      const imgY = Math.max(centeredY, finalWidth);

      page.drawImage(image, {
        x: imgX,
        y: imgY,
        width: finalWidth,
        height: finalHeight,
        rotate: degrees(-fieldRotation),
      });
    } catch (err) {
      console.error('Error overlaying field-rotated signature:', err);
    }
    return;
  }

  if (rotAngle === 0) {
    await overlaySignature(pdfDoc, page, imageDataUrl, visPos);
    return;
  }

  try {
    const base64Data = imageDataUrl.split(',')[1];
    if (!base64Data) return;

    const imageBytes = Uint8Array.from(Buffer.from(base64Data, 'base64'));
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
    const scaleX = visPos.width / imgDims.width;
    const scaleY = visPos.height / imgDims.height;
    const scale = Math.min(scaleX, scaleY, 1);
    const finalWidth = imgDims.width * scale;
    const finalHeight = imgDims.height * scale;

    // Center the image within the visual field bounds
    const imgVx = visPos.x + (visPos.width - finalWidth) / 2;
    const imgVy = visPos.y + (visPos.height - finalHeight) / 2;

    // Transform the bottom-left corner of the image to pdf coords
    const { px, py } = visBLPointToPdf(imgVx, imgVy, rotAngle, mediaWidth, mediaHeight);

    // For rotated pages, swap image width/height in the unrotated space
    // and apply rotation so the image appears upright in the visual view
    page.drawImage(image, {
      x: px,
      y: py,
      width: finalHeight,  // swap for rotation
      height: finalWidth,  // swap for rotation
      rotate: degrees(rotAngle),
    });
  } catch (err) {
    console.error('Error overlaying rotated signature:', err);
  }
}

/**
 * Generate a PDF by overlaying data onto the original template PDF.
 * Option C: Each field_id has exactly ONE position entry → clean overlay, no bleeding.
 */
export async function generateTemplateOverlayPdf(
  templateBase64: string,
  fieldPositionMap: FieldPositionMap,
  submissionData: Record<string, any>,
  applicantName: string | undefined,
  formName: string,
  signatureMetadata?: { timestamp?: string; ip_address?: string; user_agent?: string }
): Promise<NextResponse> {
  try {
    const templateBytes = Uint8Array.from(
      Buffer.from(templateBase64, 'base64')
    );

    const pdfDoc = await PDFDocument.load(templateBytes);

    // Flatten existing form fields (radio buttons, checkboxes, text fields)
    // so they don't render ON TOP of our overlay circles and text.
    try {
      const form = pdfDoc.getForm();
      form.flatten();
      console.log('Flattened existing PDF form fields');
    } catch (flattenErr) {
      console.log('No form fields to flatten (or flatten error):', flattenErr);
    }

    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let fieldsOverlaid = 0;
    let fieldsSkipped = 0;

    for (const [fieldId, posEntry] of Object.entries(fieldPositionMap)) {
      const value = submissionData[fieldId];

      if (value === undefined || value === null || value === '') {
        fieldsSkipped++;
        continue;
      }

      for (const pos of posEntry.positions) {
        if (pos.page < 0 || pos.page >= pages.length) {
          console.warn(`Page ${pos.page} out of range (template has ${pages.length} pages)`);
          continue;
        }

        const page = pages[pos.page];
        const fontSize = pos.font_size || 10;
        const rotAngle = getPageRotationAngle(page);
        const mediaBox = page.getMediaBox();
        const mediaW = mediaBox.width;
        const mediaH = mediaBox.height;
        const fieldRot = pos.rotation; // Field-level rotation (e.g., -90 for WH-4)

        try {
          const fieldType = posEntry.type || '';

          // ── SSN Split: render XXX-XX-XXXX across 3 separate PDF boxes ──
          if (posEntry.ssn_positions && typeof value === 'string') {
            const ssnClean = value.replace(/\D/g, '');
            const parts: Record<string, string> = {
              group1: ssnClean.substring(0, 3),
              group2: ssnClean.substring(3, 5),
              group3: ssnClean.substring(5, 9),
            };
            for (const [group, groupPos] of Object.entries(posEntry.ssn_positions)) {
              const partValue = parts[group] || '';
              if (partValue) {
                drawTextOnPage(
                  page, partValue,
                  { x: groupPos.x, y: groupPos.y, width: groupPos.width, height: groupPos.height },
                  font, fontSize, rotAngle, mediaW, mediaH, fieldRot
                );
              }
            }
          } else if (fieldType === 'radio' && posEntry.option_positions && typeof value === 'string') {
            const selectedValue = value.toLowerCase();
            const optPos = posEntry.option_positions[selectedValue];
            if (optPos) {
              drawCircleOnPage(page, optPos.x, optPos.y, pos.height, rotAngle, mediaW, mediaH);
            } else {
              drawCircleOnPage(
                page, pos.x + pos.width / 2, pos.y + pos.height / 2,
                pos.height, rotAngle, mediaW, mediaH
              );
            }
          } else if (fieldType === 'radio' && typeof value === 'string') {
            drawCircleOnPage(
              page, pos.x + pos.width / 2, pos.y + pos.height / 2,
              pos.height, rotAngle, mediaW, mediaH
            );
          } else if (typeof value === 'boolean') {
            if (value) {
              drawCheckOnPage(page, pos, font, rotAngle, mediaW, mediaH);
            }
          } else if (typeof value === 'string' && (value === 'true' || value === 'false')) {
            if (value === 'true') {
              drawCheckOnPage(page, pos, font, rotAngle, mediaW, mediaH);
            }
          } else if (typeof value === 'string') {
            if (value.startsWith('data:image/')) {
              await overlaySignatureOnPage(pdfDoc, page, value, pos, rotAngle, mediaW, mediaH, fieldRot);
            } else if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
              const dateObj = new Date(value);
              const formatted = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                : value;
              drawTextOnPage(page, sanitizeText(formatted), pos, font, fontSize, rotAngle, mediaW, mediaH, fieldRot);
            } else if (fieldType === 'textarea') {
              drawWrappedOnPage(page, sanitizeText(value), pos, font, fontSize, rotAngle, mediaW, mediaH);
            } else {
              drawTextOnPage(page, sanitizeText(value), pos, font, fontSize, rotAngle, mediaW, mediaH, fieldRot);
            }
          } else if (typeof value === 'number') {
            drawTextOnPage(page, String(value), pos, font, fontSize, rotAngle, mediaW, mediaH, fieldRot);
          } else if (Array.isArray(value)) {
            const text = value.join(', ');
            drawTextOnPage(page, sanitizeText(text), pos, font, fontSize, rotAngle, mediaW, mediaH, fieldRot);
          } else if (typeof value === 'object' && value !== null) {
            const checked = Object.entries(value)
              .filter(([_, v]) => v === true || v === 'true')
              .map(([k]) => k.replace(/__/g, ' / '));
            if (checked.length > 0) {
              const text = checked.join(', ');
              drawTextOnPage(page, sanitizeText(text), pos, font, Math.min(fontSize, 8), rotAngle, mediaW, mediaH, fieldRot);
            }
          }

          fieldsOverlaid++;
        } catch (fieldErr) {
          console.error(`Error overlaying field ${fieldId} on page ${pos.page}:`, fieldErr);
        }
      }
    }

    // Add signature metadata footer if provided
    if (signatureMetadata) {
      const lastPage = pages[pages.length - 1];
      addSignatureMetadataFooter(lastPage, font, signatureMetadata);
    }

    console.log(`Template overlay: ${fieldsOverlaid} overlaid, ${fieldsSkipped} skipped`);

    const pdfBytes = await pdfDoc.save();
    const safeName = sanitizeText(formName || 'Form').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${safeName}_filled.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(pdfBytes.length),
      },
    });
  } catch (error) {
    console.error('Template overlay error:', error);
    return NextResponse.json(
      { error: 'Failed to generate template PDF', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
