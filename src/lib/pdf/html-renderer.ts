/**
 * HTML Rendering for PDFs
 * Converts HTML content to formatted PDF text with proper styling
 * Supports inline tags: <strong>, <em>, <u> with proper font rendering
 */

import { PDFPage, PDFFont, rgb } from 'pdf-lib';
import { sanitizeText, stripHtmlTags, decodeHtmlEntities, stripAnchorTags } from './text-utils';

interface HtmlBlock {
  tag: string;
  text: string;
}

/**
 * Represents a token of text with formatting flags
 */
interface InlineToken {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

/**
 * Available fonts for PDF rendering
 */
interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

/**
 * Parse HTML blocks into structured format
 * Supports: h2, h3, h4, p, ul/li
 */
export function parseHtmlBlocks(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];

  let cleaned = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Convert anchor tags to their text content before block parsing
  cleaned = stripAnchorTags(cleaned);

  const blockRegex = /<(h[2-4]|p|li|ul|ol)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match;
  let lastIndex = 0;

  while ((match = blockRegex.exec(cleaned)) !== null) {
    const between = cleaned.substring(lastIndex, match.index).trim();
    if (between && !between.match(/^<\/?(?:ul|ol|div|section)(?:\s[^>]*)?>$/i)) {
      const stripped = stripHtmlTags(between).trim();
      if (stripped) {
        blocks.push({ tag: 'p', text: stripped });
      }
    }

    const tag = match[1].toLowerCase();
    const content = match[2].trim();

    if (tag === 'ul' || tag === 'ol') {
      const liRegex = /<li(?:\s[^>]*)?>([\s\S]*?)<\/li>/gi;
      let liMatch;
      while ((liMatch = liRegex.exec(content)) !== null) {
        blocks.push({ tag: 'li', text: liMatch[1].trim() });
      }
    } else {
      blocks.push({ tag, text: content });
    }

    lastIndex = match.index + match[0].length;
  }

  const remaining = cleaned.substring(lastIndex).trim();
  if (remaining) {
    const stripped = stripHtmlTags(remaining).trim();
    if (stripped) {
      blocks.push({ tag: 'p', text: stripped });
    }
  }

  if (blocks.length === 0) {
    const stripped = stripHtmlTags(html).trim();
    if (stripped) {
      blocks.push({ tag: 'p', text: stripped });
    }
  }

  return blocks;
}

/**
 * Parse inline HTML tags (<strong>, <em>, <u>) into tokens with formatting flags
 * Handles nested tags and converts them to a flat token array with state flags
 *
 * Example: "This is <strong>bold</strong> and <em>italic</em>" becomes:
 * [{text:"This is ",bold:false,italic:false,underline:false},
 *  {text:"bold",bold:true,italic:false,underline:false},
 *  {text:" and ",bold:false,italic:false,underline:false},
 *  {text:"italic",bold:false,italic:true,underline:false}]
 */
export function parseInlineTokens(html: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let bold = false;
  let italic = false;
  let underline = false;

  // Strip any remaining HTML tags that aren't inline formatting (e.g. <a>, <span>)
  let cleanedHtml = stripAnchorTags(html);

  // Split on opening and closing tags: <strong>, </strong>, <em>, </em>, <u>, </u>
  const parts = cleanedHtml.split(/(<strong>|<\/strong>|<b>|<\/b>|<em>|<\/em>|<i>|<\/i>|<u>|<\/u>)/gi);

  for (const part of parts) {
    if (!part) continue;

    const lowerPart = part.toLowerCase();

    // Track tag state
    if (lowerPart === '<strong>' || lowerPart === '<b>') {
      bold = true;
    } else if (lowerPart === '</strong>' || lowerPart === '</b>') {
      bold = false;
    } else if (lowerPart === '<em>' || lowerPart === '<i>') {
      italic = true;
    } else if (lowerPart === '</em>' || lowerPart === '</i>') {
      italic = false;
    } else if (lowerPart === '<u>') {
      underline = true;
    } else if (lowerPart === '</u>') {
      underline = false;
    } else if (part.trim()) {
      // Regular text content - strip any leftover tags, decode entities, sanitize
      let cleanText = part.replace(/<[^>]*>/g, '');
      cleanText = decodeHtmlEntities(cleanText);
      cleanText = sanitizeText(cleanText);
      if (cleanText) {
        // Split into individual words to allow proper word wrapping.
        // Each word becomes its own token so drawPdfTextWithFormatting
        // can break lines between any two words.
        const words = cleanText.split(/(\s+)/);
        for (const word of words) {
          if (word) {
            tokens.push({
              text: word,
              bold,
              italic,
              underline,
            });
          }
        }
      }
    }
  }

  // Merge ONLY whitespace tokens into the preceding word token.
  // Do NOT merge word tokens together — keeping them separate
  // allows drawPdfTextWithFormatting to wrap lines between words.
  const merged: InlineToken[] = [];
  for (const token of tokens) {
    const last = merged[merged.length - 1];
    const isWhitespace = /^\s+$/.test(token.text);
    if (
      isWhitespace &&
      last &&
      last.bold === token.bold &&
      last.italic === token.italic &&
      last.underline === token.underline
    ) {
      // Append trailing space to previous token
      last.text += token.text;
    } else {
      merged.push({ ...token });
    }
  }

  return merged;
}

/**
 * Draw text on a PDF page with word wrapping and page overflow handling
 */
export function drawPdfText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  color: ReturnType<typeof rgb>,
  ensureSpace: (needed: number) => void,
  newPage: () => void,
  getCurrentPage: () => PDFPage
): number {
  if (!text) return y;

  const lineSpacing = fontSize * 1.4;
  const words = text.split(/\s+/);
  let currentLine = '';
  let currentY = y;
  let activePage = page;
  const MARGIN = 50;

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    let testWidth = maxWidth + 1;
    try {
      testWidth = font.widthOfTextAtSize(testLine, fontSize);
    } catch {
      testWidth = testLine.length * fontSize * 0.5;
    }

    if (testWidth > maxWidth && currentLine) {
      if (currentY - lineSpacing < MARGIN) {
        newPage();
        activePage = getCurrentPage();
        currentY = 792 - MARGIN;
      }
      try {
        activePage.drawText(currentLine, {
          x,
          y: currentY - fontSize,
          size: fontSize,
          font,
          color,
        });
      } catch { /* skip unrenderable */ }
      currentY -= lineSpacing;
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    if (currentY - lineSpacing < MARGIN) {
      newPage();
      activePage = getCurrentPage();
      currentY = 792 - MARGIN;
    }
    try {
      activePage.drawText(currentLine, {
        x,
        y: currentY - fontSize,
        size: fontSize,
        font,
        color,
      });
    } catch { /* skip */ }
    currentY -= lineSpacing;
  }

  return currentY;
}

/**
 * Draw text with inline formatting (strong, em, u) on a PDF page
 * Uses tokens to render different parts with appropriate fonts
 */
export function drawPdfTextWithFormatting(
  page: PDFPage,
  html: string,
  x: number,
  y: number,
  fonts: PdfFonts,
  fontSize: number,
  maxWidth: number,
  color: ReturnType<typeof rgb>,
  ensureSpace: (needed: number) => void,
  newPage: () => void,
  getCurrentPage: () => PDFPage
): number {
  if (!html) return y;

  const tokens = parseInlineTokens(html);
  if (tokens.length === 0) return y;

  const lineSpacing = fontSize * 1.4;
  let currentLine: { tokens: InlineToken[]; width: number } = { tokens: [], width: 0 };
  let currentY = y;
  let activePage = page;
  const MARGIN = 50;

  const getFont = (token: InlineToken): PDFFont => {
    if (token.bold && token.italic) {
      // Fallback to bold if no bold+italic font exists
      return fonts.italic;
    } else if (token.bold) {
      return fonts.bold;
    } else if (token.italic) {
      return fonts.italic;
    }
    return fonts.regular;
  };

  const getTokenWidth = (token: InlineToken): number => {
    const font = getFont(token);
    try {
      return font.widthOfTextAtSize(token.text, fontSize);
    } catch {
      return token.text.length * fontSize * 0.5;
    }
  };

  const drawLine = (lineTokens: InlineToken[]) => {
    if (lineTokens.length === 0) return;

    if (currentY - lineSpacing < MARGIN) {
      newPage();
      activePage = getCurrentPage();
      currentY = 792 - MARGIN;
    }

    let xOffset = x;
    for (const token of lineTokens) {
      const font = getFont(token);
      try {
        // Draw text
        activePage.drawText(token.text, {
          x: xOffset,
          y: currentY - fontSize,
          size: fontSize,
          font,
          color,
        });

        // Draw underline if needed
        if (token.underline) {
          const width = getTokenWidth(token);
          activePage.drawLine({
            start: { x: xOffset, y: currentY - fontSize - 1 },
            end: { x: xOffset + width, y: currentY - fontSize - 1 },
            thickness: 0.5,
            color,
          });
        }

        xOffset += getTokenWidth(token);
      } catch {
        // Skip unrenderable text
      }
    }

    currentY -= lineSpacing;
  };

  // Process tokens into lines based on maxWidth
  for (const token of tokens) {
    const tokenWidth = getTokenWidth(token);

    // Check if token is a newline
    if (token.text === '\n') {
      drawLine(currentLine.tokens);
      currentLine = { tokens: [], width: 0 };
      continue;
    }

    // Check if adding this token exceeds line width
    if (currentLine.width + tokenWidth > maxWidth && currentLine.tokens.length > 0) {
      drawLine(currentLine.tokens);
      currentLine = { tokens: [token], width: tokenWidth };
    } else {
      currentLine.tokens.push(token);
      currentLine.width += tokenWidth;
    }
  }

  // Draw remaining line
  if (currentLine.tokens.length > 0) {
    drawLine(currentLine.tokens);
  }

  return currentY;
}

/**
 * Parse HTML content and render it as formatted text on the PDF.
 * Supports: h2, h3, h4, p, ul/li, strong, em, u
 */
export function renderHtmlContent(
  html: string,
  marginX: number,
  startY: number,
  contentWidth: number,
  fonts: PdfFonts | { font: PDFFont; fontBold: PDFFont; fontItalic: PDFFont },
  sizes: { bodySize: number; headingSize: number; subheadingSize: number },
  ensureSpace: (needed: number) => void,
  newPage: () => void,
  getCurrentPage: () => PDFPage,
  setYPos: (y: number) => void
): number {
  let yPos = startY;
  const LINE_HEIGHT = 1.4;
  const BULLET_INDENT = 15;

  // Normalize fonts to PdfFonts interface for backward compatibility
  const normalizedFonts: PdfFonts = {
    regular: (fonts as any).font || (fonts as any).regular,
    bold: (fonts as any).fontBold || (fonts as any).bold,
    italic: (fonts as any).fontItalic || (fonts as any).italic,
  };

  const blocks = parseHtmlBlocks(html);

  for (const block of blocks) {
    switch (block.tag) {
      case 'h2': {
        yPos -= 10;
        const lineH = sizes.headingSize * LINE_HEIGHT;
        ensureSpace(lineH + 4);
        yPos = drawPdfTextWithFormatting(
          getCurrentPage(),
          block.text,
          marginX,
          yPos,
          { regular: normalizedFonts.bold, bold: normalizedFonts.bold, italic: normalizedFonts.bold },
          sizes.headingSize,
          contentWidth,
          rgb(0.1, 0.1, 0.1),
          ensureSpace,
          newPage,
          getCurrentPage
        );
        yPos -= 6;
        break;
      }
      case 'h3': {
        yPos -= 8;
        const lineH = sizes.subheadingSize * LINE_HEIGHT;
        ensureSpace(lineH + 4);
        yPos = drawPdfTextWithFormatting(
          getCurrentPage(),
          block.text,
          marginX,
          yPos,
          { regular: normalizedFonts.bold, bold: normalizedFonts.bold, italic: normalizedFonts.bold },
          sizes.subheadingSize,
          contentWidth,
          rgb(0.15, 0.15, 0.15),
          ensureSpace,
          newPage,
          getCurrentPage
        );
        yPos -= 4;
        break;
      }
      case 'h4': {
        yPos -= 6;
        const lineH = sizes.bodySize * LINE_HEIGHT;
        ensureSpace(lineH + 4);
        yPos = drawPdfTextWithFormatting(
          getCurrentPage(),
          block.text,
          marginX,
          yPos,
          { regular: normalizedFonts.bold, bold: normalizedFonts.bold, italic: normalizedFonts.bold },
          sizes.bodySize,
          contentWidth,
          rgb(0.2, 0.2, 0.2),
          ensureSpace,
          newPage,
          getCurrentPage
        );
        yPos -= 3;
        break;
      }
      case 'li': {
        const bulletText = `*  ${stripHtmlTags(block.text)}`;
        const lineH = sizes.bodySize * LINE_HEIGHT;
        ensureSpace(lineH);
        yPos = drawPdfTextWithFormatting(
          getCurrentPage(),
          bulletText,
          marginX + BULLET_INDENT,
          yPos,
          normalizedFonts,
          sizes.bodySize,
          contentWidth - BULLET_INDENT,
          rgb(0.15, 0.15, 0.15),
          ensureSpace,
          newPage,
          getCurrentPage
        );
        yPos -= 2;
        break;
      }
      case 'p':
      default: {
        const text = block.text.trim();
        if (!text) continue;
        const lineH = sizes.bodySize * LINE_HEIGHT;
        ensureSpace(lineH);
        yPos = drawPdfTextWithFormatting(
          getCurrentPage(),
          text,
          marginX,
          yPos,
          normalizedFonts,
          sizes.bodySize,
          contentWidth,
          rgb(0.15, 0.15, 0.15),
          ensureSpace,
          newPage,
          getCurrentPage
        );
        yPos -= 4;
        break;
      }
    }
  }

  return yPos;
}
