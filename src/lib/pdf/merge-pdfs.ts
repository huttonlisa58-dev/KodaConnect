/**
 * PDF Merge and Signature Overlay Utilities
 * Combines multiple PDFs into a single document and applies signature overlays
 */

import { PDFDocument, PDFPage } from 'pdf-lib';

/**
 * Placement configuration for a signature overlay on a PDF page
 */
export interface SignaturePlacement {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Merges multiple PDF buffers into a single PDF document.
 * PDFs are concatenated in the order provided.
 *
 * @param pdfBuffers - Array of PDF buffers (Uint8Array) to merge
 * @returns Promise resolving to the merged PDF as Uint8Array
 * @throws Error if PDF loading or merging fails
 */
export async function mergePdfs(pdfBuffers: Uint8Array[]): Promise<Uint8Array> {
  if (!pdfBuffers || pdfBuffers.length === 0) {
    throw new Error('At least one PDF buffer is required for merging');
  }

  try {
    // Create a new document to hold merged content
    const mergedPdf = await PDFDocument.create();

    // Process each PDF buffer
    for (let i = 0; i < pdfBuffers.length; i++) {
      const pdfBuffer = pdfBuffers[i];

      if (!pdfBuffer || pdfBuffer.length === 0) {
        console.warn(`PDF at index ${i} is empty, skipping`);
        continue;
      }

      try {
        // Load the source PDF
        const sourcePdf = await PDFDocument.load(pdfBuffer);
        const pageCount = sourcePdf.getPageCount();

        // Copy all pages from source PDF to merged PDF
        const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
        copiedPages.forEach((page) => {
          mergedPdf.addPage(page);
        });

        console.log(`Merged PDF ${i + 1}: ${pageCount} pages added`);
      } catch (error) {
        console.error(`Failed to process PDF at index ${i}:`, error);
        throw new Error(`Failed to merge PDF ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Save and return the merged PDF
    const mergedBytes = await mergedPdf.save();
    console.log(`Successfully merged ${pdfBuffers.length} PDFs into single document`);

    return mergedBytes;
  } catch (error) {
    console.error('PDF merge error:', error);
    throw error;
  }
}

/**
 * Applies signature image overlays to a PDF document.
 * Signature images are embedded at specified placements (page, x, y, width, height).
 *
 * @param pdfBytes - The PDF document as Uint8Array
 * @param signatureImageBase64 - Base64-encoded PNG signature image (can include data:image/png;base64, prefix)
 * @param placements - Array of placement objects specifying where to overlay signatures
 * @returns Promise resolving to the PDF with overlaid signatures as Uint8Array
 * @throws Error if PDF loading, image processing, or overlay fails
 */
export async function applySignatureOverlay(
  pdfBytes: Uint8Array,
  signatureImageBase64: string,
  placements: SignaturePlacement[]
): Promise<Uint8Array> {
  if (!pdfBytes || pdfBytes.length === 0) {
    throw new Error('PDF bytes are required');
  }

  if (!signatureImageBase64) {
    throw new Error('Signature image (base64) is required');
  }

  if (!placements || placements.length === 0) {
    throw new Error('At least one placement is required');
  }

  try {
    // Load the PDF document
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    // Clean the base64 string (remove data URI prefix if present)
    const base64Data = signatureImageBase64.startsWith('data:')
      ? signatureImageBase64.split(',')[1]
      : signatureImageBase64;

    if (!base64Data) {
      throw new Error('Invalid base64 signature image data');
    }

    // Decode base64 to bytes
    const imageBytes = Buffer.from(base64Data, 'base64');

    // Embed the image in the PDF document
    const image = await pdfDoc.embedPng(imageBytes);

    // Apply signature to each specified placement
    let successCount = 0;

    for (const placement of placements) {
      const { page: pageNum, x, y, width, height } = placement;

      // Validate page number
      if (pageNum < 0 || pageNum >= pages.length) {
        console.warn(`Page ${pageNum} is out of range (PDF has ${pages.length} pages), skipping placement`);
        continue;
      }

      try {
        const page = pages[pageNum];

        // Draw the signature image at the specified position with specified dimensions
        page.drawImage(image, {
          x,
          y,
          width,
          height,
        });

        successCount++;
        console.log(`Applied signature to page ${pageNum} at (${x}, ${y}) with dimensions ${width}x${height}`);
      } catch (error) {
        console.error(`Failed to apply signature to page ${pageNum}:`, error);
        // Continue with other placements rather than failing entirely
      }
    }

    if (successCount === 0) {
      console.warn('No signatures were successfully applied');
    }

    // Save and return the modified PDF
    const resultBytes = await pdfDoc.save();
    console.log(`Successfully applied ${successCount}/${placements.length} signature overlays`);

    return resultBytes;
  } catch (error) {
    console.error('Signature overlay error:', error);
    throw error;
  }
}
