'use client';

import { FormField } from '@/lib/form-engine';
import { SignaturePad } from './SignaturePad';
import { AlertCircle } from 'lucide-react';

interface FieldRendererProps {
  field: FormField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  brandColor: string;
  readOnly?: boolean;
}

export function FieldRenderer({
  field,
  value,
  onChange,
  error,
  brandColor,
  readOnly,
}: FieldRendererProps) {
  // Map optional text_size field property to Tailwind class (default: text-base / 16px)
  const textSizeMap: Record<string, string> = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
  };
  const textSizeClass = textSizeMap[(field as any).text_size || 'base'] || 'text-base';

  const commonClasses =
    `w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:border-transparent ${textSizeClass} transition-all text-gray-900 placeholder:text-gray-400`;
  const borderClass = error ? 'border-red-300 bg-red-50/30' : 'border-gray-200 bg-white';

  switch (field.type) {
    case 'signature':
      return (
        <SignaturePad
          value={value || ''}
          onChange={onChange}
          brandColor={brandColor}
          readOnly={readOnly}
        />
      );

    case 'textarea':
      return (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          className={`${commonClasses} ${borderClass} min-h-[100px]`}
          style={{ outlineColor: brandColor }}
          readOnly={readOnly}
        />
      );

    case 'date': {
      const fieldMeta = field as any;
      const isDob = fieldMeta.is_dob || /dob|birth/i.test(field.field_id);

      if (isDob) {
        // DOB-friendly date picker with year/month/day dropdowns
        // Makes it easy to jump to years like 1940, 1950 etc.
        const currentYear = new Date().getFullYear();
        const years = Array.from({ length: currentYear - 1919 }, (_, i) => currentYear - i);
        const months = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December',
        ];
        const parsed = value ? value.split('-') : ['', '', ''];
        const selYear = parsed[0] || '';
        const selMonth = parsed[1] || '';
        const selDay = parsed[2] || '';

        const daysInMonth = selYear && selMonth
          ? new Date(Number(selYear), Number(selMonth), 0).getDate()
          : 31;
        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

        const handleDobChange = (part: 'year' | 'month' | 'day', val: string) => {
          let y = part === 'year' ? val : selYear;
          let m = part === 'month' ? val : selMonth;
          let d = part === 'day' ? val : selDay;
          if (y && m && d) {
            onChange(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
          } else if (!y && !m && !d) {
            onChange('');
          } else {
            // Partial — store what we have
            onChange(`${y || '0000'}-${(m || '00').padStart(2, '0')}-${(d || '00').padStart(2, '0')}`);
          }
        };

        return (
          <div className="flex gap-2">
            <select
              value={selMonth}
              onChange={(e) => handleDobChange('month', e.target.value)}
              className={`flex-1 px-3 py-3 border-2 rounded-xl text-base ${borderClass}`}
              style={{ outlineColor: brandColor }}
              disabled={readOnly}
            >
              <option value="">Month</option>
              {months.map((m, i) => (
                <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
              ))}
            </select>
            <select
              value={selDay ? String(Number(selDay)) : ''}
              onChange={(e) => handleDobChange('day', e.target.value)}
              className={`w-20 px-3 py-3 border-2 rounded-xl text-base ${borderClass}`}
              style={{ outlineColor: brandColor }}
              disabled={readOnly}
            >
              <option value="">Day</option>
              {days.map((d) => (
                <option key={d} value={String(d)}>{d}</option>
              ))}
            </select>
            <select
              value={selYear}
              onChange={(e) => handleDobChange('year', e.target.value)}
              className={`w-24 px-3 py-3 border-2 rounded-xl text-base ${borderClass}`}
              style={{ outlineColor: brandColor }}
              disabled={readOnly}
            >
              <option value="">Year</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
        );
      }

      // Standard date input for non-DOB fields
      // Use disabled (not readOnly) — readOnly doesn't block mobile date pickers
      return (
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${commonClasses} ${borderClass} ${readOnly ? 'bg-gray-100 text-gray-500' : ''}`}
          style={{ outlineColor: brandColor }}
          disabled={readOnly}
        />
      );
    }

    case 'time':
      // Use disabled (not readOnly) — readOnly doesn't block mobile time pickers
      return (
        <input
          type="time"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${commonClasses} ${borderClass} ${readOnly ? 'bg-gray-100 text-gray-500' : ''}`}
          style={{ outlineColor: brandColor }}
          disabled={readOnly}
        />
      );

    case 'email':
      return (
        <input
          type="email"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || 'email@example.com'}
          className={`${commonClasses} ${borderClass}`}
          style={{ outlineColor: brandColor }}
          readOnly={readOnly}
        />
      );

    case 'phone':
      return (
        <input
          type="tel"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || '(555) 555-5555'}
          className={`${commonClasses} ${borderClass}`}
          style={{ outlineColor: brandColor }}
          readOnly={readOnly}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          placeholder={field.placeholder || ''}
          className={`${commonClasses} ${borderClass}`}
          style={{ outlineColor: brandColor }}
          readOnly={readOnly}
        />
      );

    case 'select':
      return (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${commonClasses} ${borderClass}`}
          style={{ outlineColor: brandColor }}
          disabled={readOnly}
        >
          <option value="">Select...</option>
          {(field.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case 'radio': {
      const opts = field.options || [];
      // Compact horizontal toggle chips for short option sets (2-4 options)
      // This makes Yes/No, Yes/No/N/A, and Yes/No/Sometimes much more compact
      const isCompact = opts.length >= 2 && opts.length <= 4 &&
        opts.every((o) => o.label.length <= 12);

      if (isCompact) {
        return (
          <div className="flex gap-2 flex-wrap">
            {opts.map((opt) => {
              const isSelected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => !readOnly && onChange(opt.value)}
                  className="flex-1 min-w-[70px] px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all text-center"
                  style={{
                    borderColor: isSelected ? brandColor : '#e5e7eb',
                    backgroundColor: isSelected ? `${brandColor}12` : 'white',
                    color: isSelected ? brandColor : '#6b7280',
                  }}
                  disabled={readOnly}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        );
      }

      // Standard vertical layout for longer option lists
      return (
        <div className="space-y-2">
          {opts.map((opt) => (
            <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name={field.field_id}
                value={opt.value}
                checked={value === opt.value}
                onChange={(e) => onChange(e.target.value)}
                className="w-4 h-4"
                style={{ accentColor: brandColor }}
                disabled={readOnly}
              />
              <span className="text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
      );
    }

    case 'checkbox':
      return (
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={value === true || value === 'true'}
            onChange={(e) => onChange(e.target.checked)}
            className="w-5 h-5 rounded"
            style={{ accentColor: brandColor }}
            disabled={readOnly}
          />
          <span className="text-gray-700">{field.label}</span>
        </label>
      );

    case 'checkbox_group':
      return (
        <div className="space-y-2">
          {(field.options || []).map((opt) => {
            const selected = Array.isArray(value) ? value : [];
            const isChecked = selected.includes(opt.value);
            return (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {
                    const newVal = isChecked
                      ? selected.filter((v: string) => v !== opt.value)
                      : [...selected, opt.value];
                    onChange(newVal);
                  }}
                  className="w-5 h-5 rounded"
                  style={{ accentColor: brandColor }}
                  disabled={readOnly}
                />
                <span className="text-gray-700">{opt.label}</span>
              </label>
            );
          })}
        </div>
      );

    case 'checkbox_grid': {
      const gridValue = (typeof value === 'object' && value !== null && !Array.isArray(value)) ? value : {};
      const gridRows = (field as any).rows || [];
      const gridCols = (field as any).columns || [];
      // Support both naming conventions: row_id/col_id (legacy) and value (JSON package format)
      const getRowKey = (row: any) => row.row_id || row.value || '';
      const getColKey = (col: any) => col.col_id || col.value || '';
      const getCellKey = (rowKey: string, colKey: string) => `${rowKey}__${colKey}`;
      // Check both double underscore (new) and single underscore (legacy) formats
      const isCellChecked = (rowKey: string, colKey: string) => gridValue[`${rowKey}__${colKey}`] === true || gridValue[`${rowKey}_${colKey}`] === true;
      const handleCellChange = (rowKey: string, colKey: string, checked: boolean) => {
        onChange({ ...gridValue, [getCellKey(rowKey, colKey)]: checked });
      };
      return (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-gray-200 bg-gray-50 px-2 py-2 text-left text-xs font-medium text-gray-600 min-w-[100px]"></th>
                {gridCols.map((col: any) => (
                  <th key={getColKey(col)} className="border border-gray-200 px-2 py-2 text-center text-xs font-semibold text-gray-700" style={{ backgroundColor: `${brandColor}10` }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gridRows.map((row: any, rowIdx: number) => (
                <tr key={getRowKey(row)} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="border border-gray-200 px-2 py-2 text-xs font-medium text-gray-700 bg-gray-50">
                    {row.label}
                  </td>
                  {gridCols.map((col: any) => {
                    const rowKey = getRowKey(row);
                    const colKey = getColKey(col);
                    return (
                      <td key={`${rowKey}__${colKey}`} className="border border-gray-200 px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isCellChecked(rowKey, colKey)}
                          onChange={(e) => handleCellChange(rowKey, colKey, e.target.checked)}
                          disabled={readOnly}
                          className="w-5 h-5 rounded cursor-pointer"
                          style={{ accentColor: brandColor }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    default:
      return (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          className={`${commonClasses} ${borderClass}`}
          style={{ outlineColor: brandColor }}
          readOnly={readOnly}
        />
      );
  }
}
