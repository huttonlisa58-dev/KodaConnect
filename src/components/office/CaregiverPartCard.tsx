'use client'

import { useState } from 'react'
import {
  ChevronDown, ChevronRight, Edit3, Save, X, Download,
  Eye, Lock, Trash2, History, Undo2, AlertTriangle,
  User, Phone, PenTool, PenLine, Shield, Briefcase, GraduationCap,
  Heart, DollarSign, Clock, Building2, FileText,
  CheckCircle, XCircle, Fingerprint, MapPin, Monitor,
  Smartphone, Globe, Loader2, ShieldCheck
} from 'lucide-react'
import { FormDefinition, FormField, getVisibleFields, isStaffField, getStaffFields, getRequiredSignerRoles, hasAllRequiredStaffFields } from '@/lib/form-engine'
import { getSignableRoles } from '@/lib/auth'
import { FormSubmission, formatDate, getStatusLabel, getStatusColor } from '@/lib/submissions'
import { SignatureSecurityMetadata } from '@/lib/esignature-security'
import { replaceTemplateVariables } from '@/lib/template-utils'
import { PartState, EditHistoryEntry, UnifiedPart } from '@/lib/caregiver-types'
import FormFieldRenderer from '@/components/forms/FormFieldRenderer'
import SignatureCanvas from '@/components/forms/SignatureCanvas'
import DocumentsTab from '@/components/office/DocumentsTab'

// ===== Helper: Map section titles to lucide icons =====
function getTabIcon(title: string) {
  const lower = title.toLowerCase()
  if (lower.includes('personal') || lower.includes('employee') || lower.includes('applicant')) return User
  if (lower.includes('signature') || lower.includes('consent')) return PenTool
  if (lower.includes('policy') || lower.includes('agreement')) return Shield
  if (lower.includes('employment') || lower.includes('position') || lower.includes('work')) return Briefcase
  if (lower.includes('education')) return GraduationCap
  if (lower.includes('health') || lower.includes('medical') || lower.includes('benefit')) return Heart
  if (lower.includes('tax') || lower.includes('payment') || lower.includes('bank')) return DollarSign
  if (lower.includes('background') || lower.includes('reference')) return Shield
  if (lower.includes('availability') || lower.includes('schedule')) return Clock
  if (lower.includes('company') || lower.includes('office')) return Building2
  return FileText
}

// ===== Read-only field value renderer =====
function FieldValue({ field, value, signatureMetadata }: { field: FormField; value: any; signatureMetadata?: SignatureSecurityMetadata | null }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-400">Not provided</span>
  }

  switch (field.type) {
    case 'signature':
      return (
        <div className="flex flex-col items-start gap-2">
          <img src={value} alt="Signature" className="max-w-xs max-h-24 border-2 border-gray-300 rounded-md p-2 bg-gray-50" />
          {signatureMetadata ? (
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs font-medium text-green-700">
                Signed {new Date(signatureMetadata.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {' '}via {signatureMetadata.is_touch_device ? 'touch device' : 'desktop'}
              </span>
              {signatureMetadata.geolocation && (
                <span className="text-xs text-gray-500 flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" /> verified
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs font-medium text-gray-600">Signed</span>
          )}
        </div>
      )
    case 'checkbox':
      return value ? (
        <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
          <CheckCircle className="w-4 h-4 mr-1" /> Checked
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
          <XCircle className="w-4 h-4 mr-1" /> Not checked
        </span>
      )
    case 'radio':
    case 'select':
      const option = field.options?.find((opt) => opt.value === value)
      return <span className="font-medium text-gray-900">{option?.label || value}</span>
    case 'checkbox_group':
      if (Array.isArray(value)) {
        return (
          <div className="flex flex-wrap gap-2">
            {value.map((v) => {
              const opt = field.options?.find((o) => o.value === v)
              return (
                <span key={v} className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 border border-blue-200">
                  {opt?.label || v}
                </span>
              )
            })}
          </div>
        )
      }
      return <span className="text-gray-900">{String(value)}</span>
    case 'checkbox_grid':
      if (typeof value === 'object' && value !== null) {
        return (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <tbody className="divide-y divide-gray-200">
                {Object.entries(value).map(([rowKey, checked]) => {
                  const row = field.rows?.find((r: any) => r.row_id === rowKey)
                  return (
                    <tr key={rowKey} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm font-medium text-gray-700">{(row as any)?.label || rowKey}</td>
                      <td className="px-4 py-2 text-sm">
                        {checked ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-gray-300" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      }
      return <span className="text-gray-900">{String(value)}</span>
    case 'textarea':
      return <p className="text-gray-900 whitespace-pre-wrap max-h-32 overflow-y-auto bg-gray-50 p-3 rounded border border-gray-200">{String(value)}</p>
    case 'file_upload':
      if (typeof value === 'string') {
        return <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline font-medium">Download file</a>
      }
      return <span className="text-gray-900">{String(value)}</span>
    default:
      return <span className="text-gray-900">{String(value)}</span>
  }
}

// ===== Status Badge =====
function PartStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    submitted: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    finalized: 'bg-teal-100 text-teal-800 border-teal-200',
    approved: 'bg-green-100 text-green-800 border-green-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
    draft: 'bg-gray-100 text-gray-700 border-gray-200',
    pending: 'bg-orange-100 text-orange-800 border-orange-200',
  }
  const labels: Record<string, string> = {
    submitted: 'Submitted',
    finalized: 'Finalized',
    approved: 'Approved',
    rejected: 'Rejected',
    draft: 'Draft',
    pending: 'Not Started',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[status] || styles.draft}`}>
      {status === 'finalized' && <Lock className="h-3 w-3" />}
      {status === 'approved' && <ShieldCheck className="h-3 w-3" />}
      {labels[status] || status}
    </span>
  )
}

// ===== Extract e-signature security metadata =====
function extractSignatureMetadata(formData: Record<string, any>): Array<{ fieldId: string; metadata: SignatureSecurityMetadata }> {
  const results: Array<{ fieldId: string; metadata: SignatureSecurityMetadata }> = []
  for (const [key, value] of Object.entries(formData)) {
    if (key.startsWith('_signature_metadata_') && value && typeof value === 'object') {
      const fieldId = key.replace('_signature_metadata_', '')
      results.push({ fieldId, metadata: value as SignatureSecurityMetadata })
    }
  }
  return results
}

// ===== E-Signature Security Card =====
function ESignatureSecurityCard({ signatureData, formDefinition }: { signatureData: Array<{ fieldId: string; metadata: SignatureSecurityMetadata }>; formDefinition: FormDefinition }) {
  if (signatureData.length === 0) return null

  const getFieldLabel = (fieldId: string): string => {
    for (const section of formDefinition.sections) {
      const field = section.fields?.find((f: any) => f.field_id === fieldId)
      if (field) return field.label
    }
    return fieldId.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
  }

  return (
    <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Fingerprint className="h-4 w-4 text-indigo-600" />
        <h4 className="text-sm font-semibold text-indigo-900">E-Signature Security</h4>
        <span className="text-xs text-indigo-600">{signatureData.length} signature{signatureData.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-3">
        {signatureData.map(({ fieldId, metadata }) => (
          <div key={fieldId} className="bg-white rounded-md p-3 border border-indigo-100">
            <p className="text-xs font-semibold text-indigo-800 uppercase mb-2">{getFieldLabel(fieldId)}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-gray-600">
                <Clock className="h-3 w-3 flex-shrink-0" />
                <span>{new Date(metadata.signed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-600">
                {metadata.is_touch_device ? <Smartphone className="h-3 w-3 flex-shrink-0" /> : <Monitor className="h-3 w-3 flex-shrink-0" />}
                <span>{metadata.is_touch_device ? 'Touch' : 'Desktop'} · {metadata.platform}</span>
              </div>
              {metadata.geolocation && (
                <div className="flex items-center gap-1.5 text-gray-600 col-span-2">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span>{metadata.geolocation.latitude.toFixed(4)}, {metadata.geolocation.longitude.toFixed(4)} (±{Math.round(metadata.geolocation.accuracy)}m)</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-gray-600 col-span-2">
                <Globe className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{metadata.language} · {metadata.timezone}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ===== Edit History Card =====
function EditHistoryCard({ editHistory, onDownloadChangesPDF, isGeneratingChangesPDF }: {
  editHistory: EditHistoryEntry[]
  onDownloadChangesPDF: () => void
  isGeneratingChangesPDF: boolean
}) {
  if (editHistory.length === 0) return null

  const uniqueEditors = [...new Set(editHistory.map(e => e.edited_by))]

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-amber-600" />
        <h4 className="text-sm font-semibold text-amber-900">Edit History</h4>
        <span className="bg-amber-200 text-amber-800 text-xs rounded-full px-1.5 py-0.5 font-medium">{editHistory.length}</span>
      </div>
      <p className="text-xs text-amber-700 mb-3">
        {editHistory.length} field{editHistory.length !== 1 ? 's' : ''} modified by {uniqueEditors.join(', ')}
      </p>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {editHistory.slice(0, 8).map((entry) => {
          const oldVal = entry.old_value === null ? '(empty)' : typeof entry.old_value === 'string' && entry.old_value.startsWith('data:image') ? '[Signature]' : String(entry.old_value).slice(0, 30)
          const newVal = entry.new_value === null ? '(empty)' : typeof entry.new_value === 'string' && entry.new_value.startsWith('data:image') ? '[Signature]' : String(entry.new_value).slice(0, 30)
          return (
            <div key={entry.id} className="text-xs border-l-2 border-amber-300 pl-2">
              <p className="font-medium text-gray-800">{entry.field_label || entry.field_id}</p>
              <p className="text-gray-600">
                <span className="line-through text-red-500">{oldVal}</span>
                {' → '}
                <span className="text-green-700 font-medium">{newVal}</span>
              </p>
              <p className="text-gray-400">{entry.edited_by} · {formatDate(entry.edited_at)}</p>
            </div>
          )
        })}
        {editHistory.length > 8 && (
          <p className="text-xs text-amber-600 font-medium">+{editHistory.length - 8} more changes</p>
        )}
      </div>
      <button
        onClick={onDownloadChangesPDF}
        disabled={isGeneratingChangesPDF}
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
      >
        <History className="h-3 w-3" />
        {isGeneratingChangesPDF ? 'Generating...' : 'Download Changes PDF'}
      </button>
    </div>
  )
}

// ===== Props =====
interface CaregiverPartCardProps {
  part: UnifiedPart
  partIndex: number
  totalParts: number
  isExpanded: boolean
  state: PartState
  activeTab: number
  permissions: {
    canEdit: boolean
    canFinalize: boolean
    canDelete: boolean
    canEditAfterFinalize: boolean
  }
  currentUserEmail?: string
  currentUserRole?: string
  onToggleExpand: () => void
  onSetActiveTab: (tab: number) => void
  onEditToggle: () => void
  onFieldChange: (fieldId: string, value: any) => void
  onSave: () => void
  onCancel: () => void
  onFinalize: () => void
  onUnfinalize: () => void
  onDelete: () => void
  onToggleView: () => void
  onTogglePDFDropdown: () => void
  onDownloadPDF: (type: 'current' | 'original') => void
  onDownloadChangesPDF: () => void
  onDeleteConfirmTextChange: (text: string) => void
  onShowDeleteConfirm: (show: boolean) => void
  onEnterReviewMode: () => void
  onReviewFieldChange: (fieldId: string, value: any) => void
  onSignAndApprove: () => void
  onCancelReview: () => void
}

// ===== Main Component =====
export default function CaregiverPartCard({
  part, partIndex, totalParts, isExpanded, state, activeTab, permissions,
  currentUserEmail, currentUserRole,
  onToggleExpand, onSetActiveTab, onEditToggle, onFieldChange, onSave, onCancel,
  onFinalize, onUnfinalize, onDelete, onToggleView, onTogglePDFDropdown,
  onDownloadPDF, onDownloadChangesPDF, onDeleteConfirmTextChange, onShowDeleteConfirm,
  onEnterReviewMode, onReviewFieldChange, onSignAndApprove, onCancelReview,
}: CaregiverPartCardProps) {
  const submission = state.fullSubmission || part.submission
  const formDef = part.formDefinition
  const status = submission?.status || 'pending'
  const hasSubmission = !!submission?.submission_id && status !== 'pending'

  // Determine display data based on current/original toggle
  const formData = state.currentView === 'original' && (submission as any)?.original_form_data
    ? (submission as any).original_form_data
    : state.editedFormData || submission?.form_data || {}

  // Sections and tabs
  const sections = formDef?.sections || []
  const allDataTabIndex = sections.length
  const documentsTabIndex = sections.length + 1
  const isAllDataTab = activeTab === allDataTabIndex
  const isDocumentsTab = activeTab === documentsTabIndex
  const activeSection = (!isAllDataTab && !isDocumentsTab) ? sections[activeTab] : null
  const visibleFields = activeSection ? getVisibleFields(activeSection, formData) : []

  // Orphan data detection
  const allDefinedFieldIds = new Set<string>()
  sections.forEach((section: any) => {
    section.fields?.forEach((field: any) => allDefinedFieldIds.add(field.field_id))
  })
  const orphanDataKeys = formData ? Object.keys(formData).filter(
    key => !allDefinedFieldIds.has(key)
      && !key.startsWith('_signature_metadata_')
      && formData[key] !== null && formData[key] !== undefined && formData[key] !== ''
  ) : []

  // E-signature metadata
  const signatureMetadata = formData ? extractSignatureMetadata(formData) : []

  // Staff role detection for Review & Sign
  // Compute which signer roles the current user can sign based on their user role
  const userSignableRoles = getSignableRoles(currentUserRole || '')
  const requiredSignerRoles = formDef ? getRequiredSignerRoles(formDef) : []
  // Only consider signer roles that this user can actually sign
  const matchingSignerRoles = requiredSignerRoles.filter(r => userSignableRoles.includes(r))
  const hasSignableFields = matchingSignerRoles.length > 0
  const staffFieldsFilled = formDef && state.reviewStaffData
    ? matchingSignerRoles.every(role => hasAllRequiredStaffFields(
        { ...formData, ...state.reviewStaffData },
        formDef,
        role
      ))
    : false

  // Signature modal for review mode
  const [reviewSignatureField, setReviewSignatureField] = useState<string | null>(null)

  // Permission-based visibility
  const userCanEdit = hasSubmission && (permissions.canEdit || (permissions.canEditAfterFinalize && status === 'finalized'))
  const userCanFinalize = hasSubmission && permissions.canFinalize && status === 'submitted'
  const userCanUnfinalize = hasSubmission && permissions.canEditAfterFinalize && status === 'finalized'
  const userCanDelete = hasSubmission && permissions.canDelete
  // Review & Sign: only if user has signable roles that match this form's staff fields
  const userCanReview = hasSubmission && hasSignableFields && status === 'submitted'


  return (
    <div className={`rounded-lg border bg-white overflow-hidden ${state.editMode ? 'border-amber-300 ring-2 ring-amber-100' : isExpanded ? 'border-blue-200' : 'border-gray-200'}`}>
      {/* ===== Delete Confirmation Modal ===== */}
      {state.showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => onShowDeleteConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delete Submission</h3>
                <p className="text-sm text-gray-600">This action cannot be undone</p>
              </div>
            </div>
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">
                You are about to permanently delete the submission for{' '}
                <span className="font-semibold">{part.formName}</span>.
                All related data including edit history will be removed.
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type <span className="font-bold text-red-600">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={state.deleteConfirmText}
                onChange={(e) => onDeleteConfirmTextChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Type DELETE"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => onShowDeleteConfirm(false)} disabled={state.isDeleting}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={onDelete} disabled={state.deleteConfirmText !== 'DELETE' || state.isDeleting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
                <Trash2 className="h-4 w-4" />
                {state.isDeleting ? 'Deleting...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Part Header (always visible) ===== */}
      <div
        className={`px-5 py-4 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isExpanded ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Part {partIndex + 1}</span>
                <h3 className="text-base font-semibold text-gray-900">{part.formName}</h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {sections.length} section{sections.length !== 1 ? 's' : ''} · {part.assignedRole.charAt(0).toUpperCase() + part.assignedRole.slice(1)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {/* Action Buttons (only when expanded and has submission) */}
            {isExpanded && hasSubmission && !state.editMode && !state.reviewMode && (
              <>
                {userCanReview && (
                  <button onClick={onEnterReviewMode}
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-400 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm">
                    <PenLine className="h-3.5 w-3.5" />
                    Review &amp; Sign
                  </button>
                )}
                {userCanEdit && (
                  <button onClick={onEditToggle}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100">
                    <Edit3 className="h-3 w-3" />
                    {!permissions.canEdit && permissions.canEditAfterFinalize ? 'Edit (Admin)' : 'Edit'}
                  </button>
                )}
                {userCanFinalize && (
                  <button onClick={onFinalize} disabled={state.isFinalizing}
                    className="inline-flex items-center gap-1 rounded-lg border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-900 hover:bg-teal-100 disabled:opacity-50">
                    <Lock className="h-3 w-3" />
                    {state.isFinalizing ? '...' : 'Finalize'}
                  </button>
                )}
                {userCanUnfinalize && (
                  <button onClick={onUnfinalize} disabled={state.isFinalizing}
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100 disabled:opacity-50">
                    <Undo2 className="h-3 w-3" />
                    {state.isFinalizing ? '...' : 'Revert'}
                  </button>
                )}
                {/* PDF Dropdown */}
                <div className="relative">
                  <button onClick={onTogglePDFDropdown}
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100">
                    <Download className="h-3 w-3" /> PDF
                  </button>
                  {state.showPDFDropdown && (
                    <div className="absolute right-0 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg z-20">
                      <button onClick={() => onDownloadPDF('current')} disabled={state.isGeneratingPDF}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 first:rounded-t-lg disabled:opacity-50">
                        <Download className="h-3 w-3 text-gray-400" /> Current Submission
                      </button>
                      {(submission as any)?.original_form_data && (
                        <button onClick={() => onDownloadPDF('original')} disabled={state.isGeneratingPDF}
                          className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 border-t border-gray-100 disabled:opacity-50">
                          <Download className="h-3 w-3 text-gray-400" /> Original Submission
                        </button>
                      )}
                      {state.editHistory.length > 0 && (
                        <button onClick={onDownloadChangesPDF} disabled={state.isGeneratingChangesPDF}
                          className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs text-amber-800 hover:bg-amber-50 border-t border-gray-100 last:rounded-b-lg disabled:opacity-50">
                          <History className="h-3 w-3 text-amber-500" />
                          {state.isGeneratingChangesPDF ? 'Generating...' : 'Changes Log'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {userCanDelete && (
                  <button onClick={() => onShowDeleteConfirm(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </>
            )}
            {/* Save/Cancel when in edit mode */}
            {isExpanded && state.editMode && (
              <>
                <button onClick={onSave} disabled={state.isSaving || state.editedFields.size === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-900 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed">
                  <Save className="h-3 w-3" />
                  {state.isSaving ? 'Saving...' : `Save${state.editedFields.size > 0 ? ` (${state.editedFields.size})` : ''}`}
                </button>
                <button onClick={onCancel} disabled={state.isSaving}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  <X className="h-3 w-3" /> Cancel
                </button>
              </>
            )}
            {/* Sign & Approve / Cancel when in review mode */}
            {isExpanded && state.reviewMode && (
              <>
                <button onClick={onSignAndApprove} disabled={state.isApproving || !staffFieldsFilled}
                  className="inline-flex items-center gap-1 rounded-lg border border-green-400 bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {state.isApproving ? 'Approving...' : 'Sign & Approve'}
                </button>
                <button onClick={onCancelReview} disabled={state.isApproving}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  <X className="h-3 w-3" /> Cancel
                </button>
              </>
            )}
            <PartStatusBadge status={status} />
          </div>
        </div>
      </div>

      {/* ===== Expanded Content ===== */}
      {isExpanded && (
        <div className="border-t border-gray-200">
          {/* Edit mode banner */}
          {state.editMode && (
            <div className="bg-amber-50 border-b border-amber-200 px-5 py-2">
              <p className="text-xs text-amber-800 flex items-center gap-2">
                <Edit3 className="h-3 w-3" /> Edit Mode — modify fields below and click Save when done
              </p>
            </div>
          )}

          {/* Review & Sign mode banner */}
          {state.reviewMode && (
            <div className="bg-blue-50 border-b border-blue-200 px-5 py-2.5">
              <p className="text-xs text-blue-800 flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="font-semibold">Reviewing as {matchingSignerRoles.includes('hr_admin') ? 'HR Administrator' : 'RN Evaluator'}</span>
                {currentUserEmail && <span className="text-blue-600">({currentUserEmail})</span>}
              </p>
              <p className="text-xs text-blue-600 mt-0.5 ml-5">
                Complete the staff fields below, then click &quot;Sign &amp; Approve&quot; to finalize.
              </p>
            </div>
          )}

          {/* Finalized banner */}
          {status === 'finalized' && !state.editMode && (
            <div className="bg-teal-50 border-b border-teal-200 px-5 py-2">
              <p className="text-xs text-teal-800 flex items-center gap-2">
                <Lock className="h-3 w-3" />
                Finalized{(submission as any)?.reviewed_by ? ` by ${(submission as any).reviewed_by}` : ''}
                {(submission as any)?.reviewed_at ? ` on ${formatDate((submission as any).reviewed_at)}` : ''}
              </p>
            </div>
          )}

          {/* Error/Success banners */}
          {state.error && (
            <div className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 p-2">
              <p className="text-xs text-red-800">{state.error}</p>
            </div>
          )}
          {state.successMessage && (
            <div className="mx-5 mt-3 rounded-lg border border-green-200 bg-green-50 p-2">
              <p className="text-xs text-green-800">{state.successMessage}</p>
            </div>
          )}

          {/* Loading state */}
          {state.isLoadingDetails && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-sm text-gray-500">Loading details...</span>
            </div>
          )}

          {/* No submission */}
          {!hasSubmission && !state.isLoadingDetails && (
            <div className="text-center py-10 text-gray-500">
              <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <AlertTriangle className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium">No submission yet for this form part</p>
              <p className="text-xs text-gray-400 mt-1">This will be filled by the {part.assignedRole}</p>
            </div>
          )}

          {/* Has submission content */}
          {hasSubmission && formDef && !state.isLoadingDetails && (
            <div className="px-5 py-4">
              {/* Tab Bar */}
              <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-200">
                {sections.map((section: any, index: number) => {
                  const TabIcon = getTabIcon(section.title)
                  const sectionFields = section.fields ? getVisibleFields(section, formData) : []
                  const hasData = sectionFields.some((f: any) => formData[f.field_id] !== undefined && formData[f.field_id] !== null && formData[f.field_id] !== '')
                  return (
                    <button key={section.section_id} onClick={() => onSetActiveTab(index)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        activeTab === index ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                      }`}>
                      <TabIcon className="h-3 w-3 flex-shrink-0" />
                      <span className="hidden sm:inline">{section.title}</span>
                      {hasData && <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />}
                    </button>
                  )
                })}
                <button onClick={() => onSetActiveTab(allDataTabIndex)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    isAllDataTab ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}>
                  <Eye className="h-3 w-3" /> All Data
                  {(() => {
                    const count = Object.keys(formData).filter(k => !k.startsWith('_signature_metadata_')).length
                    return count > 0 ? <span className="bg-blue-100 text-blue-700 text-xs rounded-full px-1.5 py-0.5 font-medium">{count}</span> : null
                  })()}
                </button>
                <button onClick={() => onSetActiveTab(documentsTabIndex)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    isDocumentsTab ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}>
                  <Download className="h-3 w-3" /> Documents
                </button>

                {/* Current/Original toggle */}
                {(submission as any)?.original_form_data && (
                  <div className="ml-auto flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
                    <button onClick={() => state.currentView !== 'current' && onToggleView()}
                      className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${state.currentView === 'current' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                      Current
                    </button>
                    <button onClick={() => state.currentView !== 'original' && onToggleView()}
                      className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${state.currentView === 'original' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                      Original
                    </button>
                  </div>
                )}
              </div>

              {/* Section Content */}
              {activeSection && (
                <div>
                  {activeSection.content && (
                    <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-gray-700"
                      dangerouslySetInnerHTML={{ __html: replaceTemplateVariables(activeSection.content, formData, activeSection.fields) }} />
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    {visibleFields.map((field: any) => {
                      const isFullWidth = ['signature', 'textarea', 'checkbox_grid', 'file_upload'].includes(field.type)
                      const sigMeta = signatureMetadata.find(s => s.fieldId === field.field_id)
                      const isStaff = isStaffField(field)
                      const isSignableByUser = isStaff && field.signer_role && userSignableRoles.includes(field.signer_role as any)
                      const reviewValue = state.reviewStaffData?.[field.field_id]

                      // In review mode: signable staff fields get a green highlight; others are read-only
                      const reviewHighlight = state.reviewMode && isSignableByUser ? 'ring-2 ring-green-300 rounded-lg p-2 -m-2 bg-green-50/50' : ''

                      return (
                        <div key={field.field_id} className={`${isFullWidth ? 'md:col-span-2' : ''} ${state.editMode && state.editedFields.has(field.field_id) ? 'ring-2 ring-amber-200 rounded-lg p-2 -m-2' : ''} ${reviewHighlight}`}>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                            {field.label}
                            {isStaff && (
                              <span className="ml-1.5 text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                                {field.signer_role === 'hr_admin' ? 'HR' : 'RN'} Only
                              </span>
                            )}
                          </label>
                          {state.editMode ? (
                            <FormFieldRenderer
                              field={field}
                              value={state.editedFormData?.[field.field_id]}
                              onChange={(_id: string, val: any) => onFieldChange(field.field_id, val)}
                              formData={state.editedFormData || {}}
                            />
                          ) : state.reviewMode && isSignableByUser ? (
                            // Staff field in review mode — interactive (only for user's signable roles)
                            field.type === 'signature' ? (
                              <div>
                                {reviewValue ? (
                                  <div
                                    onClick={() => setReviewSignatureField(field.field_id)}
                                    className="cursor-pointer border-2 border-green-300 rounded-md p-2 bg-white hover:border-green-400 transition-colors"
                                  >
                                    <img src={reviewValue} alt="Staff Signature" className="max-w-xs max-h-24 object-contain" />
                                    <p className="text-xs text-green-600 mt-1">Click to re-sign</p>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setReviewSignatureField(field.field_id)}
                                    className="inline-flex items-center gap-2 px-4 py-3 border-2 border-dashed border-green-400 rounded-lg text-sm font-medium text-green-700 hover:bg-green-50 hover:border-green-500 transition-colors w-full justify-center"
                                  >
                                    <PenLine className="h-4 w-4" />
                                    Click to sign
                                  </button>
                                )}
                              </div>
                            ) : (
                              <FormFieldRenderer
                                field={field}
                                value={reviewValue ?? ''}
                                onChange={(_id: string, val: any) => onReviewFieldChange(field.field_id, val)}
                                formData={{ ...formData, ...(state.reviewStaffData || {}) }}
                              />
                            )
                          ) : (
                            <FieldValue field={field} value={formData[field.field_id]} signatureMetadata={sigMeta?.metadata} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* All Data Tab */}
              {isAllDataTab && (
                <div className="space-y-4">
                  {Object.entries(formData)
                    .filter(([key]) => !key.startsWith('_signature_metadata_'))
                    .map(([key, value]) => {
                      const isOrphan = !allDefinedFieldIds.has(key)
                      let fieldDef: FormField | undefined
                      for (const s of sections) {
                        fieldDef = s.fields?.find((f: any) => f.field_id === key)
                        if (fieldDef) break
                      }
                      const label = fieldDef?.label || key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                      const isFullWidth = fieldDef && ['signature', 'textarea', 'checkbox_grid'].includes(fieldDef.type)
                      return (
                        <div key={key} className={`${isFullWidth ? '' : ''}`}>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                            {label} {isOrphan && <span className="text-orange-500">(custom)</span>}
                          </label>
                          {state.editMode ? (
                            fieldDef ? (
                              <FormFieldRenderer
                                field={fieldDef}
                                value={state.editedFormData?.[key]}
                                onChange={(_id: string, val: any) => onFieldChange(key, val)}
                                formData={state.editedFormData || {}}
                              />
                            ) : (
                              <input
                                type="text"
                                value={state.editedFormData?.[key] || ''}
                                onChange={(e) => onFieldChange(key, e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            )
                          ) : (
                            fieldDef ? (
                              <FieldValue field={fieldDef} value={value} />
                            ) : (
                              <span className="text-gray-900 text-sm">{typeof value === 'string' && value.startsWith('data:image') ? <img src={value} alt="Value" className="max-w-xs max-h-24 border rounded" /> : String(value)}</span>
                            )
                          )}
                        </div>
                      )
                    })}
                </div>
              )}

              {/* Documents Tab */}
              {isDocumentsTab && submission?.submission_id && (
                <DocumentsTab submissionId={submission.submission_id} />
              )}

              {/* E-Signature Security Card */}
              {!state.editMode && formDef && (
                <ESignatureSecurityCard signatureData={signatureMetadata} formDefinition={formDef} />
              )}

              {/* Edit History Card */}
              {!state.editMode && (
                <EditHistoryCard
                  editHistory={state.editHistory}
                  onDownloadChangesPDF={onDownloadChangesPDF}
                  isGeneratingChangesPDF={state.isGeneratingChangesPDF}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Review Mode: Signature Modal */}
      {reviewSignatureField && state.reviewMode && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Staff Signature</h3>
            <p className="text-sm text-gray-500 mb-4">Sign as {matchingSignerRoles.includes('hr_admin') ? 'HR Administrator' : 'RN Evaluator'}</p>
            <SignatureCanvas
              value={state.reviewStaffData?.[reviewSignatureField] || null}
              onChange={(base64: string | null) => {
                onReviewFieldChange(reviewSignatureField, base64 || '')
              }}
              readOnly={false}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setReviewSignatureField(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => setReviewSignatureField(null)}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
