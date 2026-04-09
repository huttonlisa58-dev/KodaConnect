'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Minus } from 'lucide-react'

/**
 * SkillsChecklistTable — Office portal component
 *
 * Renders the Skills Checklist / Supervision sub-form as a compact table
 * matching the source Word document layout. Detects skills checklist fields
 * by their ID pattern (skills_checklist__*__method / __evaluation) and
 * groups them into rows.
 *
 * Props:
 *   fields   — array of field definitions from the sub-form
 *   data     — submission data (field_id → value)
 *   editable — whether fields can be edited (Edit mode)
 *   onFieldChange — callback when a field value changes in edit mode
 */

interface SkillField {
  id: string
  label: string
  type: string
  options?: { value: string; label: string }[]
  signer_role?: string
  required?: boolean
}

interface SkillRow {
  key: string
  skillName: string
  methodFieldId: string
  evaluationFieldId: string
  isHeader?: boolean
}

interface SkillsChecklistTableProps {
  fields: SkillField[]
  data: Record<string, any>
  editable?: boolean
  onFieldChange?: (fieldId: string, value: any) => void
}

// Category headers — these skill keys get rendered as group headers, not data rows
const CATEGORY_HEADERS: Record<string, string> = {
  'provision_of_care': 'Provision of appropriate care/ADLs',
}

// ADL sub-items that go under the category header
const ADL_ITEMS = new Set([
  'privacy_dignity', 'bed_bath', 'shower', 'shampoo', 'nail_care',
  'skin_care', 'oral_hygiene', 'toileting', 'feeding',
])

export function SkillsChecklistTable({ fields, data, editable = false, onFieldChange }: SkillsChecklistTableProps) {
  // Extract skill rows from fields
  const skillRows = buildSkillRows(fields)

  // Separate header fields (name, date) from skill fields
  const nameField = fields.find(f => f.id === 'skills_checklist__employee_name')
  const dateField = fields.find(f => f.id === 'skills_checklist__evaluation_date')
  const otherSpecifyField = fields.find(f => f.id === 'skills_checklist__other__specify')
  const competentField = fields.find(f => f.id === 'skills_checklist__competent')

  // Signature fields
  const aideSigField = fields.find(f => f.id === 'skills_checklist__aide_signature')
  const aideDateField = fields.find(f => f.id === 'skills_checklist__aide_date')
  const staffSigField = fields.find(f => f.id === 'skills_checklist__staff_signature')
  const staffDateField = fields.find(f => f.id === 'skills_checklist__staff_date')

  // Count met/not met/unanswered
  const stats = skillRows.reduce((acc, row) => {
    if (row.isHeader) return acc
    const val = data[row.evaluationFieldId]
    if (val === 'met') acc.met++
    else if (val === 'not_met') acc.notMet++
    else acc.unanswered++
    return acc
  }, { met: 0, notMet: 0, unanswered: 0 })

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Home Health Aide Name</span>
          <p className="text-sm font-medium text-gray-900 mt-0.5">{data['skills_checklist__employee_name'] || '—'}</p>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date</span>
          <p className="text-sm font-medium text-gray-900 mt-0.5">{data['skills_checklist__evaluation_date'] || '—'}</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex gap-3">
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
          <CheckCircle className="h-3 w-3" /> {stats.met} Met
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
          <XCircle className="h-3 w-3" /> {stats.notMet} Not Met
        </span>
        {stats.unanswered > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
            <Minus className="h-3 w-3" /> {stats.unanswered} Unanswered
          </span>
        )}
      </div>

      {/* Skills table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide w-1/2">Skills</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide w-1/4">
                Assessment<br/>Method
              </th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide w-1/4">
                Evaluation<br/>Competency
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {skillRows.map((row) => {
              if (row.isHeader) {
                return (
                  <tr key={row.key} className="bg-teal-50/60">
                    <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-teal-700 uppercase tracking-wide">
                      {row.skillName}
                    </td>
                  </tr>
                )
              }

              const methodVal = data[row.methodFieldId] || ''
              const evalVal = data[row.evaluationFieldId] || ''
              const isNotMet = evalVal === 'not_met'
              const isIndented = ADL_ITEMS.has(row.key)

              return (
                <tr key={row.key} className={isNotMet ? 'bg-red-50/40' : ''}>
                  <td className={`px-3 py-2 text-gray-800 ${isIndented ? 'pl-6' : ''}`}>
                    {isIndented && <span className="text-gray-400 mr-1">→</span>}
                    {row.skillName}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {editable ? (
                      <MethodSelect
                        fieldId={row.methodFieldId}
                        value={methodVal}
                        onChange={onFieldChange}
                      />
                    ) : (
                      <MethodBadge value={methodVal} />
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {editable ? (
                      <EvalSelect
                        fieldId={row.evaluationFieldId}
                        value={evalVal}
                        onChange={onFieldChange}
                      />
                    ) : (
                      <EvalBadge value={evalVal} />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Other specify */}
      {otherSpecifyField && data['skills_checklist__other__specify'] && (
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Other – Specify</span>
          <p className="text-sm text-gray-900 mt-0.5">{data['skills_checklist__other__specify']}</p>
        </div>
      )}

      {/* Competency declaration */}
      {competentField && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
          <span className="text-sm font-medium text-gray-700">Home health aide is competent to carry out care: </span>
          {data['skills_checklist__competent'] === 'yes' ? (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-700">
              <CheckCircle className="h-4 w-4" /> Yes
            </span>
          ) : data['skills_checklist__competent'] === 'no' ? (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-700">
              <XCircle className="h-4 w-4" /> No
            </span>
          ) : (
            <span className="text-sm text-gray-400">Not answered</span>
          )}
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-4 pt-2">
        <div className="border-t border-gray-200 pt-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Home Health Aide Signature</span>
          {data['skills_checklist__aide_signature'] ? (
            <div className="mt-1">
              {typeof data['skills_checklist__aide_signature'] === 'string' && data['skills_checklist__aide_signature'].startsWith('data:') ? (
                <img src={data['skills_checklist__aide_signature']} alt="Aide signature" className="h-12 object-contain" />
              ) : (
                <p className="text-sm text-gray-900 italic">{data['skills_checklist__aide_signature']}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-1">—</p>
          )}
          <p className="text-xs text-gray-500 mt-1">{data['skills_checklist__aide_date'] || ''}</p>
        </div>
        <div className="border-t border-gray-200 pt-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Staff Signature</span>
          {data['skills_checklist__staff_signature'] ? (
            <div className="mt-1">
              {typeof data['skills_checklist__staff_signature'] === 'string' && data['skills_checklist__staff_signature'].startsWith('data:') ? (
                <img src={data['skills_checklist__staff_signature']} alt="Staff signature" className="h-12 object-contain" />
              ) : (
                <p className="text-sm text-gray-900 italic">{data['skills_checklist__staff_signature']}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-1">—</p>
          )}
          <p className="text-xs text-gray-500 mt-1">{data['skills_checklist__staff_date'] || ''}</p>
        </div>
      </div>
    </div>
  )
}

// --- Helper Components ---

function MethodBadge({ value }: { value: string }) {
  if (!value) return <span className="text-gray-300">—</span>
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
      value === 'D' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
    }`}>
      {value}
    </span>
  )
}

function EvalBadge({ value }: { value: string }) {
  if (!value) return <span className="text-gray-300">—</span>
  if (value === 'met') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-green-700">
        <CheckCircle className="h-3.5 w-3.5" /> Met
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-700">
      <XCircle className="h-3.5 w-3.5" /> Not Met
    </span>
  )
}

function MethodSelect({ fieldId, value, onChange }: { fieldId: string; value: string; onChange?: (id: string, val: any) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange?.(fieldId, e.target.value)}
      className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white"
    >
      <option value="">—</option>
      <option value="D">D</option>
      <option value="O">O</option>
    </select>
  )
}

function EvalSelect({ fieldId, value, onChange }: { fieldId: string; value: string; onChange?: (id: string, val: any) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange?.(fieldId, e.target.value)}
      className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white"
    >
      <option value="">—</option>
      <option value="met">Met</option>
      <option value="not_met">Not Met</option>
    </select>
  )
}

// --- Data Extraction ---

function buildSkillRows(fields: SkillField[]): SkillRow[] {
  // Find all __method fields and pair with __evaluation
  const methodFields = fields.filter(f => f.id.endsWith('__method') && f.id.startsWith('skills_checklist__'))
  const rows: SkillRow[] = []

  // Track where to insert ADLs header
  let insertedAdlsHeader = false

  for (const mf of methodFields) {
    // Extract skill key: skills_checklist__attitude_customer_service__method → attitude_customer_service
    const parts = mf.id.replace('skills_checklist__', '').replace('__method', '')
    const key = parts
    const evalFieldId = mf.id.replace('__method', '__evaluation')

    // Extract clean skill name from label (remove " – Assessment Method")
    const skillName = mf.label.replace(/\s*[–-]\s*Assessment Method$/i, '')

    // Insert ADLs category header before the first ADL item
    if (ADL_ITEMS.has(key) && !insertedAdlsHeader) {
      rows.push({
        key: 'header_adls',
        skillName: 'Provision of appropriate care/ADLs',
        methodFieldId: '',
        evaluationFieldId: '',
        isHeader: true,
      })
      insertedAdlsHeader = true
    }

    rows.push({
      key,
      skillName,
      methodFieldId: mf.id,
      evaluationFieldId: evalFieldId,
    })
  }

  return rows
}

export default SkillsChecklistTable
