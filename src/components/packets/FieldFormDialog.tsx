'use client';

import { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';

/**
 * Field types available for manual field creation/editing
 */
const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'signature', label: 'Signature' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'checkbox_group', label: 'Checkbox Group' },
  { value: 'checkbox_grid', label: 'Checkbox Grid' },
  { value: 'radio', label: 'Radio' },
  { value: 'select', label: 'Dropdown / Select' },
  { value: 'file_upload', label: 'File Upload' },
];

const ENTITY_TYPES = [
  { value: '', label: 'None / General' },
  { value: 'applicant', label: 'Applicant' },
  { value: 'emergency_contact', label: 'Emergency Contact' },
  { value: 'employer', label: 'Employer' },
  { value: 'physician', label: 'Physician' },
  { value: 'reference', label: 'Reference' },
];

interface FieldFormData {
  label: string;
  type: string;
  entity: string;
  page_number: number;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  extracted_id?: string;
  rows?: string[];
  columns?: string[];
}

interface FieldFormDialogProps {
  /** Pre-filled data (from click position or existing field) */
  initialData: FieldFormData;
  /** Whether we're editing an existing field vs adding new */
  isEditing: boolean;
  /** Close handler */
  onClose: () => void;
  /** Save handler */
  onSave: (data: FieldFormData) => void;
}

/**
 * FieldFormDialog — modal for adding or editing a field's metadata.
 * Appears when user clicks on PDF in add mode, or double-clicks an existing field.
 */
export default function FieldFormDialog({
  initialData,
  isEditing,
  onClose,
  onSave,
}: FieldFormDialogProps) {
  const [label, setLabel] = useState(initialData.label || '');
  const [type, setType] = useState(initialData.type || 'text');
  const [entity, setEntity] = useState(initialData.entity || '');
  const [x, setX] = useState(Math.round(initialData.position.x));
  const [y, setY] = useState(Math.round(initialData.position.y));
  const [width, setWidth] = useState(Math.round(initialData.position.width));
  const [height, setHeight] = useState(Math.round(initialData.position.height));
  const [rows, setRows] = useState(initialData.rows?.join(', ') || '');
  const [columns, setColumns] = useState(initialData.columns?.join(', ') || '');
  const [error, setError] = useState('');

  const isGridType = type === 'checkbox_grid';

  const handleSubmit = () => {
    // Validate
    if (!label.trim()) {
      setError('Label is required');
      return;
    }

    const data: FieldFormData = {
      label: label.trim(),
      type,
      entity,
      page_number: initialData.page_number,
      position: { x, y, width, height },
      extracted_id: initialData.extracted_id || `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };

    if (isGridType) {
      data.rows = rows.split(',').map(s => s.trim()).filter(Boolean);
      data.columns = columns.split(',').map(s => s.trim()).filter(Boolean);
    }

    onSave(data);
  };

  // Handle Enter key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit Field' : 'Add Field'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4">
          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Field Label <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => { setLabel(e.target.value); setError(''); }}
              placeholder="e.g., Full Name, Date of Birth"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              autoFocus
            />
          </div>

          {/* Type + Entity row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft.value} value={ft.value}>{ft.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entity</label>
              <select
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                {ENTITY_TYPES.map((et) => (
                  <option key={et.value} value={et.value}>{et.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Grid rows/columns (only for checkbox_grid) */}
          {isGridType && (
            <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 font-medium">Grid Configuration</p>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Row Labels (comma-separated)
                </label>
                <input
                  type="text"
                  value={rows}
                  onChange={(e) => setRows(e.target.value)}
                  placeholder="e.g., Mon, Tue, Wed, Thu, Fri"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Column Labels (comma-separated)
                </label>
                <input
                  type="text"
                  value={columns}
                  onChange={(e) => setColumns(e.target.value)}
                  placeholder="e.g., Morning, Afternoon, Evening"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
          )}

          {/* Position (read-only display with manual override) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Position <span className="text-xs text-gray-400">(PDF points)</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <span className="text-xs text-gray-400">X</span>
                <input
                  type="number"
                  value={x}
                  onChange={(e) => setX(Number(e.target.value))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center"
                />
              </div>
              <div>
                <span className="text-xs text-gray-400">Y</span>
                <input
                  type="number"
                  value={y}
                  onChange={(e) => setY(Number(e.target.value))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center"
                />
              </div>
              <div>
                <span className="text-xs text-gray-400">W</span>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center"
                />
              </div>
              <div>
                <span className="text-xs text-gray-400">H</span>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center"
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              {isEditing ? 'Save Changes' : 'Add Field'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
