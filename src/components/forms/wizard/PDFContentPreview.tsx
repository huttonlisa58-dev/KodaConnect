'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { FormDefinition, FormSection } from '@/lib/form-engine';
import { ScreenContent, TextParagraph, parseHtmlToScreens } from './HtmlContentParser';

interface PDFContentPreviewProps {
  definition: FormDefinition;
  pdfBase64?: string;
  contentOnlySections: FormSection[];
  primary: string;
  onContinue: () => void;
}

// Regex patterns for PDF text filtering
const FORM_FIELD_RE = /^(print\s*name|signature|date|phone\s*(number)?|employee\s*(signature|name|print)|emp[\s_]*(print|sign|date|phone))\s*[:_.\-—]/i;
const JUNK_LINE_RE = /^[_.\-—\s]+$/;
const BULLET_RE = /^(\d+[.)]\s|[a-z][.)]\s|[ivxIVX]+[.)]\s|[-•●○◦▪❑■□I]\s)/;

// ALL-CAPS detector (at least 3 words, >60% uppercase letters)
function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 6) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length > 0.7;
}

export function PDFContentPreview({
  definition,
  pdfBase64: pdfBase64Prop,
  contentOnlySections,
  primary,
  onContinue,
}: PDFContentPreviewProps) {
  const [screens, setScreens] = useState<ScreenContent[]>([]);
  const [currentScreen, setCurrentScreen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pdfError, setPdfError] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      setPdfError('');

      let base64Data = pdfBase64Prop;
      if (!base64Data && definition.form_id) {
        try {
          const resp = await fetch(`/api/form-pdf/${definition.form_id}`);
          if (resp.ok) {
            const data = await resp.json();
            base64Data = data.pdf_base64;
          }
        } catch (e) {
          console.error('Failed to fetch PDF:', e);
        }
      }
      if (!base64Data) {
        // No PDF available — fall back to parsing HTML content from sections
        if (contentOnlySections.some((s) => s.content)) {
          const htmlScreens = parseHtmlToScreens(contentOnlySections);
          setScreens(htmlScreens);
        }
        setLoading(false);
        return;
      }

      try {
        const pdfjsLib = await import('pdfjs-dist');
        if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }

        const raw = base64Data.startsWith('data:') ? base64Data.split(',')[1] : base64Data;
        const bin = atob(raw);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

        const doc = await pdfjsLib.getDocument({
          data: bytes, useWorkerFetch: false, isEvalSupported: false,
          useSystemFonts: true, disableAutoFetch: true,
        }).promise;

        // ── STEP 1: Extract raw lines per page ──
        interface RawLine {
          text: string; fontSize: number; isBold: boolean;
          y: number; x: number; gap: number; fontName: string;
        }
        const pageLines: { pageNum: number; lines: RawLine[] }[] = [];
        const bodyFontSizes: number[] = [];

        for (let pn = 1; pn <= doc.numPages; pn++) {
          const page = await doc.getPage(pn);
          const tc = await page.getTextContent();
          const ph = page.getViewport({ scale: 1 }).height;

          // Sort items top-to-bottom, left-to-right
          // CRITICAL: Filter out ZapfDingbats items BEFORE line grouping
          // PDF.js extracts dingbat chars as "n" or "I" which corrupt the text
          const items = tc.items
            .filter((it: any) => {
              if (!it.str || !it.str.trim()) return false;
              const fn = (it.fontName || '').toLowerCase();
              if (fn.includes('zapf') || fn.includes('ding') || fn.includes('symbol')) return false;
              return true;
            })
            .map((it: any) => ({
              text: it.str,
              y: ph - it.transform[5],
              x: it.transform[4],
              fontSize: Math.abs(it.transform[0]) || 12,
              fontName: it.fontName || '',
            }))
            .sort((a: any, b: any) => a.y - b.y || a.x - b.x);

          // Group into lines (items within 3pt of same Y)
          const lines: RawLine[] = [];
          let curBatch: typeof items = [];
          let curY = -9999;

          const flushLine = () => {
            if (curBatch.length === 0) return;
            const text = curBatch.map((i: any) => i.text).join(' ').trim();
            const avgSize = curBatch.reduce((s: number, i: any) => s + i.fontSize, 0) / curBatch.length;
            const bold = curBatch.some((i: any) =>
              i.fontName.toLowerCase().includes('bold') || i.fontName.toLowerCase().includes('heavy')
            );
            if (text) {
              lines.push({
                text, fontSize: avgSize, isBold: bold,
                y: curY, x: curBatch[0].x, gap: 0, fontName: curBatch[0].fontName,
              });
            }
          };

          for (const item of items) {
            if (Math.abs(item.y - curY) > 3) {
              flushLine();
              curBatch = [item];
              curY = item.y;
            } else {
              curBatch.push(item);
            }
          }
          flushLine();

          // Calculate gaps and record body font sizes
          for (let i = 0; i < lines.length; i++) {
            if (i > 0) lines[i].gap = lines[i].y - lines[i - 1].y;
            if (!lines[i].isBold && lines[i].fontSize < 12) {
              bodyFontSizes.push(lines[i].fontSize);
            }
          }

          if (lines.length > 0) pageLines.push({ pageNum: pn, lines });
        }

        // ── STEP 2: Calculate font thresholds ──
        // Body text in this PDF is 9-10pt; headers are 13-16pt
        const sortedBody = [...bodyFontSizes].sort((a, b) => a - b);
        const bodySize = sortedBody.length > 0
          ? sortedBody[Math.floor(sortedBody.length / 2)]
          : 10;

        // Typical line gap within a paragraph (~13pt for 9.5pt text)
        const allBodyGaps = pageLines
          .flatMap(p => p.lines)
          .filter(l => l.gap > 0 && !l.isBold && l.fontSize <= bodySize * 1.1)
          .map(l => l.gap);
        const sortedGaps = allBodyGaps.sort((a, b) => a - b);
        const normalGap = sortedGaps.length > 0
          ? sortedGaps[Math.floor(sortedGaps.length / 2)]
          : 13;

        // Paragraph break = gap > 2.2x normal line gap (~29pt for 13pt normal)
        const paraBreakThreshold = normalGap * 2.2;

        // Font thresholds: heading >= 13pt, subheading >= 11pt
        const headingMinSize = bodySize * 1.35;  // ~12.8pt for 9.5 body
        const subheadingMinSize = bodySize * 1.15; // ~10.9pt for 9.5 body

        // ── STEP 3: Build paragraphs with aggressive merging ──
        const allParagraphs: TextParagraph[] = [];

        for (const pageData of pageLines) {
          const paragraphs: TextParagraph[] = [];

          // Classify each line
          type LineClass = 'heading' | 'subheading' | 'section-title' | 'bullet' | 'body' | 'skip' | 'page-num';
          interface ClassifiedLine { text: string; cls: LineClass; gap: number; fontSize: number; isBold: boolean; x: number }

          const classified: ClassifiedLine[] = [];
          for (const line of pageData.lines) {
            let text = line.text.trim();

            // Skip form field lines, junk, and page numbers
            if (!text || JUNK_LINE_RE.test(text)) continue;
            if (FORM_FIELD_RE.test(text)) continue;
            if (/^page\s*\d+$/i.test(text) || (/^\d+$/.test(text) && line.fontSize <= 8)) continue;
            // Safety net: strip any residual single-char artifacts at start of line
            // PDF.js can render ZapfDingbats chars as "n", "I", "l" etc.
            text = text.replace(/^[nIl]\s+(?=[a-zA-Z])/, '');
            if (!text) continue;

            let cls: LineClass = 'body';

            if (line.fontSize >= headingMinSize && (line.isBold || isAllCaps(text))) {
              cls = 'heading';
            } else if (line.fontSize >= subheadingMinSize && line.isBold) {
              cls = 'subheading';
            } else if (line.isBold && text.length < 80 && !text.endsWith('.')) {
              // Short bold lines that don't end with period = section titles
              cls = 'section-title';
            } else if (BULLET_RE.test(text)) {
              cls = 'bullet';
            }

            classified.push({ text, cls, gap: line.gap, fontSize: line.fontSize, isBold: line.isBold, x: line.x });
          }

          // Now merge into paragraphs
          let buffer: string[] = [];
          let bufferType: TextParagraph['type'] = 'body';

          const flush = () => {
            if (buffer.length > 0) {
              paragraphs.push({ text: buffer.join(' '), type: bufferType });
              buffer = [];
            }
          };

          for (let i = 0; i < classified.length; i++) {
            const line = classified[i];
            const prevLine = i > 0 ? classified[i - 1] : null;

            if (line.cls === 'heading') {
              flush();
              // Merge consecutive heading lines (e.g., multi-line title)
              const headingParts = [line.text];
              while (i + 1 < classified.length && classified[i + 1].cls === 'heading' && classified[i + 1].gap < paraBreakThreshold) {
                i++;
                headingParts.push(classified[i].text);
              }
              paragraphs.push({ text: headingParts.join(' '), type: 'heading' });
            } else if (line.cls === 'subheading') {
              flush();
              // Merge consecutive subheading lines
              const parts = [line.text];
              while (i + 1 < classified.length && classified[i + 1].cls === 'subheading' && classified[i + 1].gap < paraBreakThreshold) {
                i++;
                parts.push(classified[i].text);
              }
              paragraphs.push({ text: parts.join(' '), type: 'subheading' });
            } else if (line.cls === 'section-title') {
              flush();
              // Bold inline titles — also merge consecutive bold lines
              const parts = [line.text];
              while (i + 1 < classified.length && classified[i + 1].cls === 'section-title' && classified[i + 1].gap < paraBreakThreshold) {
                i++;
                parts.push(classified[i].text);
              }
              paragraphs.push({ text: parts.join(' '), type: 'section-title' });
            } else if (line.cls === 'bullet') {
              flush();
              // Start a bullet, then merge continuation lines into it
              buffer = [line.text];
              bufferType = 'list-item';
              // Continuation: next line is body, not bold, similar font, small gap
              while (
                i + 1 < classified.length &&
                classified[i + 1].cls === 'body' &&
                !classified[i + 1].isBold &&
                classified[i + 1].gap < paraBreakThreshold &&
                Math.abs(classified[i + 1].fontSize - line.fontSize) < 2
              ) {
                i++;
                buffer.push(classified[i].text);
              }
              flush();
            } else {
              // Body text — merge aggressively
              // Start new paragraph only if: big gap, OR style change from previous
              const isParaBreak = line.gap > paraBreakThreshold;
              const styleChanged = prevLine && (
                prevLine.cls !== 'body' ||
                prevLine.isBold !== line.isBold ||
                Math.abs(prevLine.fontSize - line.fontSize) > 2
              );

              if ((isParaBreak || styleChanged) && buffer.length > 0 && bufferType === 'body') {
                flush();
              }

              if (buffer.length === 0) bufferType = 'body';
              buffer.push(line.text);
            }
          }
          flush();

          // Merge any very short "body" paragraphs that look like continuation
          // (under 40 chars, follows another body paragraph)
          const merged: TextParagraph[] = [];
          for (const p of paragraphs) {
            const prev = merged[merged.length - 1];
            if (
              prev &&
              prev.type === 'body' &&
              p.type === 'body' &&
              prev.text.length < 40 &&
              !prev.text.endsWith('.')
            ) {
              prev.text += ' ' + p.text;
            } else {
              merged.push({ ...p });
            }
          }

          allParagraphs.push(...merged);
        }

        // ── STEP 4: Split into bite-sized screens ──
        // Each heading/subheading/section-title starts a new screen
        const allScreens: ScreenContent[] = [];
        let curScreen: ScreenContent = { items: [] };

        for (const para of allParagraphs) {
          if (para.type === 'heading' || para.type === 'subheading' || para.type === 'section-title') {
            // Save previous screen if it has content
            if (curScreen.title || curScreen.items.length > 0) {
              allScreens.push(curScreen);
            }
            curScreen = { title: para, items: [] };
          } else {
            curScreen.items.push(para);
            // If a screen's body gets too long (>6 paragraphs), split it
            // to keep each screen easily scannable
            if (curScreen.items.length >= 7 && para.type === 'body') {
              allScreens.push(curScreen);
              curScreen = { items: [] }; // continuation screen, no title
            }
          }
        }
        if (curScreen.title || curScreen.items.length > 0) {
          allScreens.push(curScreen);
        }

        // If PDF.js produced screens, use them; otherwise fall back to HTML content
        if (allScreens.length > 0) {
          setScreens(allScreens);
        } else if (contentOnlySections.some((s) => s.content)) {
          const htmlScreens = parseHtmlToScreens(contentOnlySections);
          setScreens(htmlScreens);
        }
      } catch (err) {
        console.error('Failed to extract PDF text:', err);
        // Fall back to HTML content if PDF extraction fails
        if (contentOnlySections.some((s) => s.content)) {
          const htmlScreens = parseHtmlToScreens(contentOnlySections);
          setScreens(htmlScreens);
        } else {
          setPdfError('Failed to load document content');
        }
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
  }, [pdfBase64Prop, definition.form_id, contentOnlySections]);

  const totalScreens = screens.length;
  const activeScreen = screens[currentScreen] || null;
  const progress = totalScreens > 0 ? ((currentScreen + 1) / totalScreens) * 100 : 0;

  function goToScreen(idx: number) {
    setCurrentScreen(idx);
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f8fafb' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-bold text-gray-900 truncate">{definition.form_name}</h1>
            <span className="text-xs text-gray-400 shrink-0 ml-2">
              {totalScreens > 0 ? `${currentScreen + 1}/${totalScreens}` : 'Review'}
            </span>
          </div>
          {/* Progress bar */}
          {totalScreens > 1 && (
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%`, backgroundColor: primary }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 pb-28">
        {loading && (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" style={{ color: primary }} />
            <p className="text-gray-500 text-base">Loading document...</p>
          </div>
        )}

        {pdfError && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{pdfError}</span>
          </div>
        )}

        {activeScreen && (
          <div
            className="bg-white rounded-2xl shadow-sm overflow-hidden"
            style={{ border: '1px solid #e5e7eb' }}
          >
            {/* Screen title */}
            {activeScreen.title && activeScreen.title.type === 'heading' && (
              <div
                className="px-5 py-5 text-center"
                style={{
                  background: `linear-gradient(135deg, ${primary}15, ${primary}08)`,
                  borderBottom: `2px solid ${primary}25`,
                }}
              >
                <h2
                  className="text-xl font-extrabold leading-snug tracking-tight"
                  style={{ color: primary }}
                >
                  {activeScreen.title.text}
                </h2>
              </div>
            )}
            {activeScreen.title && activeScreen.title.type === 'subheading' && (
              <div
                className="px-5 py-4 flex items-center gap-3"
                style={{
                  backgroundColor: `${primary}08`,
                  borderBottom: `2px solid ${primary}20`,
                }}
              >
                <div
                  className="w-1.5 h-7 rounded-full flex-shrink-0"
                  style={{ backgroundColor: primary }}
                />
                <h3 className="text-lg font-bold text-gray-900 leading-snug">
                  {activeScreen.title.text}
                </h3>
              </div>
            )}
            {activeScreen.title && activeScreen.title.type === 'section-title' && (
              <div
                className="px-5 py-4 flex items-center gap-3"
                style={{ borderBottom: `2px solid ${primary}20` }}
              >
                <div
                  className="w-1.5 h-6 rounded-full flex-shrink-0"
                  style={{ backgroundColor: `${primary}80` }}
                />
                <p className="font-bold text-base uppercase tracking-wide" style={{ color: `${primary}cc` }}>
                  {activeScreen.title.text}
                </p>
              </div>
            )}

            {/* Screen body */}
            {activeScreen.items.length > 0 && (
              <div className="px-5 py-5 space-y-4">
                {activeScreen.items.map((para, pIdx) => {
                  if (para.type === 'list-item') {
                    return (
                      <div
                        key={pIdx}
                        className="flex gap-3 py-2.5 px-4 rounded-xl"
                        style={{ backgroundColor: '#f8f9fa' }}
                      >
                        <span
                          className="text-lg flex-shrink-0 mt-0"
                          style={{ color: primary }}
                        >
                          •
                        </span>
                        <p className="text-[15px] text-gray-700 leading-relaxed">
                          {para.text.replace(BULLET_RE, '')}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <p key={pIdx} className="text-[15px] text-gray-700 leading-relaxed">
                      {para.text}
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {screens.length === 0 && !loading && !pdfError && (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
            <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No document content available.</p>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t shadow-lg p-4">
        <div className="max-w-2xl mx-auto flex gap-3">
          {currentScreen > 0 && (
            <button
              onClick={() => goToScreen(currentScreen - 1)}
              className="flex-1 border-2 border-gray-200 text-gray-600 py-3.5 rounded-xl hover:bg-gray-50 flex items-center justify-center gap-1 font-medium"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}
          {currentScreen < totalScreens - 1 ? (
            <button
              onClick={() => goToScreen(currentScreen + 1)}
              className="flex-1 text-white py-3.5 rounded-xl font-medium hover:opacity-90 flex items-center justify-center gap-1 shadow-md"
              style={{ backgroundColor: primary }}
            >
              Continue <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={onContinue}
              className="flex-1 text-white py-3.5 rounded-xl font-medium hover:opacity-90 flex items-center justify-center gap-2 shadow-md"
              style={{ backgroundColor: primary }}
            >
              I Agree — Sign Now <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
