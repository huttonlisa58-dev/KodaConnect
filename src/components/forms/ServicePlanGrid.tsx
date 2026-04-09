'use client'

import { useState } from 'react'

/**
 * ServicePlanGrid — Office portal component
 *
 * Renders the Service Plan weekly schedule as a compact table
 * matching the source Word document layout. Detects service plan
 * checkbox_grid fields and groups them by category.
 *
 * Features:
 *   - Row "All" checkbox toggles all days for that row only
 *   - Column "All" checkbox toggles all rows for that day only
 *   - Editable labels for "Other" rows (stores in form_data as _other_label_<rowKey>)
 *   - Read-only teal dots for non-editable views
 *
 * Props:
 *   fields   — array of field definitions from the sub-form
 *   data     — submission data (field_id → value)
 *   editable — whether fields can be edited (Edit mode)
 *   onFieldChange — callback when a field value changes in edit mode
 */

interface ServicePlanField {
  id: string
  field_id?: string
  label: string
  type: string
  rows?: { value: string; label: string }[]
  columns?: { value: string; label: string }[]
  signer_role?: string
}

interface ServicePlanGridProps {
  fields: ServicePlanField[]
  data: Record<string, any>
  editable?: boolean
  onFieldChange?: (fieldId: string, value: any) => void
  categoryTitle?: string
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function ServicePlanGrid({ fields, data, editable = false, onFieldChange, categoryTitle }: ServicePlanGridProps) {
  // Find checkbox_grid fields
  const gridFields = fields.filter(f => f.type === 'checkbox_grid')
  const textFields = fields.filter(f => f.type === 'textarea' || f.type === 'text')

  if (gridFields.length === 0) return null

  // Count total checked days across all grids
  let totalChecked = 0
  for (const gf of gridFields) {
    const fieldId = gf.field_id || gf.id
    const gridValue = data[fieldId]
    if (gridValue && typeof gridValue === 'object') {
      totalChecked += Object.values(gridValue).filter(v => v === true).length
    }
  }

  // Collect all rows across all grid fields for column "All" toggles
  const allGridRows: { fieldId: string; rowKey: string }[] = []
  for (const gf of gridFields) {
    const fieldId = gf.field_id || gf.id
    for (const row of (gf.rows || [])) {
      allGridRows.push({ fieldId, rowKey: row.value })
    }
  }

  // Check if a row is an "Other" row with editable label
  const isEditableOtherRow = (rowLabel: string) => {
    return /^other\s*\d*$/i.test(rowLabel.trim())
  }

  // Toggle all cells in a specific row
  const toggleRow = (fieldId: string, rowKey: string, gridValue: Record<string, any>) => {
    const allChecked = DAYS.every(day => gridValue[`${rowKey}__${day}`] === true)
    const newGrid = { ...gridValue }
    for (const day of DAYS) {
      newGrid[`${rowKey}__${day}`] = !allChecked
    }
    onFieldChange?.(fieldId, newGrid)
  }

  // Toggle all rows for a specific day (column)
  const toggleColumn = (day: string) => {
    // Check if all rows in all grids are checked for this day
    const allChecked = allGridRows.every(({ fieldId, rowKey }) => {
      const gridValue = data[fieldId] || {}
      return gridValue[`${rowKey}__${day}`] === true
    })

    // Toggle all rows for this day
    for (const gf of gridFields) {
      const fieldId = gf.field_id || gf.id
      const gridValue = data[fieldId] || {}
      const newGrid = { ...gridValue }
      for (const row of (gf.rows || [])) {
        newGrid[`${row.value}__${day}`] = !allChecked
      }
      onFieldChange?.(fieldId, newGrid)
    }
  }

  // Check if entire column is checked
  const isColumnAllChecked = (day: string) => {
    return allGridRows.length > 0 && allGridRows.every(({ fieldId, rowKey }) => {
      const gridValue = data[fieldId] || {}
      return gridValue[`${rowKey}__${day}`] === true
    })
  }

  // Check if entire row is checked
  const isRowAllChecked = (fieldId: string, rowKey: string) => {
    const gridValue = data[fieldId] || {}
    return DAYS.every(day => gridValue[`${rowKey}__${day}`] === true)
  }

  return (
    <div className="space-y-3">
      {/* Category header with count */}
      {categoryTitle && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-teal-700">{categoryTitle}</h3>
          <span className="text-xs text-gray-500">
            {totalChecked} service-day{totalChecked !== 1 ? 's' : ''} scheduled
          </span>
        </div>
      )}

      {/* Grid table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide min-w-[180px]">
                Service
              </th>
              {DAYS.map((day, di) => (
                <th key={day} className="text-center px-1 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide w-10">
                  <div>{DAY_LABELS[di]}</div>
                  {editable && (
                    <label className="flex items-center justify-center gap-0.5 cursor-pointer mt-0.5">
                      <input
                        type="checkbox"
                        checked={isColumnAllChecked(day)}
                        onChange={() => toggleColumn(day)}
                        className="h-3 w-3 rounded text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-[10px] text-gray-400">All</span>
                    </label>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {gridFields.map(gf => {
              const fieldId = gf.field_id || gf.id
              const gridValue = data[fieldId] || {}
              const rows = gf.rows || []

              return rows.map((row, ri) => {
                const rowKey = row.value
                const isOther = isEditableOtherRow(row.label)
                const otherLabelKey = `_other_label_${fieldId}__${rowKey}`
                const otherLabel = data[otherLabelKey] || ''

                return (
                  <tr key={`${fieldId}-${rowKey}`} className={ri % 2 === 1 ? 'bg-gray-50/50' : ''}>
                    <td className="px-3 py-1.5 text-gray-800 text-sm">
                      <div className="flex items-center gap-2">
                        {isOther && editable ? (
                          <input
                            type="text"
                            value={otherLabel}
                            onChange={(e) => onFieldChange?.(otherLabelKey, e.target.value)}
                            placeholder={`${row.label} — type service name`}
                            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-200 focus:outline-none"
                          />
                        ) : isOther && otherLabel ? (
                          <span>{otherLabel}</span>
                        ) : (
                          <span>{row.label}</span>
                        )}
                        {editable && (
                          <label className="flex items-center gap-0.5 cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={isRowAllChecked(fieldId, rowKey)}
                              onChange={() => toggleRow(fieldId, rowKey, gridValue)}
                              className="h-3 w-3 rounded text-teal-600 focus:ring-teal-500"
                            />
                            <span className="text-[10px] text-gray-400">All</span>
                          </label>
                        )}
                      </div>
                    </td>
                    {DAYS.map(day => {
                      const cellKey = `${rowKey}__${day}`
                      const altCellKey = `${rowKey}.${day}`
                      const isChecked = gridValue[cellKey] === true || gridValue[altCellKey] === true

                      return (
                        <td key={day} className="text-center px-1 py-1.5">
                          {editable ? (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const newGrid = { ...gridValue, [cellKey]: e.target.checked }
                                onFieldChange?.(fieldId, newGrid)
                              }}
                              className="h-4 w-4 rounded text-teal-600 focus:ring-teal-500"
                            />
                          ) : isChecked ? (
                            <span className="inline-block w-3 h-3 rounded-full bg-teal-500" title="Scheduled" />
                          ) : (
                            <span className="inline-block w-3 h-3 rounded-full bg-gray-200" />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
      </div>

      {/* Directions / notes */}
      {textFields.map(tf => {
        const tfId = tf.field_id || tf.id
        const value = data[tfId]
        if (!value && !editable) return null
        return (
          <div key={tfId}>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {tf.label}
            </span>
            {editable ? (
              <textarea
                value={value || ''}
                onChange={(e) => onFieldChange?.(tfId, e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                rows={2}
              />
            ) : (
              <p className="text-sm text-gray-900 mt-0.5">{value || '—'}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ServicePlanGrid
