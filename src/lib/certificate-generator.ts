import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from 'pdf-lib';

interface CertificateData {
  caregiver_name: string;
  course_name: string;
  course_hours: string;
  completion_date: string; // formatted date string
  certificate_id: string;
  company_name?: string;
  company_tagline?: string;
  representative_name?: string;
  representative_title?: string;
  logo_image_bytes?: Uint8Array; // PNG or JPG bytes
  signature_image_bytes?: Uint8Array; // PNG or JPG bytes
  regulation_text?: string;
  retention_text?: string;
}

/** Helper: draw text centered horizontally on the page */
function drawCenteredText(
  page: PDFPage,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  pageWidth: number
) {
  const textWidth = font.widthOfTextAtSize(text, size);
  const x = (pageWidth - textWidth) / 2;
  page.drawText(text, { x, y, size, font, color });
}

/**
 * Generates a professional Certificate of Completion PDF using pdf-lib
 * @param data Certificate information and optional images
 * @returns Promise<Uint8Array> PDF document bytes
 */
export async function generateCertificatePdf(
  data: CertificateData
): Promise<Uint8Array> {
  // Create a new PDF document in landscape letter size (792 x 612 points)
  const doc = await PDFDocument.create();
  const page = doc.addPage([792, 612]);

  // Load fonts
  const timesBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const timesRoman = await doc.embedFont(StandardFonts.TimesRoman);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);

  // Colors
  const goldColor = rgb(0.85, 0.65, 0.13);
  const darkTeal = rgb(0, 0.4, 0.4);
  const darkNavy = rgb(0, 0, 0.3);

  // Page dimensions
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 35;

  // Draw decorative border with diamonds
  drawDecorativeBorder(page, margin, margin, pageWidth - margin * 2, pageHeight - margin * 2, goldColor);

  let currentY = pageHeight - 60;

  // Embed and draw logo if provided
  if (data.logo_image_bytes) {
    const logo = await embedImage(doc, data.logo_image_bytes);
    const logoHeight = 50;
    const logoWidth = (logoHeight * logo.width) / logo.height;
    page.drawImage(logo, {
      x: (pageWidth - logoWidth) / 2,
      y: currentY - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
    currentY -= logoHeight + 15;
  }

  // Company name and tagline
  const companyName = data.company_name || 'Complete Homecare GA';
  const companyTagline = data.company_tagline || 'We deliver Complete Care to you';

  drawCenteredText(page, companyName, currentY, helveticaBold, 20, darkTeal, pageWidth);
  currentY -= 18;

  drawCenteredText(page, companyTagline, currentY, helvetica, 11, darkNavy, pageWidth);
  currentY -= 30;

  // Main header: "Certificate of Completion"
  drawCenteredText(page, 'Certificate of Completion', currentY, timesBold, 42, darkNavy, pageWidth);
  currentY -= 40;

  // "HEREBY CERTIFIES THAT"
  drawCenteredText(page, 'HEREBY CERTIFIES THAT', currentY, helveticaBold, 12, darkNavy, pageWidth);
  currentY -= 25;

  // Caregiver name in large bold
  const nameText = data.caregiver_name.toUpperCase();
  const nameY = currentY;
  drawCenteredText(page, nameText, nameY, timesBold, 28, darkNavy, pageWidth);

  // Draw line underneath name
  const nameWidth = timesBold.widthOfTextAtSize(nameText, 28);
  const nameStartX = (pageWidth - nameWidth) / 2;
  page.drawLine({
    start: { x: nameStartX, y: nameY - 5 },
    end: { x: nameStartX + nameWidth, y: nameY - 5 },
    thickness: 2,
    color: goldColor,
  });
  currentY -= 40;

  // Completion text
  drawCenteredText(page, 'has successfully completed the required training course', currentY, timesRoman, 12, darkNavy, pageWidth);
  currentY -= 20;

  // Course name in bold
  drawCenteredText(page, data.course_name, currentY, timesBold, 14, darkNavy, pageWidth);
  currentY -= 22;

  // Course hours
  drawCenteredText(page, `${data.course_hours} Hours of Instruction`, currentY, timesRoman, 12, darkNavy, pageWidth);
  currentY -= 25;

  // Regulation text
  const regulationText =
    data.regulation_text ||
    'In accordance with Georgia DCH Rule 111-8-65-.09 — Private Home Care Provider Requirements';
  drawCenteredText(page, regulationText, currentY, helvetica, 10, darkNavy, pageWidth);
  currentY -= 25;

  // Horizontal divider line
  page.drawLine({
    start: { x: margin + 40, y: currentY },
    end: { x: pageWidth - margin - 40, y: currentY },
    thickness: 1,
    color: goldColor,
  });
  currentY -= 30;

  // Bottom section: Date, Signature, Representative
  const bottomSectionY = currentY;
  const columnWidth = (pageWidth - margin * 2) / 3;
  const leftColX = margin + 20;
  const centerColX = margin + columnWidth + 20;
  const rightColX = margin + columnWidth * 2 + 20;

  const signatureLineY = bottomSectionY - 50;
  const signatureLabelY = bottomSectionY - 70;

  // Embed and draw signature if provided
  if (data.signature_image_bytes) {
    const signature = await embedImage(doc, data.signature_image_bytes);
    const signatureHeight = 35;
    const signatureWidth = (signatureHeight * signature.width) / signature.height;
    const signatureCenterX = centerColX + columnWidth / 2 - signatureWidth / 2;
    page.drawImage(signature, {
      x: signatureCenterX,
      y: signatureLineY + 5,
      width: signatureWidth,
      height: signatureHeight,
    });
  }

  // Left column: Date of Completion
  page.drawLine({
    start: { x: leftColX, y: signatureLineY },
    end: { x: leftColX + columnWidth - 40, y: signatureLineY },
    thickness: 1,
    color: darkNavy,
  });
  page.drawText('Date of Completion', { x: leftColX, y: signatureLabelY, size: 10, font: helveticaBold, color: darkNavy });
  page.drawText(data.completion_date, { x: leftColX, y: signatureLabelY - 15, size: 11, font: helvetica, color: darkNavy });

  // Center column: Caregiver Signature
  page.drawLine({
    start: { x: centerColX, y: signatureLineY },
    end: { x: centerColX + columnWidth - 40, y: signatureLineY },
    thickness: 1,
    color: darkNavy,
  });
  page.drawText('Caregiver Signature', { x: centerColX, y: signatureLabelY, size: 10, font: helveticaBold, color: darkNavy });

  // Right column: Representative Name and Title
  page.drawLine({
    start: { x: rightColX, y: signatureLineY },
    end: { x: rightColX + columnWidth - 40, y: signatureLineY },
    thickness: 1,
    color: darkNavy,
  });

  const representativeName = data.representative_name || '';
  const representativeTitle = data.representative_title || '';
  if (representativeName) {
    page.drawText(representativeName, { x: rightColX, y: signatureLabelY, size: 10, font: helveticaBold, color: darkNavy });
  }
  if (representativeTitle) {
    page.drawText(representativeTitle, { x: rightColX, y: signatureLabelY - 15, size: 9, font: helvetica, color: darkNavy });
  }

  // Footer
  const footerY = 20;
  const retentionText =
    data.retention_text ||
    'This record shall be retained for a period of four (4) years from the date of completion.';

  const footerLine = `Certificate ID: ${data.certificate_id} | ${companyName} — A DBA of Universal Home Care and Services`;
  drawCenteredText(page, footerLine, footerY + 10, helvetica, 9, darkNavy, pageWidth);
  drawCenteredText(page, retentionText, footerY - 5, helvetica, 8, darkNavy, pageWidth);

  // Save and return PDF bytes
  const pdfBytes = await doc.save();
  return pdfBytes;
}

/**
 * Draws a decorative border with diamond accents at corners and midpoints
 */
function drawDecorativeBorder(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  color: ReturnType<typeof rgb>
): void {
  const lineThickness = 3;

  // Outer border rectangle
  page.drawRectangle({
    x, y, width, height,
    borderColor: color,
    borderWidth: lineThickness,
  });

  // Inner decorative border (thinner)
  page.drawRectangle({
    x: x + 8, y: y + 8,
    width: width - 16, height: height - 16,
    borderColor: color,
    borderWidth: 1,
  });

  // Diamond shapes at corners and midpoints
  const diamondSize = 8;
  drawDiamond(page, x, y + height, diamondSize, color);
  drawDiamond(page, x + width, y + height, diamondSize, color);
  drawDiamond(page, x, y, diamondSize, color);
  drawDiamond(page, x + width, y, diamondSize, color);
  drawDiamond(page, x + width / 2, y + height, diamondSize, color);
  drawDiamond(page, x + width / 2, y, diamondSize, color);
  drawDiamond(page, x, y + height / 2, diamondSize, color);
  drawDiamond(page, x + width, y + height / 2, diamondSize, color);
}

/**
 * Draws a diamond shape (rotated square) at the specified position
 */
function drawDiamond(
  page: PDFPage,
  centerX: number,
  centerY: number,
  size: number,
  color: ReturnType<typeof rgb>
): void {
  const halfSize = size / 2;
  // Draw as 4 triangles using lines since drawPolygon doesn't exist in pdf-lib
  page.drawLine({ start: { x: centerX, y: centerY + halfSize }, end: { x: centerX + halfSize, y: centerY }, thickness: 1, color });
  page.drawLine({ start: { x: centerX + halfSize, y: centerY }, end: { x: centerX, y: centerY - halfSize }, thickness: 1, color });
  page.drawLine({ start: { x: centerX, y: centerY - halfSize }, end: { x: centerX - halfSize, y: centerY }, thickness: 1, color });
  page.drawLine({ start: { x: centerX - halfSize, y: centerY }, end: { x: centerX, y: centerY + halfSize }, thickness: 1, color });
}

/**
 * Embeds an image (PNG or JPG) from bytes and returns the PDFImage
 */
async function embedImage(
  doc: PDFDocument,
  imageBytes: Uint8Array
): Promise<PDFImage> {
  const isPng =
    imageBytes[0] === 0x89 &&
    imageBytes[1] === 0x50 &&
    imageBytes[2] === 0x4e &&
    imageBytes[3] === 0x47;

  if (isPng) {
    return await doc.embedPng(imageBytes);
  } else {
    return await doc.embedJpg(imageBytes);
  }
}
