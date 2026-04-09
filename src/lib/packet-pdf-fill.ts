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
 * Converts special Unicode characters to ASCII equivalents
 */
function sanitizeTextForWinAnsi(text: string): string {
  if (!text) return text;

  return text
    // Smart quotes to straight quotes
    .replace(/[\u201C\u201D]/g, '"') // Left/right double quotes
    .replace(/[\u2018\u2019]/g, "'") // Left/right single quotes
    // Em dash and en dash to hyphen
    .replace(/[\u2014]/g, '-') // Em dash
    .replace(/[\u2013]/g, '-') // En dash
    // Other common Unicode characters
    .replace(/[\u2022]/g, '•') // Bullet
    .replace(/[\u2026]/g, '...') // Ellipsis
    .replace(/[\u00A9]/g, '(c)') // Copyright
    .replace(/[\u00AE]/g, '(R)') // Registered
    .replace(/[\u00A0]/g, ' ') // Non-breaking space
    // Handle any other non-ASCII characters by removing them
    .replace(/[^\x00-\x7F]/g, '?');
}

/**
 * Format a date value to a readable string
 */
function formatDate(value: any): string {
  if (!value) return '';

  if (typeof value === 'string') {
    // Try to parse ISO date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }
    return value;
  }

  if (value instanceof Date) {
    return value.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  return String(value);
}

/**
 * Truncate or resize text to fit within a width constraint
 */
function fitTextToWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
  font: any
): { text: string; finalFontSize: number } {
  // Rough character width estimate for Helvetica: approximately 0.5 * fontSize
  const estimatedCharWidth = fontSize * 0.5;
  const maxChars = Math.floor(maxWidth / estimatedCharWidth);

  if (text.length <= maxChars) {
    return { text, finalFontSize: fontSize };
  }

  // Truncate to fit
  const truncated = text.substring(0, Math.max(1, maxChars - 3)) + '...';

  return { text: truncated, finalFontSize: fontSize };
}

/**
 * Fill a single sub-form PDF with field data
 *
 * @param templatePdfBytes - The template PDF as bytes
 * @param formData - Form data keyed by field IDs
 * @param fieldMappings - Mappings from field IDs to PDF positions
 * @param options - Additional options (applicant name, submission date)
 * @returns Filled PDF as bytes
 */
export async function fillSubFormPdf(
  templatePdfBytes: Uint8Array,
  formData: Record<string, any>,
  fieldMappings: PacketFieldMapping[],
  options?: { applicantName?: string; submissionDate?: string }
): Promise<Uint8Array> {
  try {
    // Load the template PDF
    const pdfDoc = await PDFDocument.load(templatePdfBytes);
    const pages = pdfDoc.getPages();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Process each field mapping
    for (const mapping of fieldMappings) {
      const { pool_field_id, position } = mapping;
      const value = formData[pool_field_id];

      // Skip if no value
      if (value === undefined || value === null || value === '') {
        continue;
      }

      // Ensure page exists
      if (position.page >= pages.length) {
        console.warn(`Page ${position.page} does not exist in PDF`);
        continue;
      }

      const page = pages[position.page];
      const fontSize = position.font_size || 10;

      try {
        // Handle different value types
        if (typeof value === 'string') {
          // Check if it's a base64 image (signature or signature-like)
          if (
            value.startsWith('data:image/') ||
            value.startsWith('data:application/') ||
            (value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value))
          ) {
            // Handle as image
            await embedImageAtPosition(pdfDoc, page, value, position);
          } else if (value.includes('T') && value.match(/\d{4}-\d{2}-\d{2}/)) {
            // Likely a date string
            const formattedDate = formatDate(value);
            const sanitized = sanitizeTextForWinAnsi(formattedDate);
            drawTextAtPosition(page, sanitized, position, helvetica, fontSize);
          } else {
            // Regular text
            const sanitized = sanitizeTextForWinAnsi(value);
            drawTextAtPosition(page, sanitized, position, helvetica, fontSize);
          }
        } else if (typeof value === 'boolean') {
          // Handle checkbox
          drawCheckbox(page, value, position, helvetica);
        } else if (typeof value === 'number') {
          // Handle numbers
          const formattedNum = value.toString();
          drawTextAtPosition(page, formattedNum, position, helvetica, fontSize);
        } else if (value instanceof Date) {
          // Handle Date objects
          const formattedDate = formatDate(value);
          drawTextAtPosition(page, formattedDate, position, helvetica, fontSize);
        } else if (Array.isArray(value)) {
          // Handle arrays (e.g., multi-select checkboxes)
          const arrayStr = value.join(', ');
          const sanitized = sanitizeTextForWinAnsi(arrayStr);
          drawTextAtPosition(page, sanitized, position, helvetica, fontSize);
        } else if (typeof value === 'object') {
          // Handle objects (e.g., checkbox grids)
          if (mapping.cell_positions && mapping.cell_positions.length > 0) {
            // Render each checked cell individually at its mapped position
            for (const [cellKey, cellValue] of Object.entries(value)) {
              if (cellValue !== true && cellValue !== 'true') continue;

              // cellKey format: "rowId__colId" (double underscore separator)
              const separatorIdx = cellKey.indexOf('__');
              let rowId: string, colId: string;
              if (separatorIdx !== -1) {
                rowId = cellKey.substring(0, separatorIdx);
                colId = cellKey.substring(separatorIdx + 2);
              } else {
                const parts = cellKey.split('_');
                rowId = parts[0] || '';
                colId = parts.slice(1).join('_') || '';
              }

              const cellPos = mapping.cell_positions.find(
                cp => cp.row_id === rowId && cp.col_id === colId
              );

              if (cellPos && cellPos.page < pages.length) {
                const cellPage = pages[cellPos.page];
                drawCheckbox(cellPage, true, {
                  page: cellPos.page,
                  x: cellPos.x,
                  y: cellPos.y,
                  width: cellPos.width,
                  height: cellPos.height,
                }, helvetica);
              }
            }
          } else {
            // Fallback: render as comma-separated checked items
            const checkedItems = Object.entries(value)
              .filter(([_, v]) => v === true || v === 'true')
              .map(([k]) => k.replace(/__/g, ' / ').replace(/_/g, ' '));
            if (checkedItems.length > 0) {
              const text = sanitizeTextForWinAnsi(checkedItems.join(', '));
              drawTextAtPosition(page, text, position, helvetica, fontSize);
            }
          }
        }
      } catch (err) {
        console.error(
          `Error filling field ${pool_field_id} at page ${position.page}:`,
          err
        );
        // Continue with next field
      }
    }

    // Save and return the filled PDF
    const filledBytes = await pdfDoc.save();
    return new Uint8Array(filledBytes);
  } catch (err) {
    console.error('Error in fillSubFormPdf:', err);
    throw err;
  }
}

/**
 * Draw text at a specific position on a page
 */
function drawTextAtPosition(
  page: any,
  text: string,
  position: any,
  font: any,
  fontSize: number
): void {
  const { x, y, width } = position;

  // Fit text to width
  const { text: fittedText, finalFontSize } = fitTextToWidth(
    text,
    width,
    fontSize,
    font
  );

  page.drawText(fittedText, {
    x,
    y,
    size: finalFontSize,
    font,
    color: rgb(0, 0, 0),
  });
}

/**
 * Draw a checkbox (filled or empty) at a position
 */
function drawCheckbox(page: any, isChecked: boolean, position: any, font: any): void {
  const { x, y, width, height } = position;
  const boxSize = Math.min(width, height || 12);

  // Draw box border
  page.drawRectangle({
    x,
    y,
    width: boxSize,
    height: boxSize,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  // Draw checkmark if checked
  if (isChecked) {
    const checkSize = boxSize * 0.6;
    const offsetX = x + (boxSize - checkSize) / 2;
    const offsetY = y + (boxSize - checkSize) / 2;

    // Simple checkmark using lines
    page.drawLine({
      start: { x: offsetX, y: offsetY + checkSize / 3 },
      end: { x: offsetX + checkSize / 3, y: offsetY },
      thickness: 2,
      color: rgb(0, 0, 0),
    });

    page.drawLine({
      start: { x: offsetX + checkSize / 3, y: offsetY },
      end: { x: offsetX + checkSize, y: offsetY + checkSize },
      thickness: 2,
      color: rgb(0, 0, 0),
    });
  }
}

/**
 * Embed an image (signature, photo) at a position
 */
async function embedImageAtPosition(
  pdfDoc: PDFDocument,
  page: any,
  imageData: string,
  position: any
): Promise<void> {
  try {
    const { x, y, width, height } = position;

    // Extract base64 data if it's a data URL
    let imageBytes: Uint8Array;

    if (imageData.startsWith('data:')) {
      const base64String = imageData.replace(/^data:[^;]+;base64,/, '');
      imageBytes = Uint8Array.from(atob(base64String), (c) => c.charCodeAt(0));
    } else {
      // Assume it's raw base64
      imageBytes = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0));
    }

    // Determine image type and embed
    let image: any;

    if (imageData.includes('image/png') || imageData.includes('png')) {
      image = await pdfDoc.embedPng(imageBytes);
    } else if (imageData.includes('image/jpeg') || imageData.includes('jpg')) {
      image = await pdfDoc.embedJpg(imageBytes);
    } else {
      // Try PNG first, fall back to JPG
      try {
        image = await pdfDoc.embedPng(imageBytes);
      } catch {
        image = await pdfDoc.embedJpg(imageBytes);
      }
    }

    // Calculate dimensions maintaining aspect ratio
    const imgDims = image.scale(1);
    const ratio = Math.min(width / imgDims.width, height / imgDims.height);
    const finalWidth = imgDims.width * ratio;
    const finalHeight = imgDims.height * ratio;

    // Center in the provided position
    const centeredX = x + (width - finalWidth) / 2;
    const centeredY = y + (height - finalHeight) / 2;

    page.drawImage(image, {
      x: centeredX,
      y: centeredY,
      width: finalWidth,
      height: finalHeight,
    });
  } catch (err) {
    console.error('Error embedding image:', err);
    // Continue without the image
  }
}

/**
 * Fill all sub-forms in a packet
 *
 * @param packet - The form packet with sub-forms
 * @param formData - Form data to fill
 * @param options - Additional options
 * @returns Array of filled sub-form PDFs with metadata
 */
export async function fillAllSubForms(
  packet: FormPacket,
  formData: Record<string, any>,
  options?: { applicantName?: string; submissionDate?: string }
): Promise<{ sub_form_id: string; name: string; pdfBytes: Uint8Array }[]> {
  const results: { sub_form_id: string; name: string; pdfBytes: Uint8Array }[] =
    [];

  for (const subForm of packet.sub_forms) {
    // Skip reference-only forms (they don't need filling)
    if (subForm.is_reference_only) {
      console.log(`Skipping reference-only form: ${subForm.name}`);
      continue;
    }

    try {
      // Fetch the template PDF
      const response = await fetch(subForm.template_url);
      if (!response.ok) {
        console.error(
          `Failed to fetch template for ${subForm.name}: ${response.statusText}`
        );
        continue;
      }

      const templateBytes = new Uint8Array(await response.arrayBuffer());

      // Fill the PDF
      const filledBytes = await fillSubFormPdf(
        templateBytes,
        formData,
        subForm.field_mappings,
        options
      );

      results.push({
        sub_form_id: subForm.sub_form_id,
        name: subForm.name,
        pdfBytes: filledBytes,
      });
    } catch (err) {
      console.error(`Error filling sub-form ${subForm.name}:`, err);
      // Continue with next sub-form
    }
  }

  return results;
}

/**
 * Combine multiple filled PDFs into a single document
 *
 * @param filledPdfs - Array of filled PDFs
 * @returns Combined PDF as bytes
 */
export async function combineFilledPdfs(
  filledPdfs: { pdfBytes: Uint8Array }[]
): Promise<Uint8Array> {
  if (filledPdfs.length === 0) {
    throw new Error('No PDFs to combine');
  }

  if (filledPdfs.length === 1) {
    return filledPdfs[0].pdfBytes;
  }

  // Create a new PDF document
  const mergedPdf = await PDFDocument.create();

  // Copy pages from each filled PDF
  for (const filledPdf of filledPdfs) {
    try {
      const pdfDoc = await PDFDocument.load(filledPdf.pdfBytes);
      const pages = pdfDoc.getPages();

      // Copy all pages from this PDF
      for (const page of pages) {
        const copiedPages = await mergedPdf.copyPages(pdfDoc, [pages.indexOf(page)]);
        mergedPdf.addPage(copiedPages[0]);
      }
    } catch (err) {
      console.error('Error combining PDF:', err);
      // Continue with next PDF
    }
  }

  // Save the merged PDF
  const mergedBytes = await mergedPdf.save();
  return new Uint8Array(mergedBytes);
}
