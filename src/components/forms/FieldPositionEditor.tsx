'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';

interface Field {
  field_id: string;
  label: string;
  type: string;
  page_number: number;
  position?: { x: number; y: number; width: number; height: number };
}

interface FieldPositionEditorProps {
  pdfBase64: string;
  fields: Field[];
  pageCount: number;
  onFieldPositionChange: (
    fieldId: string,
    position: { x: number; y: number; width: number; height: number }
  ) => void;
}

const getFieldColor = (type: string): string => {
  const colors: Record<string, string> = {
    text: '#3B82F6',
    signature: '#8B5CF6',
    date: '#10B981',
    checkbox: '#F59E0B',
    select: '#EC4899',
    textarea: '#06B6D4',
  };
  return colors[type] || '#6B7280';
};

export function FieldPositionEditor({
  pdfBase64,
  fields,
  pageCount,
  onFieldPositionChange,
}: FieldPositionEditorProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfImageUrl, setPdfImageUrl] = useState<string>('');
  const [fieldPositions, setFieldPositions] = useState<
    Record<string, { x: number; y: number; width: number; height: number }>
  >({});
  const [draggingField, setDraggingField] = useState<string | null>(null);
  const [resizingField, setResizingField] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Initialize field positions from props
  useEffect(() => {
    const initialPositions: Record<string, any> = {};
    fields.forEach((field) => {
      if (field.position) {
        initialPositions[field.field_id] = field.position;
      }
    });
    setFieldPositions(initialPositions);
  }, [fields]);

  // Convert base64 PDF to image (simplified - assumes single page or needs pdfjs)
  useEffect(() => {
    if (pdfBase64) {
      // For demo, use the base64 directly as data URL
      // In production, you'd use pdfjs-dist to render specific page
      setPdfImageUrl(`data:application/pdf;base64,${pdfBase64}`);
    }
  }, [pdfBase64]);

  const currentPageFields = fields.filter((f) => f.page_number === currentPage);
  const unpositionedFields = currentPageFields.filter((f) => !fieldPositions[f.field_id]);
  const positionedFields = currentPageFields.filter((f) => fieldPositions[f.field_id]);

  const handleFieldMouseDown = (
    fieldId: string,
    event: React.MouseEvent,
    isResize: boolean = false
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const container = pdfContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const currentPos = fieldPositions[fieldId];

    if (isResize) {
      setResizingField(fieldId);
      setDragOffset({
        x: event.clientX - rect.left - (currentPos?.x ?? 0) - (currentPos?.width ?? 100),
        y: event.clientY - rect.top - (currentPos?.y ?? 0) - (currentPos?.height ?? 100),
      });
    } else {
      setDraggingField(fieldId);
      setDragOffset({
        x: event.clientX - rect.left - (currentPos?.x ?? 0),
        y: event.clientY - rect.top - (currentPos?.y ?? 0),
      });
    }
  };

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const container = pdfContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = Math.max(0, event.clientX - rect.left - dragOffset.x);
      const y = Math.max(0, event.clientY - rect.top - dragOffset.y);

      if (draggingField) {
        setFieldPositions((prev) => ({
          ...prev,
          [draggingField]: {
            ...prev[draggingField],
            x: Math.round(x),
            y: Math.round(y),
          },
        }));
        setIsDirty(true);
      } else if (resizingField) {
        const current = fieldPositions[resizingField];
        if (current) {
          const width = Math.max(50, x - current.x);
          const height = Math.max(30, y - current.y);
          setFieldPositions((prev) => ({
            ...prev,
            [resizingField]: {
              ...prev[resizingField],
              width: Math.round(width),
              height: Math.round(height),
            },
          }));
          setIsDirty(true);
        }
      }
    },
    [draggingField, resizingField, dragOffset]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingField(null);
    setResizingField(null);
  }, []);

  useEffect(() => {
    if (draggingField || resizingField) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingField, resizingField, handleMouseMove, handleMouseUp]);

  const handleSavePositions = () => {
    Object.entries(fieldPositions).forEach(([fieldId, position]) => {
      onFieldPositionChange(fieldId, position);
    });
    setIsDirty(false);
  };

  const handleDragUnpositionedField = (
    fieldId: string,
    event: React.DragEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    const container = pdfContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setFieldPositions((prev) => ({
      ...prev,
      [fieldId]: {
        x: Math.max(0, Math.round(x - 50)),
        y: Math.max(0, Math.round(y - 15)),
        width: 100,
        height: 30,
      },
    }));
    setIsDirty(true);
  };

  return (
    <div className="w-full h-full flex gap-6 bg-gray-50 p-6 rounded-xl">
      {/* Main PDF Editor */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Page Navigation */}
        <div className="flex items-center justify-between bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="p-2 hover:bg-gray-100 disabled:opacity-30 rounded-lg transition"
          >
            <ChevronLeft size={20} className="text-gray-600" />
          </button>

          <div className="text-sm font-medium text-gray-700">
            Page {currentPage} of {pageCount}
          </div>

          <button
            onClick={() => setCurrentPage(Math.min(pageCount, currentPage + 1))}
            disabled={currentPage === pageCount}
            className="p-2 hover:bg-gray-100 disabled:opacity-30 rounded-lg transition"
          >
            <ChevronRight size={20} className="text-gray-600" />
          </button>
        </div>

        {/* PDF Container with Field Overlays */}
        <div
          ref={pdfContainerRef}
          className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-auto relative"
          style={{
            backgroundImage: `url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23f9fafb" width="100" height="100"/%3E%3Cpath d="M100 0L0 100M0 0L100 100" stroke="%23e5e7eb" stroke-width="0.5"/%3E%3C/svg%3E')`,
          }}
        >
          {pdfImageUrl ? (
            <div className="relative inline-block min-w-full">
              {/* PDF Image Background */}
              <img
                src={pdfImageUrl}
                alt={`PDF Page ${currentPage}`}
                className="w-full h-auto opacity-10"
              />

              {/* Field Overlays */}
              {positionedFields.map((field) => {
                const pos = fieldPositions[field.field_id];
                if (!pos) return null;

                return (
                  <div
                    key={field.field_id}
                    className="absolute border-2 border-dashed cursor-move group"
                    style={{
                      left: `${pos.x}px`,
                      top: `${pos.y}px`,
                      width: `${pos.width}px`,
                      height: `${pos.height}px`,
                      backgroundColor: `${getFieldColor(field.type)}20`,
                      borderColor: getFieldColor(field.type),
                    }}
                    onMouseDown={(e) => handleFieldMouseDown(field.field_id, e, false)}
                  >
                    {/* Field Label */}
                    <div
                      className="text-xs font-semibold text-white px-1 py-0.5 truncate pointer-events-none"
                      style={{ backgroundColor: getFieldColor(field.type) }}
                    >
                      {field.label}
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute bottom-0 right-0 w-4 h-4 bg-gray-400 rounded-tl cursor-se-resize opacity-0 group-hover:opacity-100 transition"
                      onMouseDown={(e) => handleFieldMouseDown(field.field_id, e, true)}
                      style={{
                        borderTopLeftRadius: '0px',
                        borderBottomRightRadius: '4px',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              PDF loading or no PDF provided
            </div>
          )}
        </div>
      </div>

      {/* Sidebar: Unpositioned Fields & Save */}
      <div className="w-80 flex flex-col gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">Unpositioned Fields</h3>

          {unpositionedFields.length > 0 ? (
            <div className="space-y-2">
              {unpositionedFields.map((field) => (
                <div
                  key={field.field_id}
                  draggable
                  onDragEnd={(e) => handleDragUnpositionedField(field.field_id, e as any)}
                  className="p-2 bg-gray-50 border border-gray-200 rounded cursor-move hover:bg-gray-100 transition"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getFieldColor(field.type) }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">
                        {field.label}
                      </p>
                      <p className="text-xs text-gray-500">{field.type}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Drag to PDF</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">All fields positioned on this page</p>
          )}
        </div>

        {/* Positioned Fields Summary */}
        {positionedFields.length > 0 && (
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">
              Positioned Fields ({positionedFields.length})
            </h3>
            <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
              {positionedFields.map((field) => {
                const pos = fieldPositions[field.field_id];
                return (
                  <div key={field.field_id} className="flex items-center gap-2 py-1">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getFieldColor(field.type) }}
                    />
                    <span className="text-gray-700 truncate">{field.label}</span>
                    <span className="text-gray-500 ml-auto flex-shrink-0">
                      ({pos?.x}, {pos?.y})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSavePositions}
          disabled={!isDirty}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition shadow-sm disabled:cursor-not-allowed"
        >
          <Save size={18} />
          Save Positions
        </button>

        {isDirty && (
          <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
            You have unsaved changes
          </p>
        )}
      </div>
    </div>
  );
}
