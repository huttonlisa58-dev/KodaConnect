'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Plus,
  Trash2,
  MousePointer,
  GripVertical,
  Check,
} from 'lucide-react';

/* ─── Types ─── */

export interface FieldPosition {
  label: string;
  type: string;
  page_number: number; // 1-indexed
  extracted_id?: string;
  entity?: string;
  position?: {
    x: number;      // PDF points from left
    y: number;      // PDF points from bottom
    width: number;
    height: number;
  };
  /** For checkbox_grid fields */
  rows?: string[];
  columns?: string[];
}

interface FieldPositionEditorProps {
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
  /** 'view' = read-only preview, 'edit' = full editor */
  mode: 'view' | 'edit';
  /** Called when fields are modified (edit mode only) */
  onFieldsChange?: (fields: FieldPosition[]) => void;
  /** Called when user wants to add a field — opens FieldFormDialog */
  onAddField?: (pageNumber: number, position: { x: number; y: number; width: number; height: number }) => void;
  /** Called when user double-clicks to edit a field */
  onEditField?: (field: FieldPosition, index: number) => void;
}

// US Letter dimensions in PDF points
const PDF_WIDTH = 612;
const PDF_HEIGHT = 792;

// Minimum field dimensions
const MIN_WIDTH = 30;
const MIN_HEIGHT = 15;

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

// Resize handle positions
type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLE_SIZE = 7;

/**
 * FieldPositionEditor renders a PDF page as a canvas and overlays colored rectangles
 * at each detected field position. In edit mode, fields can be selected, dragged,
 * resized, added, and deleted.
 */
export default function FieldPositionEditor({
  pdfFile,
  fields,
  pageNumbers,
  sectionName,
  onClose,
  mode,
  onFieldsChange,
  onAddField,
  onEditField,
}: FieldPositionEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);

  // Edit mode state
  const [selectedFieldIdx, setSelectedFieldIdx] = useState<number | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<HandlePosition | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const currentPageNumber = pageNumbers[currentPageIdx]; // 1-indexed

  // Fields on the current page
  const pageFields = fields.filter(f => f.page_number === currentPageNumber && f.position);

  // Map page field indices back to global field indices
  const globalIndices = fields
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.page_number === currentPageNumber && f.position)
    .map(({ i }) => i);

  // Load pdfjs-dist dynamically
  const loadPdf = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Dynamic import of pdfjs-dist
      const pdfjsLib = await import('pdfjs-dist');

      // Use self-hosted worker to comply with Vercel CSP (script-src 'self')
      if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      }

      const arrayBuffer = await pdfFile.arrayBuffer();
      const doc = await pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
        disableAutoFetch: true,
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

  // Clear selection on page change
  useEffect(() => {
    setSelectedFieldIdx(null);
    setAddMode(false);
  }, [currentPageIdx]);

  /* ─── Coordinate conversion helpers ─── */

  const screenToPdf = useCallback((screenX: number, screenY: number) => {
    return {
      x: screenX / scale,
      y: PDF_HEIGHT - screenY / scale,
    };
  }, [scale]);

  const pdfToScreen = useCallback((pdfX: number, pdfY: number, height: number) => {
    return {
      x: pdfX * scale,
      y: (PDF_HEIGHT - pdfY - height) * scale,
    };
  }, [scale]);

  /* ─── Mouse event handlers (edit mode) ─── */

  const getOverlayCoords = useCallback((e: React.MouseEvent) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (mode !== 'edit') return;

    if (addMode) {
      // Click in add mode = add field at this position
      const coords = getOverlayCoords(e);
      const pdfCoords = screenToPdf(coords.x, coords.y);

      // Default field size: 150x20 PDF points
      const newPosition = {
        x: Math.max(0, Math.min(PDF_WIDTH - 150, pdfCoords.x)),
        y: Math.max(20, Math.min(PDF_HEIGHT, pdfCoords.y)),
        width: 150,
        height: 20,
      };

      setAddMode(false);
      if (onAddField) {
        onAddField(currentPageNumber, newPosition);
      }
      return;
    }

    // Click on empty space = deselect
    setSelectedFieldIdx(null);
  }, [mode, addMode, getOverlayCoords, screenToPdf, currentPageNumber, onAddField]);

  const handleFieldMouseDown = useCallback((e: React.MouseEvent, pageFieldIdx: number) => {
    if (mode !== 'edit') return;
    e.stopPropagation();

    const globalIdx = globalIndices[pageFieldIdx];
    setSelectedFieldIdx(globalIdx);
    setAddMode(false);

    // Start drag
    const coords = getOverlayCoords(e);
    setDragStart(coords);
    setIsDragging(true);
  }, [mode, globalIndices, getOverlayCoords]);

  const handleFieldDoubleClick = useCallback((e: React.MouseEvent, pageFieldIdx: number) => {
    if (mode !== 'edit') return;
    e.stopPropagation();

    const globalIdx = globalIndices[pageFieldIdx];
    const field = fields[globalIdx];
    if (onEditField) {
      onEditField(field, globalIdx);
    }
  }, [mode, globalIndices, fields, onEditField]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, handle: HandlePosition, pageFieldIdx: number) => {
    if (mode !== 'edit') return;
    e.stopPropagation();

    const globalIdx = globalIndices[pageFieldIdx];
    setSelectedFieldIdx(globalIdx);

    const coords = getOverlayCoords(e);
    setDragStart(coords);
    setIsResizing(true);
    setResizeHandle(handle);
  }, [mode, globalIndices, getOverlayCoords]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (mode !== 'edit' || selectedFieldIdx === null || !dragStart) return;
    if (!isDragging && !isResizing) return;

    const coords = getOverlayCoords(e);
    const dx = (coords.x - dragStart.x) / scale;
    const dy = (coords.y - dragStart.y) / scale;

    const field = fields[selectedFieldIdx];
    if (!field?.position) return;

    const pos = { ...field.position };

    if (isDragging && !isResizing) {
      // Move field
      pos.x = Math.max(0, Math.min(PDF_WIDTH - pos.width, pos.x + dx));
      // Remember: PDF y is from bottom, screen y is from top. Moving down on screen = decreasing PDF y
      pos.y = Math.max(pos.height, Math.min(PDF_HEIGHT, pos.y - dy));
    } else if (isResizing && resizeHandle) {
      // Resize field based on handle position
      switch (resizeHandle) {
        case 'e':
          pos.width = Math.max(MIN_WIDTH, pos.width + dx);
          break;
        case 'w':
          pos.width = Math.max(MIN_WIDTH, pos.width - dx);
          pos.x = pos.x + dx;
          break;
        case 's':
          // Screen south = PDF y decreases
          pos.height = Math.max(MIN_HEIGHT, pos.height + dy);
          pos.y = pos.y - dy;
          break;
        case 'n':
          pos.height = Math.max(MIN_HEIGHT, pos.height - dy);
          break;
        case 'se':
          pos.width = Math.max(MIN_WIDTH, pos.width + dx);
          pos.height = Math.max(MIN_HEIGHT, pos.height + dy);
          pos.y = pos.y - dy;
          break;
        case 'sw':
          pos.width = Math.max(MIN_WIDTH, pos.width - dx);
          pos.x = pos.x + dx;
          pos.height = Math.max(MIN_HEIGHT, pos.height + dy);
          pos.y = pos.y - dy;
          break;
        case 'ne':
          pos.width = Math.max(MIN_WIDTH, pos.width + dx);
          pos.height = Math.max(MIN_HEIGHT, pos.height - dy);
          break;
        case 'nw':
          pos.width = Math.max(MIN_WIDTH, pos.width - dx);
          pos.x = pos.x + dx;
          pos.height = Math.max(MIN_HEIGHT, pos.height - dy);
          break;
      }

      // Clamp to page bounds
      pos.x = Math.max(0, pos.x);
      pos.y = Math.max(pos.height, Math.min(PDF_HEIGHT, pos.y));
      pos.width = Math.min(pos.width, PDF_WIDTH - pos.x);
    }

    // Update field
    const updatedFields = [...fields];
    updatedFields[selectedFieldIdx] = {
      ...field,
      position: pos,
    };

    setDragStart(coords);
    setHasChanges(true);
    if (onFieldsChange) {
      onFieldsChange(updatedFields);
    }
  }, [mode, selectedFieldIdx, dragStart, isDragging, isResizing, resizeHandle, fields, scale, getOverlayCoords, onFieldsChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
    setDragStart(null);
  }, []);

  /* ─── Delete selected field ─── */

  const handleDeleteSelected = useCallback(() => {
    if (selectedFieldIdx === null) return;
    const updatedFields = fields.filter((_, i) => i !== selectedFieldIdx);
    setSelectedFieldIdx(null);
    setHasChanges(true);
    if (onFieldsChange) {
      onFieldsChange(updatedFields);
    }
  }, [selectedFieldIdx, fields, onFieldsChange]);

  /* ─── Close with confirm ─── */

  const handleClose = useCallback(() => {
    if (hasChanges && mode === 'edit') {
      const confirmed = window.confirm('You have unsaved position changes. Close anyway?');
      if (!confirmed) return;
    }
    onClose();
  }, [hasChanges, mode, onClose]);

  /* ─── Navigation ─── */

  const goToPrevPage = () => {
    if (currentPageIdx > 0) setCurrentPageIdx(currentPageIdx - 1);
  };

  const goToNextPage = () => {
    if (currentPageIdx < pageNumbers.length - 1) setCurrentPageIdx(currentPageIdx + 1);
  };

  /* ─── Keyboard shortcuts ─── */

  useEffect(() => {
    if (mode !== 'edit') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedFieldIdx !== null) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
      if (e.key === 'Escape') {
        if (addMode) {
          setAddMode(false);
        } else if (selectedFieldIdx !== null) {
          setSelectedFieldIdx(null);
        } else {
          handleClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, selectedFieldIdx, addMode, handleDeleteSelected, handleClose]);

  /* ─── Render ─── */

  const selectedField = selectedFieldIdx !== null ? fields[selectedFieldIdx] : null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h3 className="font-semibold text-gray-900">
              {sectionName} — {mode === 'edit' ? 'Field Editor' : 'Field Preview'}
            </h3>
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
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar (edit mode only) */}
        {mode === 'edit' && (
          <div className="flex items-center gap-2 px-4 py-2 border-b bg-gray-50">
            <button
              onClick={() => { setAddMode(false); setSelectedFieldIdx(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                !addMode ? 'bg-white shadow-sm border border-gray-200 text-gray-700' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <MousePointer className="w-4 h-4" />
              Select
            </button>
            <button
              onClick={() => { setAddMode(true); setSelectedFieldIdx(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                addMode ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Plus className="w-4 h-4" />
              Add Field
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedFieldIdx === null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>

            <div className="flex-1" />

            {/* Selected field info */}
            {selectedField && selectedField.position && (
              <span className="text-xs text-gray-400">
                {selectedField.label} — {Math.round(selectedField.position.x)},{Math.round(selectedField.position.y)} ({Math.round(selectedField.position.width)}×{Math.round(selectedField.position.height)})
              </span>
            )}

            {hasChanges && (
              <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                <GripVertical className="w-3 h-3" />
                Unsaved changes
              </span>
            )}

            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors"
            >
              <Check className="w-4 h-4" />
              Done
            </button>
          </div>
        )}

        {/* Content */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto p-4 bg-gray-100"
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
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
            <div
              className="relative inline-block mx-auto shadow-lg"
              style={{ cursor: addMode ? 'crosshair' : 'default' }}
            >
              {/* PDF page canvas */}
              <canvas ref={canvasRef} className="block" />

              {/* Field overlay */}
              <div
                ref={overlayRef}
                className="absolute inset-0"
                style={{ pointerEvents: mode === 'edit' ? 'auto' : 'none' }}
                onClick={handleOverlayClick}
                onMouseMove={handleMouseMove}
              >
                {pageFields.length === 0 && mode === 'view' ? (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded-lg shadow-md flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      <span className="font-medium">No fields detected on this page</span>
                    </div>
                  </div>
                ) : (
                  pageFields.map((field, idx) => {
                    if (!field.position) return null;

                    const globalIdx = globalIndices[idx];
                    const isSelected = selectedFieldIdx === globalIdx;
                    const colors = FIELD_COLORS[field.type] || DEFAULT_COLOR;

                    // Convert PDF coordinates to screen coordinates
                    const x = field.position.x * scale;
                    const w = field.position.width * scale;
                    const h = field.position.height * scale;
                    const y = (PDF_HEIGHT - field.position.y - field.position.height) * scale;

                    return (
                      <div key={`${field.label}-${idx}`}>
                        {/* Field rectangle */}
                        <div
                          className={`absolute ${mode === 'edit' ? 'cursor-move' : ''}`}
                          style={{
                            left: `${x}px`,
                            top: `${y}px`,
                            width: `${w}px`,
                            height: `${h}px`,
                            backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.25)' : colors.bg,
                            border: isSelected
                              ? '2px solid #2563eb'
                              : `1.5px solid ${colors.border}`,
                            borderRadius: '2px',
                            zIndex: isSelected ? 10 : 1,
                          }}
                          title={`${field.label} (${field.type})`}
                          onMouseDown={(e) => handleFieldMouseDown(e, idx)}
                          onDoubleClick={(e) => handleFieldDoubleClick(e, idx)}
                          onClick={(e) => {
                            if (mode === 'edit') {
                              e.stopPropagation();
                              setSelectedFieldIdx(globalIdx);
                              setAddMode(false);
                            }
                          }}
                        >
                          {/* Field label */}
                          {h > 12 && w > 40 && (
                            <span
                              className="absolute text-[9px] font-medium leading-none truncate px-0.5 pointer-events-none"
                              style={{
                                color: isSelected ? '#2563eb' : colors.text,
                                top: '1px',
                                left: '2px',
                                maxWidth: `${w - 4}px`,
                              }}
                            >
                              {field.label}
                            </span>
                          )}
                        </div>

                        {/* Resize handles (edit mode + selected) */}
                        {mode === 'edit' && isSelected && (
                          <>
                            {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as HandlePosition[]).map(
                              (handle) => {
                                const handleStyle = getHandleStyle(handle, x, y, w, h);
                                return (
                                  <div
                                    key={handle}
                                    className="absolute bg-white border-2 border-blue-600 z-20"
                                    style={{
                                      ...handleStyle,
                                      width: `${HANDLE_SIZE}px`,
                                      height: `${HANDLE_SIZE}px`,
                                      cursor: getHandleCursor(handle),
                                    }}
                                    onMouseDown={(e) => handleResizeMouseDown(e, handle, idx)}
                                  />
                                );
                              }
                            )}
                          </>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Add mode hint */}
                {addMode && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-teal-600 text-white px-3 py-1.5 rounded-lg shadow-lg text-sm font-medium pointer-events-none z-30">
                    Click to place a new field
                  </div>
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
          {mode === 'edit' && (
            <>
              <span className="w-px h-3 bg-gray-300" />
              <span className="text-gray-400">Click field to select, drag to move, double-click to edit. Press Delete to remove.</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Handle positioning helpers ─── */

function getHandleStyle(
  handle: HandlePosition,
  x: number,
  y: number,
  w: number,
  h: number
): React.CSSProperties {
  const half = HANDLE_SIZE / 2;

  switch (handle) {
    case 'nw': return { left: `${x - half}px`, top: `${y - half}px` };
    case 'n':  return { left: `${x + w / 2 - half}px`, top: `${y - half}px` };
    case 'ne': return { left: `${x + w - half}px`, top: `${y - half}px` };
    case 'e':  return { left: `${x + w - half}px`, top: `${y + h / 2 - half}px` };
    case 'se': return { left: `${x + w - half}px`, top: `${y + h - half}px` };
    case 's':  return { left: `${x + w / 2 - half}px`, top: `${y + h - half}px` };
    case 'sw': return { left: `${x - half}px`, top: `${y + h - half}px` };
    case 'w':  return { left: `${x - half}px`, top: `${y + h / 2 - half}px` };
  }
}

function getHandleCursor(handle: HandlePosition): string {
  switch (handle) {
    case 'nw': case 'se': return 'nwse-resize';
    case 'ne': case 'sw': return 'nesw-resize';
    case 'n': case 's':   return 'ns-resize';
    case 'e': case 'w':   return 'ew-resize';
  }
}
