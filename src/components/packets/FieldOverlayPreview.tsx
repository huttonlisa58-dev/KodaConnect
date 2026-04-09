'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

/**
 * Field position data from the import analysis
 */
interface FieldPosition {
  label: string;
  type: string;
  page_number: number; // 1-indexed
  position?: {
    x: number;      // PDF points from left
    y: number;      // PDF points from bottom
    width: number;
    height: number;
  };
}

interface FieldOverlayPreviewProps {
  /** The PDF file to render pages from */
  pdfFile: File;
  /** Fields with position data */
  fields: FieldPosition[];
  /** Which pages belong to this section (1-indexed) */
  pageNumbers: number[];
  /** Section name for the title */
  sectionName: string;
  /** Close handler */
  onClose: () => void;
}

// US Letter dimensions in PDF points
const PDF_WIDTH = 612;
const PDF_HEIGHT = 792;

// Color palette for field type highlighting
const FIELD_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  text:           { bg: 'rgba(59, 130, 246, 0.15)',  border: 'rgba(59, 130, 246, 0.6)',  text: '#2563eb' },
  email:          { bg: 'rgba(59, 130, 246, 0.15)',  border: 'rgba(59, 130, 246, 0.6)',  text: '#2563eb' },
  phone:          { bg: 'rgba(59, 130, 246, 0.15)',  border: 'rgba(59, 130, 246, 0.6)',  text: '#2563eb' },
  date:           { bg: 'rgba(147, 51, 234, 0.15)',  border: 'rgba(147, 51, 234, 0.6)',  text: '#7c3aed' },
  number:         { bg: 'rgba(147, 51, 234, 0.15)',  border: 'rgba(147, 51, 234, 0.6)',  text: '#7c3aed' },
  textarea:       { bg: 'rgba(16, 185, 129, 0.15)',  border: 'rgba(16, 185, 129, 0.6)',  text: '#059669' },
  signature:      { bg: 'rgba(245, 158, 11, 0.15)',  border: 'rgba(245, 158, 11, 0.6)',  text: '#d97706' },
  checkbox:       { bg: 'rgba(236, 72, 153, 0.15)',  border: 'rgba(236, 72, 153, 0.6)',  text: '#db2777' },
  checkbox_group: { bg: 'rgba(236, 72, 153, 0.15)',  border: 'rgba(236, 72, 153, 0.6)',  text: '#db2777' },
  checkbox_grid:  { bg: 'rgba(236, 72, 153, 0.15)',  border: 'rgba(236, 72, 153, 0.6)',  text: '#db2777' },
  radio:          { bg: 'rgba(236, 72, 153, 0.15)',  border: 'rgba(236, 72, 153, 0.6)',  text: '#db2777' },
  select:         { bg: 'rgba(6, 182, 212, 0.15)',   border: 'rgba(6, 182, 212, 0.6)',   text: '#0891b2' },
  file_upload:    { bg: 'rgba(107, 114, 128, 0.15)', border: 'rgba(107, 114, 128, 0.6)', text: '#4b5563' },
};

const DEFAULT_COLOR = { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.6)', text: '#2563eb' };

/**
 * FieldOverlayPreview renders a PDF page as a canvas and overlays colored rectangles
 * at each detected field position. This helps users visually verify field extraction
 * accuracy and spot pages where fields may have been missed.
 */
export default function FieldOverlayPreview({
  pdfFile,
  fields,
  pageNumbers,
  sectionName,
  onClose,
}: FieldOverlayPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);

  const currentPageNumber = pageNumbers[currentPageIdx]; // 1-indexed

  // Fields on the current page
  const pageFields = fields.filter(f => f.page_number === currentPageNumber && f.position);

  // Load pdfjs-dist dynamically (it's a large library)
  const loadPdf = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Dynamic import of pdfjs-dist
      const pdfjsLib = await import('pdfjs-dist');

      // Use self-hosted worker to comply with Vercel CSP (script-src 'self')
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

      const arrayBuffer = await pdfFile.arrayBuffer();
      const doc = await pdfjsLib.getDocument({
        data: arrayBuffer,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
      }).promise;
      setPdfDoc(doc);
    } catch (err) {
      console.error('Failed to load PDF:', err);
      setError('Failed to load PDF for preview');
    } finally {
      setLoading(false);
    }
  }, [pdfFile]);

  useEffect(() => {
    loadPdf();
  }, [loadPdf]);

  // Render the current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPageNumber);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Calculate scale for coordinate mapping
        setScale(viewport.width / PDF_WIDTH);

        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;
      } catch (err) {
        console.error('Failed to render page:', err);
        setError('Failed to render page');
      }
    };

    renderPage();
  }, [pdfDoc, currentPageNumber]);

  const goToPrevPage = () => {
    if (currentPageIdx > 0) setCurrentPageIdx(currentPageIdx - 1);
  };

  const goToNextPage = () => {
    if (currentPageIdx < pageNumbers.length - 1) setCurrentPageIdx(currentPageIdx + 1);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h3 className="font-semibold text-gray-900">{sectionName} — Field Preview</h3>
            <p className="text-sm text-gray-500">
              Page {currentPageNumber} ({pageFields.length} field{pageFields.length !== 1 ? 's' : ''} detected)
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Page navigation */}
            <button
              onClick={goToPrevPage}
              disabled={currentPageIdx === 0}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-600 min-w-[80px] text-center">
              {currentPageIdx + 1} of {pageNumbers.length}
            </span>
            <button
              onClick={goToNextPage}
              disabled={currentPageIdx === pageNumbers.length - 1}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-gray-200 mx-1" />
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 bg-gray-100">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
              <span className="ml-3 text-gray-600">Loading PDF preview...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64 text-red-600">
              <AlertTriangle className="w-5 h-5 mr-2" />
              {error}
            </div>
          ) : (
            <div className="relative inline-block mx-auto shadow-lg">
              {/* PDF page canvas */}
              <canvas ref={canvasRef} className="block" />

              {/* Field overlay rectangles */}
              <div
                ref={overlayRef}
                className="absolute inset-0 pointer-events-none"
              >
                {pageFields.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded-lg shadow-md flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      <span className="font-medium">No fields detected on this page</span>
                    </div>
                  </div>
                ) : (
                  pageFields.map((field, idx) => {
                    if (!field.position) return null;

                    const colors = FIELD_COLORS[field.type] || DEFAULT_COLOR;

                    // Convert PDF coordinates to screen coordinates
                    // PDF origin is bottom-left; screen origin is top-left
                    const x = field.position.x * scale;
                    const w = field.position.width * scale;
                    const h = field.position.height * scale;
                    // PDF y is from bottom, convert to top-down
                    const y = (PDF_HEIGHT - field.position.y - field.position.height) * scale;

                    return (
                      <div
                        key={`${field.label}-${idx}`}
                        className="absolute pointer-events-auto"
                        style={{
                          left: `${x}px`,
                          top: `${y}px`,
                          width: `${w}px`,
                          height: `${h}px`,
                          backgroundColor: colors.bg,
                          border: `1.5px solid ${colors.border}`,
                          borderRadius: '2px',
                        }}
                        title={`${field.label} (${field.type})`}
                      >
                        {/* Field label - only show if rectangle is big enough */}
                        {h > 12 && w > 40 && (
                          <span
                            className="absolute text-[9px] font-medium leading-none truncate px-0.5"
                            style={{
                              color: colors.text,
                              top: '1px',
                              left: '2px',
                              maxWidth: `${w - 4}px`,
                            }}
                          >
                            {field.label}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="px-4 py-2 border-t bg-gray-50 flex flex-wrap gap-3 text-xs text-gray-600">
          <span className="font-medium">Field types:</span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(59, 130, 246, 0.4)' }} />
            Text/Email/Phone
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(147, 51, 234, 0.4)' }} />
            Date/Number
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(16, 185, 129, 0.4)' }} />
            Textarea
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(245, 158, 11, 0.4)' }} />
            Signature
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(236, 72, 153, 0.4)' }} />
            Checkbox/Radio
          </span>
        </div>
      </div>
    </div>
  );
}
