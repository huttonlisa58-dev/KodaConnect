'use client';

import { useState } from 'react';

interface GridRow {
  row_id: string;
  label: string;
}

interface GridColumn {
  col_id: string;
  label: string;
}

interface CheckboxGridProps {
  rows: GridRow[];
  columns: GridColumn[];
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  readOnly?: boolean;
}

/**
 * Detect if a row label is an editable "Other" placeholder.
 * Matches "Other", "Other 1", "Other 2", etc.
 */
function isEditableOtherRow(label: string): boolean {
  return /^other\s*\d*$/i.test(label.trim());
}

/** Key prefix for storing custom row labels inside the grid value */
const LABEL_PREFIX = '_label__';

export default function CheckboxGrid({
  rows,
  columns,
  value,
  onChange,
  readOnly = false,
}: CheckboxGridProps) {
  const [selectAllRow, setSelectAllRow] = useState<Set<string>>(new Set());
  const [selectAllCol, setSelectAllCol] = useState<Set<string>>(new Set());

  // Use double underscore separator to match FieldRenderer convention
  const getCellKey = (rowId: string, colId: string) => `${rowId}__${colId}`;
  const getLabelKey = (rowId: string) => `${LABEL_PREFIX}${rowId}`;

  // Check both double underscore (new format) and single underscore (legacy format)
  const isCellChecked = (rowId: string, colId: string): boolean => {
    return value[`${rowId}__${colId}`] === true || value[`${rowId}_${colId}`] === true;
  };

  const handleCellChange = (rowId: string, colId: string, checked: boolean) => {
    const key = getCellKey(rowId, colId);
    onChange({
      ...value,
      [key]: checked,
    });
  };

  const handleLabelChange = (rowId: string, label: string) => {
    onChange({
      ...value,
      [getLabelKey(rowId)]: label,
    });
  };

  const getCustomLabel = (rowId: string): string => {
    return value[getLabelKey(rowId)] || '';
  };

  const handleSelectAllRow = (rowId: string, checked: boolean) => {
    const newValue = { ...value };
    const newSelectAllRow = new Set(selectAllRow);

    if (checked) {
      newSelectAllRow.add(rowId);
      columns.forEach((col) => {
        newValue[getCellKey(rowId, col.col_id)] = true;
      });
    } else {
      newSelectAllRow.delete(rowId);
      columns.forEach((col) => {
        delete newValue[getCellKey(rowId, col.col_id)];
      });
    }

    setSelectAllRow(newSelectAllRow);
    onChange(newValue);
  };

  const handleSelectAllCol = (colId: string, checked: boolean) => {
    const newValue = { ...value };
    const newSelectAllCol = new Set(selectAllCol);

    if (checked) {
      newSelectAllCol.add(colId);
      rows.forEach((row) => {
        newValue[getCellKey(row.row_id, colId)] = true;
      });
    } else {
      newSelectAllCol.delete(colId);
      rows.forEach((row) => {
        delete newValue[getCellKey(row.row_id, colId)];
      });
    }

    setSelectAllCol(newSelectAllCol);
    onChange(newValue);
  };

  const isRowAllSelected = (rowId: string): boolean => {
    return columns.every((col) => isCellChecked(rowId, col.col_id));
  };

  const isColAllSelected = (colId: string): boolean => {
    return rows.every((row) => isCellChecked(row.row_id, colId));
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-left text-sm font-medium text-gray-700">
              {/* Top-left corner cell */}
            </th>
            {columns.map((col) => (
              <th
                key={col.col_id}
                className="border border-gray-300 bg-blue-50 px-3 py-2 text-center"
              >
                <div className="text-sm font-medium text-gray-700 mb-2">{col.label}</div>
                {!readOnly && (
                  <label className="flex items-center justify-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isColAllSelected(col.col_id)}
                      onChange={(e) => handleSelectAllCol(col.col_id, e.target.checked)}
                      className="w-4 h-4 border-gray-300 rounded cursor-pointer"
                    />
                    <span className="text-xs text-gray-600">All</span>
                  </label>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const isOther = isEditableOtherRow(row.label);
            const customLabel = getCustomLabel(row.row_id);

            return (
              <tr key={row.row_id} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                  {/* Editable label for "Other" rows, static label otherwise */}
                  {isOther && !readOnly ? (
                    <input
                      type="text"
                      value={customLabel}
                      onChange={(e) => handleLabelChange(row.row_id, e.target.value)}
                      placeholder={`${row.label} — type service name`}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200 focus:outline-none mb-2"
                    />
                  ) : (
                    <div className="mb-2">
                      {isOther && customLabel ? customLabel : row.label}
                    </div>
                  )}
                  {!readOnly && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isRowAllSelected(row.row_id)}
                        onChange={(e) => handleSelectAllRow(row.row_id, e.target.checked)}
                        className="w-4 h-4 border-gray-300 rounded cursor-pointer"
                      />
                      <span className="text-xs text-gray-600">All</span>
                    </label>
                  )}
                </td>
                {columns.map((col) => (
                  <td
                    key={`${row.row_id}__${col.col_id}`}
                    className="border border-gray-300 px-4 py-3 text-center"
                  >
                    <input
                      type="checkbox"
                      checked={isCellChecked(row.row_id, col.col_id)}
                      onChange={(e) => handleCellChange(row.row_id, col.col_id, e.target.checked)}
                      disabled={readOnly}
                      className="w-5 h-5 border-gray-300 rounded cursor-pointer"
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
