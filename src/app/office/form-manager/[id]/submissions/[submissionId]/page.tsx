'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Edit3, Save, X, Loader2, Download, Eye,
  User, Phone, Mail, FileText, PenTool, Shield,
  Clock, CheckCircle, XCircle, ChevronDown,
  Building2, Heart, Briefcase, GraduationCap, DollarSign,
  History, ExternalLink, Lock, Trash2, Undo2, AlertTriangle,
  Fingerprint, MapPin, Monitor, Smartphone, Globe, Award
} from 'lucide-react'
import DOMPurify from 'dompurify'
import { SignatureSecurityMetadata } from '@/lib/esignature-security'
import {
  FormDefinition,
  FormSection,
  FormField,
  FormSubmissionData,
  getVisibleFields
} from '@/lib/form-engine'
import { FormSubmission, formatDate, getStatusLabel, getStatusColor } from '@/lib/submissions'
import { getOfficeUser, canEdit, canFinalize, canDelete, canEditAfterFinalization } from '@/lib/auth'
import FormFieldRenderer from '@/components/forms/FormFieldRenderer'
import DocumentsTab from '@/components/office/DocumentsTab'

interface SubmissionDetailResponse {
  submission: FormSubmission
  formDefinition: FormDefinition
  applicant: {
    full_name: string
    phone?: string
    email?: string
  }
}

interface PDFGenerationRequest {
  submission_data: Record<string, any>
  applicant_name: string
}

interface EditHistoryEntry {
  id: string
  field_id: string
  field_label: string | null
  old_value: any
  new_value: any
  edited_by: string
  edited_at: string
}

// Map section titles to lucide icons
function getTabIcon(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes('personal') || lower.includes('employee') || lower.includes('applicant')) return User;
  if (lower.includes('signature') || lower.includes('consent')) return PenTool;
  if (lower.includes('policy') || lower.includes('agreement')) return Shield;
  if (lower.includes('employment') || lower.includes('position') || lower.includes('work')) return Briefcase;
  if (lower.includes('education')) return GraduationCap;
  if (lower.includes('health') || lower.includes('medical') || lower.includes('benefit')) return Heart;
  if (lower.includes('tax') || lower.includes('payment') || lower.includes('bank')) return DollarSign;
  if (lower.includes('background') || lower.includes('reference')) return Shield;
  if (lower.includes('availability') || lower.includes('schedule')) return Clock;
  if (lower.includes('company') || lower.includes('office')) return Building2;
  return FileText;
}

// Render field value in read-only mode
function FieldValue({ field, value, signatureMetadata }: { field: FormField; value: any; signatureMetadata?: SignatureSecurityMetadata | null }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-400">Not provided</span>;
  }

  switch (field.type) {
    case 'signature':
      return (
        <div className="flex flex-col items-start gap-2">
          <img
            src={value}
            alt="Signature"
            className="max-w-xs max-h-24 border-2 border-gray-300 rounded-md p-2 bg-gray-50"
          />
          {signatureMetadata ? (
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs font-medium text-green-700">
                Signed {new Date(signatureMetadata.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {' '}via {signatureMetadata.is_touch_device ? 'touch device' : 'desktop'}
              </span>
              {signatureMetadata.geolocation && (
                <span className="text-xs text-gray-500 flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  verified
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs font-medium text-gray-600">Signed</span>
          )}
        </div>
      );
    case 'checkbox':
      return value ? (
        <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
          <CheckCircle className="w-4 h-4 mr-1" />
          Checked
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
          <XCircle className="w-4 h-4 mr-1" />
          Not checked
        </span>
      );
    case 'radio':
    case 'select':
      const option = field.options?.find((opt) => opt.value === value);
      return <span className="font-medium text-gray-900">{option?.label || value}</span>;
    case 'checkbox_group':
      if (Array.isArray(value)) {
        return (
          <div className="flex flex-wrap gap-2">
            {value.map((v) => {
              const opt = field.options?.find((opt) => opt.value === v);
              return (
                <span
                  key={v}
                  className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 border border-blue-200"
                >
                  {opt?.label || v}
                </span>
              );
            })}
          </div>
        );
      }
      return <span className="text-gray-900">{String(value)}</span>;
    case 'checkbox_grid':
      if (typeof value === 'object' && value !== null) {
        // Grid data is stored as { "rowKey__colKey": true/false }
        // Custom "Other" row labels stored as { "_label__rowKey": "Custom Name" }
        const gridRows = (field.rows || []) as any[];
        const gridCols = (field.columns || []) as any[];
        const getRowId = (r: any) => r.row_id || r.value || '';
        const getColId = (c: any) => c.col_id || c.value || '';
        const isOtherRow = (label: string) => /^other\s*\d*$/i.test(label.trim());
        const getCustomLabel = (rowId: string) => value[`_label__${rowId}`] || '';

        if (gridRows.length > 0 && gridCols.length > 0) {
          return (
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-600"></th>
                    {gridCols.map((col: any) => (
                      <th key={getColId(col)} className="px-3 py-2 text-center text-xs font-semibold text-gray-700">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {gridRows.map((row: any) => {
                    const rowKey = getRowId(row);
                    // Check both double underscore (new) and single underscore (legacy) formats
                    const hasAnyChecked = gridCols.some((col: any) => {
                      const ck = getColId(col);
                      return value[`${rowKey}__${ck}`] === true || value[`${rowKey}_${ck}`] === true;
                    });
                    if (!hasAnyChecked) return null; // Skip empty rows for cleaner display
                    // Show custom label for "Other" rows if one was entered by staff
                    const customLabel = isOtherRow(row.label) ? getCustomLabel(rowKey) : '';
                    const displayLabel = customLabel || row.label;
                    return (
                      <tr key={rowKey} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50">
                          {displayLabel}
                        </td>
                        {gridCols.map((col: any) => {
                          const colKey = getColId(col);
                          const checked = value[`${rowKey}__${colKey}`] === true || value[`${rowKey}_${colKey}`] === true;
                          return (
                            <td key={colKey} className="px-3 py-2 text-center">
                              {checked ? (
                                <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
                              ) : (
                                <span className="text-gray-200">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }

        // Fallback: flat list for grids without proper row/col definitions
        return (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <tbody className="divide-y divide-gray-200">
                {Object.entries(value).map(([cellKey, checked]) => (
                  <tr key={cellKey} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-700">
                      {cellKey}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {checked ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-gray-300" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      return <span className="text-gray-900">{String(value)}</span>;
    case 'textarea':
      return (
        <p className="text-gray-900 whitespace-pre-wrap max-h-32 overflow-y-auto bg-gray-50 p-3 rounded border border-gray-200">
          {String(value)}
        </p>
      );
    case 'file_upload':
      if (typeof value === 'string') {
        return (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline font-medium">
            Download file
          </a>
        );
      }
      return <span className="text-gray-900">{String(value)}</span>;
    default:
      return <span className="text-gray-900">{String(value)}</span>;
  }
}

// Extract e-signature security metadata from form_data
function extractSignatureMetadata(formData: Record<string, any>): Array<{
  fieldId: string;
  metadata: SignatureSecurityMetadata;
}> {
  const results: Array<{ fieldId: string; metadata: SignatureSecurityMetadata }> = [];
  for (const [key, value] of Object.entries(formData)) {
    if (key.startsWith('_signature_metadata_') && value && typeof value === 'object') {
      const fieldId = key.replace('_signature_metadata_', '');
      results.push({ fieldId, metadata: value as SignatureSecurityMetadata });
    }
  }
  return results;
}

// E-Signature Security Card component
function ESignatureSecurityCard({
  signatureData,
  formDefinition,
}: {
  signatureData: Array<{ fieldId: string; metadata: SignatureSecurityMetadata }>;
  formDefinition: FormDefinition;
}) {
  if (signatureData.length === 0) return null;

  // Helper to get field label
  const getFieldLabel = (fieldId: string): string => {
    for (const section of formDefinition.sections) {
      const field = section.fields?.find(f => f.field_id === fieldId);
      if (field) return field.label;
    }
    return fieldId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Format the signing timestamp
  const formatTimestamp = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="rounded-lg border border-indigo-200 bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
          <Fingerprint className="h-4 w-4 text-indigo-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">E-Signature Security</h3>
          <p className="text-xs text-gray-500">{signatureData.length} signature{signatureData.length !== 1 ? 's' : ''} captured</p>
        </div>
      </div>

      <div className="space-y-4">
        {signatureData.map(({ fieldId, metadata }) => (
          <div key={fieldId} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
            {/* Field Label */}
            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">
              {getFieldLabel(fieldId)}
            </p>

            {/* Compliance Badge */}
            <div className="flex items-center gap-1.5 mb-3">
              <Shield className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs font-medium text-green-700">E-SIGN Act Compliant</span>
            </div>

            {/* Metadata Grid */}
            <div className="space-y-2 text-xs">
              {/* Signing Timestamp */}
              <div className="flex items-start gap-2">
                <Clock className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-700">Signed</p>
                  <p className="text-gray-600">{formatTimestamp(metadata.signed_at)}</p>
                </div>
              </div>

              {/* Session ID */}
              <div className="flex items-start gap-2">
                <Fingerprint className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-700">Session ID</p>
                  <p className="text-gray-600 font-mono text-[11px] break-all">
                    {metadata.signing_session_id}
                  </p>
                </div>
              </div>

              {/* Device Type */}
              <div className="flex items-start gap-2">
                {metadata.is_touch_device ? (
                  <Smartphone className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <Monitor className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-medium text-gray-700">Device</p>
                  <p className="text-gray-600">
                    {metadata.is_touch_device ? 'Touch Device' : 'Desktop'} &middot; {metadata.platform}
                  </p>
                  <p className="text-gray-500">
                    {metadata.screen_resolution} @ {metadata.device_pixel_ratio}x
                  </p>
                </div>
              </div>

              {/* Browser / Language */}
              <div className="flex items-start gap-2">
                <Globe className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-700">Browser</p>
                  <p className="text-gray-600 break-all leading-relaxed">
                    {/* Show a shortened user agent */}
                    {metadata.user_agent.length > 80
                      ? metadata.user_agent.substring(0, 80) + '...'
                      : metadata.user_agent}
                  </p>
                  <p className="text-gray-500">
                    Language: {metadata.language} &middot; TZ: {metadata.timezone}
                  </p>
                </div>
              </div>

              {/* Geolocation */}
              {metadata.geolocation && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-700">Location Verified</p>
                    <p className="text-gray-600 font-mono text-[11px]">
                      {metadata.geolocation.latitude.toFixed(6)}, {metadata.geolocation.longitude.toFixed(6)}
                    </p>
                    <p className="text-gray-500">
                      Accuracy: {metadata.geolocation.accuracy.toFixed(0)}m
                    </p>
                  </div>
                </div>
              )}

              {!metadata.geolocation && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-400">Location</p>
                    <p className="text-gray-400 italic">Not provided</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SubmissionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const formId = params.id as string
  const submissionId = params.submissionId as string

  const [submission, setSubmission] = useState<FormSubmission | null>(null)
  const [formDefinition, setFormDefinition] = useState<FormDefinition | null>(null)
  const [applicant, setApplicant] = useState<{
    full_name: string
    phone?: string
    email?: string
  } | null>(null)

  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [editedFormData, setEditedFormData] = useState<FormSubmissionData | null>(null)
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set())
  const [currentView, setCurrentView] = useState<'current' | 'original'>('current')
  const [showPDFDropdown, setShowPDFDropdown] = useState(false)

  const [editHistory, setEditHistory] = useState<EditHistoryEntry[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)
  const [isGeneratingChangesPDF, setIsGeneratingChangesPDF] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Certificate state
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null)
  const [certificateLoading, setCertificateLoading] = useState(false)
  const [isGeneratingCertificate, setIsGeneratingCertificate] = useState(false)
  const [hasTrainingCertificate, setHasTrainingCertificate] = useState(false)

  // Get current user for permission checks
  const currentUser = getOfficeUser()

  // Build auth headers from current user
  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (currentUser) {
      headers['x-user-id'] = currentUser.id || ''
      headers['x-user-email'] = currentUser.email || ''
    }
    return headers
  }

  // Fetch submission details
  useEffect(() => {
    const fetchSubmission = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/submissions/${submissionId}`, {
          headers: getAuthHeaders(),
        })
        if (!res.ok) throw new Error('Failed to fetch submission')

        const data: SubmissionDetailResponse = await res.json()
        setSubmission(data.submission)
        setFormDefinition(data.formDefinition)
        setApplicant({
          full_name: data.applicant.full_name,
          phone: data.applicant.phone,
          email: data.applicant.email,
        })
        setEditedFormData(structuredClone(data.submission.form_data))
      } catch (err) {
        setError('Failed to load submission details')
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    if (submissionId) {
      fetchSubmission()
    }
  }, [submissionId])

  // Check for existing certificate when submission loads
  useEffect(() => {
    if (!submission || !formDefinition) return
    const meta = (formDefinition as any).metadata || {}
    const hasCertConfig = meta.certificate_config?.enabled
    setHasTrainingCertificate(!!hasCertConfig)

    if (hasCertConfig && submission.submission_id) {
      setCertificateLoading(true)
      fetch(`/api/certificates?submission_id=${submission.submission_id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.pdf_url) {
            setCertificateUrl(data.pdf_url)
          }
        })
        .catch(() => {})
        .finally(() => setCertificateLoading(false))
    }
  }, [submission, formDefinition])

  // Generate certificate for this submission
  async function handleGenerateCertificate() {
    if (!submission) return
    setIsGeneratingCertificate(true)
    try {
      const res = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submission.submission_id }),
      })
      const data = await res.json()
      if (data.pdf_url) {
        setCertificateUrl(data.pdf_url)
        setSuccessMessage('Certificate generated successfully')
        setTimeout(() => setSuccessMessage(null), 3000)
      } else {
        setError(data.error || 'Failed to generate certificate')
        setTimeout(() => setError(null), 5000)
      }
    } catch (err) {
      setError('Failed to generate certificate')
      setTimeout(() => setError(null), 5000)
    } finally {
      setIsGeneratingCertificate(false)
    }
  }

  // Fetch edit history
  useEffect(() => {
    const fetchEditHistory = async () => {
      if (!submissionId) return
      setIsLoadingHistory(true)
      try {
        const res = await fetch(`/api/submissions/${submissionId}/edit-history`, {
          headers: getAuthHeaders(),
        })
        if (res.ok) {
          const data = await res.json()
          setEditHistory(data.history || [])
        }
      } catch (err) {
        console.error('Failed to fetch edit history:', err)
      } finally {
        setIsLoadingHistory(false)
      }
    }

    if (submissionId) {
      fetchEditHistory()
    }
  }, [submissionId])

  const handleDownloadChangesPDF = async () => {
    if (!submission || !applicant || !formDefinition) return

    setIsGeneratingChangesPDF(true)
    setError(null)

    try {
      const res = await fetch(`/api/submissions/${submissionId}/changes-pdf`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          applicant_name: applicant.full_name,
          form_name: formDefinition.form_name,
        }),
      })

      if (!res.ok) throw new Error('Failed to generate changes PDF')

      const html = await res.text()
      // Open in a new window for print-to-PDF
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(html)
        win.document.close()
      }
    } catch (err) {
      setError('Failed to generate changes PDF')
      console.error(err)
    } finally {
      setIsGeneratingChangesPDF(false)
    }
  }

  const handleFieldChange = (fieldId: string, value: any) => {
    if (editedFormData) {
      const newFormData = { ...editedFormData }
      newFormData[fieldId] = value
      setEditedFormData(newFormData)

      const newEditedFields = new Set(editedFields)
      newEditedFields.add(fieldId)
      setEditedFields(newEditedFields)
    }
  }

  const handleSave = async () => {
    if (!submission || !editedFormData) return

    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          form_data: editedFormData,
          edited_by: currentUser?.name || currentUser?.email || 'office_staff',
        }),
      })

      if (!res.ok) throw new Error('Failed to save changes')

      const updatedData: SubmissionDetailResponse = await res.json()
      setSubmission(updatedData.submission)
      setEditedFormData(structuredClone(updatedData.submission.form_data))
      setEditedFields(new Set())
      setEditMode(false)
      setSuccessMessage('Changes saved successfully')

      // Refresh edit history
      const histRes = await fetch(`/api/submissions/${submissionId}/edit-history`, {
        headers: getAuthHeaders(),
      })
      if (histRes.ok) {
        const histData = await histRes.json()
        setEditHistory(histData.history || [])
      }

      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError('Failed to save changes')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    if (submission) {
      setEditedFormData(structuredClone(submission.form_data))
      setEditedFields(new Set())
      setEditMode(false)
    }
  }

  const handleFinalize = async () => {
    setIsFinalizing(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch(`/api/submissions/${submissionId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status: 'finalized',
          reviewed_by: currentUser?.name || currentUser?.email || '',
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to finalize submission')
      }

      const updatedSubmission = await res.json()
      setSubmission(updatedSubmission)
      setSuccessMessage('Submission finalized successfully')

      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to finalize submission')
      console.error(err)
    } finally {
      setIsFinalizing(false)
    }
  }

  const handleUnfinalize = async () => {
    setIsFinalizing(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch(`/api/submissions/${submissionId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status: 'submitted',
          reviewed_by: currentUser?.name || currentUser?.email || '',
          notes: 'Reverted from finalized',
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to revert submission')
      }

      const updatedSubmission = await res.json()
      setSubmission(updatedSubmission)
      setSuccessMessage('Submission reverted to submitted')

      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to revert submission')
      console.error(err)
    } finally {
      setIsFinalizing(false)
    }
  }

  const handleDelete = async () => {
    if (deleteConfirmText !== 'DELETE') return

    setIsDeleting(true)
    setError(null)

    try {
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to delete submission')
      }

      // Navigate back to submissions list
      router.push(`/office/form-manager/${formId}/submissions`)
    } catch (err: any) {
      setError(err.message || 'Failed to delete submission')
      console.error(err)
      setIsDeleting(false)
      setShowDeleteConfirm(false)
      setDeleteConfirmText('')
    }
  }

  const handleDownloadPDF = async (type: 'current' | 'original') => {
    if (!submission || !applicant || !formDefinition) return

    setIsGeneratingPDF(true)
    setError(null)

    try {
      let dataToUse: Record<string, any>;

      if (type === 'original' && submission.original_form_data) {
        dataToUse = submission.original_form_data;
      } else {
        dataToUse = submission.form_data;
      }

      const res = await fetch(`/api/forms/${formId}/generate-pdf`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          submission_data: dataToUse,
          applicant_name: applicant.full_name,
        } as PDFGenerationRequest),
      })

      if (!res.ok) throw new Error('Failed to generate PDF')

      // Download the PDF
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const downloadName = (submission as any)?.participant_name || applicant.full_name;
      a.download = `${downloadName}-${type}-submission.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError('Failed to download PDF')
      console.error(err)
    } finally {
      setIsGeneratingPDF(false)
      setShowPDFDropdown(false)
    }
  }

  // Permission checks
  const userCanEdit = submission ? canEdit(currentUser, submission.status) : false
  const userCanFinalize = canFinalize(currentUser)
  const userCanDelete = canDelete(currentUser)
  const userCanEditAfterFinalize = canEditAfterFinalization(currentUser)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error && !submission) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <Link
              href={`/office/form-manager/${formId}/submissions`}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Submissions
            </Link>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!submission || !formDefinition || !applicant) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <Link
              href={`/office/form-manager/${formId}/submissions`}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Submissions
            </Link>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-6 py-8">
          <p className="text-gray-600">Submission not found</p>
        </div>
      </div>
    )
  }

  // Get the current data view (current or original)
  const displayData = currentView === 'original' && submission.original_form_data
    ? submission.original_form_data
    : submission.form_data;

  // Extract e-signature security metadata for the sidebar card
  const signatureMetadata = extractSignatureMetadata(submission.form_data);

  // Collect ALL field IDs that are defined across all sections
  const allDefinedFieldIds = new Set<string>();
  formDefinition.sections.forEach(section => {
    section.fields?.forEach(field => allDefinedFieldIds.add(field.field_id));
  });

  // Find "orphan" data keys — submitted by applicant but not in any section's fields
  // Exclude _signature_metadata_* keys — these are shown in the dedicated security card
  const orphanDataKeys = Object.keys(displayData).filter(
    key => !allDefinedFieldIds.has(key)
      && !key.startsWith('_signature_metadata_')
      && displayData[key] !== null && displayData[key] !== undefined && displayData[key] !== ''
  );

  // Check if we're on the "All Submitted Data" tab (last tab)
  const allDataTabIndex = formDefinition.sections.length;
  const documentsTabIndex = formDefinition.sections.length + 1;
  const isAllDataTab = activeTabIndex === allDataTabIndex;
  const isDocumentsTab = activeTabIndex === documentsTabIndex;

  // Get the active section (null if on All Data or Documents tab)
  const activeSection = (isAllDataTab || isDocumentsTab) ? null : formDefinition.sections[activeTabIndex];
  const visibleFields = activeSection ? getVisibleFields(activeSection, displayData) : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
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
                You are about to permanently delete the submission from{' '}
                <span className="font-semibold">{applicant.full_name}</span> for{' '}
                <span className="font-semibold">{formDefinition.form_name}</span>.
                All related data including edit history will be removed.
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type <span className="font-bold text-red-600">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="Type DELETE"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? 'Deleting...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== COMPACT HEADER ==================== */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          {/* Row 1: Back link */}
          <Link
            href={`/office/form-manager/${formId}/submissions`}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Submissions
          </Link>

          {/* Row 2: Name + Status + Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-xl font-bold text-gray-900">{applicant.full_name}</h1>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(submission.status)}`}>
                    {submission.status === 'finalized' && <Lock className="h-3 w-3" />}
                    {getStatusLabel(submission.status)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-0.5 text-sm text-gray-500">
                  {applicant.phone && (
                    <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{applicant.phone}</span>
                  )}
                  {applicant.email && (
                    <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{applicant.email}</span>
                  )}
                  <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{formDefinition.form_name}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDate(submission.submitted_at)}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {!editMode ? (
                <>
                  {(userCanEdit || (userCanEditAfterFinalize && submission.status === 'finalized')) && (
                    <button
                      onClick={() => setEditMode(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      {!userCanEdit ? 'Edit (Admin)' : 'Edit'}
                    </button>
                  )}
                  {submission.status === 'submitted' && userCanFinalize && (
                    <button
                      onClick={handleFinalize}
                      disabled={isFinalizing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-900 hover:bg-teal-100 disabled:opacity-50"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      {isFinalizing ? 'Finalizing...' : 'Finalize'}
                    </button>
                  )}
                  {submission.status === 'finalized' && userCanEditAfterFinalize && (
                    <button
                      onClick={handleUnfinalize}
                      disabled={isFinalizing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-900 hover:bg-blue-100 disabled:opacity-50"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      {isFinalizing ? 'Reverting...' : 'Revert'}
                    </button>
                  )}
                  <div className="relative">
                    <button
                      onClick={() => setShowPDFDropdown(!showPDFDropdown)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-900 hover:bg-blue-100"
                    >
                      <Download className="h-3.5 w-3.5" />
                      PDF
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    {showPDFDropdown && (
                      <div className="absolute right-0 mt-1 w-52 rounded-lg border border-gray-200 bg-white shadow-lg z-20">
                        <button
                          onClick={() => handleDownloadPDF('current')}
                          disabled={isGeneratingPDF}
                          className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5 text-gray-400" />
                          Current Submission
                        </button>
                        {submission.original_form_data && (
                          <button
                            onClick={() => handleDownloadPDF('original')}
                            disabled={isGeneratingPDF}
                            className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 disabled:opacity-50"
                          >
                            <Download className="h-3.5 w-3.5 text-gray-400" />
                            Original Submission
                          </button>
                        )}
                        {editHistory.length > 0 && (
                          <button
                            onClick={handleDownloadChangesPDF}
                            disabled={isGeneratingChangesPDF}
                            className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-amber-800 hover:bg-amber-50 border-t border-gray-100 last:rounded-b-lg disabled:opacity-50"
                          >
                            <History className="h-3.5 w-3.5 text-amber-500" />
                            {isGeneratingChangesPDF ? 'Generating...' : 'Changes Log PDF'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {userCanDelete && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || editedFields.size === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-900 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isSaving ? 'Saving...' : `Save${editedFields.size > 0 ? ` (${editedFields.size})` : ''}`}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== BANNERS ==================== */}
      {error && (
        <div className="mx-auto max-w-7xl px-6 pt-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}
      {successMessage && (
        <div className="mx-auto max-w-7xl px-6 pt-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-sm text-green-800">{successMessage}</p>
          </div>
        </div>
      )}
      {editMode && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="mx-auto max-w-7xl px-6 py-2">
            <p className="text-sm text-amber-800 flex items-center gap-2">
              <Edit3 className="h-3.5 w-3.5" />
              Edit Mode — modify fields below and click Save when done
            </p>
          </div>
        </div>
      )}
      {submission.status === 'finalized' && !editMode && (
        <div className="bg-teal-50 border-b border-teal-200">
          <div className="mx-auto max-w-7xl px-6 py-2">
            <p className="text-sm text-teal-800 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5" />
              Finalized{submission.reviewed_by ? ` by ${submission.reviewed_by}` : ''}{submission.reviewed_at ? ` on ${formatDate(submission.reviewed_at)}` : ''}
              {!userCanEditAfterFinalize ? ' — editing is locked' : ' — admin editing allowed'}
            </p>
          </div>
        </div>
      )}

      {/* ==================== MAIN CONTENT ==================== */}
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* ===== LEFT: Tabbed Form Content ===== */}
          <div className="lg:col-span-2">
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">

              {/* Tab Bar + View Toggle */}
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {formDefinition.sections.map((section, index) => {
                    const TabIcon = getTabIcon(section.title);
                    const sectionFields = section.fields ? getVisibleFields(section, displayData) : [];
                    const hasData = sectionFields.some(f => displayData[f.field_id] !== undefined && displayData[f.field_id] !== null && displayData[f.field_id] !== '');
                    return (
                      <button
                        key={section.section_id}
                        onClick={() => setActiveTabIndex(index)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          activeTabIndex === index
                            ? 'bg-blue-100 text-blue-700 border border-blue-300'
                            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <TabIcon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="hidden sm:inline">{section.title}</span>
                        {hasData && (
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" title="Has data" />
                        )}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setActiveTabIndex(allDataTabIndex)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isAllDataTab
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="hidden sm:inline">All Data</span>
                    {(() => {
                      const visibleCount = Object.keys(displayData).filter(k => !k.startsWith('_signature_metadata_')).length;
                      return visibleCount > 0 ? (
                        <span className="bg-blue-100 text-blue-700 text-xs rounded-full px-1.5 py-0.5 font-medium">{visibleCount}</span>
                      ) : null;
                    })()}
                  </button>
                  {/* Only show Documents tab when the form supports document uploads */}
                  {(() => {
                    const meta = (formDefinition as any).metadata || {};
                    const hasDocTypes = Array.isArray(meta.document_types) && meta.document_types.length > 0;
                    const isHidden = meta.hide_document_uploads === true;
                    return hasDocTypes && !isHidden;
                  })() && (
                    <button
                      onClick={() => setActiveTabIndex(documentsTabIndex)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        isDocumentsTab
                          ? 'bg-blue-100 text-blue-700 border border-blue-300'
                          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <Download className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="hidden sm:inline">Documents</span>
                    </button>
                  )}

                  {/* View Toggle — always visible, disabled when no original */}
                  <div className="ml-auto flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
                    <button
                      onClick={() => setCurrentView('current')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        currentView === 'current'
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Current
                    </button>
                    <button
                      onClick={() => submission.original_form_data && setCurrentView('original')}
                      disabled={!submission.original_form_data}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        currentView === 'original'
                          ? 'bg-blue-600 text-white'
                          : submission.original_form_data
                            ? 'text-gray-500 hover:text-gray-700'
                            : 'text-gray-300 cursor-not-allowed'
                      }`}
                      title={!submission.original_form_data ? 'No staff edits yet — original will be available after the first edit' : 'View original applicant submission'}
                    >
                      Original
                    </button>
                  </div>
                </div>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {/* Section-based tab */}
                {activeSection && (
                  <div className="space-y-6">
                    {activeSection.content && (
                      <div
                        className="form-content p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-700"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeSection.content) }}
                      />
                    )}
                    {visibleFields.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                        {visibleFields.map((field: FormField) => {
                          const value = displayData[field.field_id];
                          const isEdited = editedFields?.has(field.field_id);
                          const borderClass = isEdited && editMode ? 'border-l-4 border-amber-400 pl-4' : '';
                          const fullWidth = field.type === 'signature' || field.type === 'textarea' || field.type === 'checkbox_grid' ? 'md:col-span-2' : '';

                          return (
                            <div key={field.field_id} className={`${borderClass} ${fullWidth}`}>
                              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                {field.label}
                                {field.required && <span className="text-red-500 ml-0.5">*</span>}
                              </label>
                              {editMode && currentView === 'current' && (
                                <FormFieldRenderer
                                  field={field}
                                  value={editedFormData?.[field.field_id]}
                                  onChange={handleFieldChange}
                                  formData={editedFormData || {}}
                                  readOnly={false}
                                />
                              )}
                              {!editMode && (
                                <div className="text-gray-900">
                                  <FieldValue
                                    field={field}
                                    value={value}
                                    signatureMetadata={field.type === 'signature' ? (submission.form_data[`_signature_metadata_${field.field_id}`] || null) : null}
                                  />
                                </div>
                              )}
                              {editMode && currentView === 'original' && (
                                <p className="text-sm text-gray-400 italic">Switch to Current view to edit</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-center py-8 text-gray-400 text-sm italic">
                        This section contains policy text only — no editable fields.
                      </p>
                    )}
                  </div>
                )}

                {/* All Submitted Data tab */}
                {isAllDataTab && (
                  <div className="space-y-6">
                    {(() => {
                      const visibleEntries = Object.entries(displayData)
                        .filter(([key, v]) => !key.startsWith('_signature_metadata_') && v !== null && v !== undefined && v !== '');
                      return (
                        <>
                          <p className="text-sm text-gray-500">
                            {visibleEntries.length} field{visibleEntries.length !== 1 ? 's' : ''}
                            {signatureMetadata.length > 0 && (
                              <span className="text-indigo-600 ml-1">
                                + {signatureMetadata.length} signature record{signatureMetadata.length !== 1 ? 's' : ''} in sidebar
                              </span>
                            )}
                          </p>
                          {visibleEntries.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                              {visibleEntries.map(([fieldId, value]) => {
                                let fieldDef: FormField | undefined;
                                for (const section of formDefinition.sections) {
                                  fieldDef = section.fields?.find(f => f.field_id === fieldId);
                                  if (fieldDef) break;
                                }
                                const isEdited = editedFields?.has(fieldId);
                                const borderClass = isEdited && editMode ? 'border-l-4 border-amber-400 pl-4' : '';
                                const label = fieldDef?.label || fieldId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                                const isSignature = fieldDef?.type === 'signature' || (typeof value === 'string' && value.startsWith('data:image'));
                                const isLargeText = typeof value === 'string' && value.length > 200;
                                const fullWidth = (isSignature || isLargeText) ? 'md:col-span-2' : '';

                                return (
                                  <div key={fieldId} className={`${borderClass} ${fullWidth}`}>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                      {label}
                                      {!fieldDef && <span className="text-xs font-normal text-gray-300 normal-case ml-1">(custom)</span>}
                                    </label>
                                    {editMode && currentView === 'current' && fieldDef ? (
                                      <FormFieldRenderer
                                        field={fieldDef}
                                        value={editedFormData?.[fieldId]}
                                        onChange={handleFieldChange}
                                        formData={editedFormData || {}}
                                        readOnly={false}
                                      />
                                    ) : editMode && currentView === 'current' && !fieldDef ? (
                                      <input
                                        type="text"
                                        value={String(editedFormData?.[fieldId] ?? '')}
                                        onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    ) : (
                                      <div className="text-gray-900">
                                        {fieldDef ? (
                                          <FieldValue
                                            field={fieldDef}
                                            value={value}
                                            signatureMetadata={fieldDef.type === 'signature' ? (submission.form_data[`_signature_metadata_${fieldDef.field_id}`] || null) : null}
                                          />
                                        ) : typeof value === 'boolean' ? (
                                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${value ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                            {value ? 'Yes' : 'No'}
                                          </span>
                                        ) : typeof value === 'string' && value.startsWith('data:image') ? (
                                          <img src={value} alt="Signature" className="max-w-xs max-h-24 border-2 border-gray-300 rounded-md p-2 bg-gray-50" />
                                        ) : Array.isArray(value) ? (
                                          <div className="flex flex-wrap gap-1">
                                            {value.map((v, i) => (
                                              <span key={i} className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                                                {String(v)}
                                              </span>
                                            ))}
                                          </div>
                                        ) : typeof value === 'object' ? (
                                          <pre className="text-xs bg-gray-50 p-2 rounded border border-gray-200 overflow-auto max-h-32">{JSON.stringify(value, null, 2)}</pre>
                                        ) : (
                                          <span className="text-gray-900">{String(value)}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-center py-8 text-gray-500">No data submitted yet.</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Documents tab */}
                {isDocumentsTab && (
                  <DocumentsTab submissionId={submission.submission_id} />
                )}
              </div>
            </div>
          </div>

          {/* ===== RIGHT: Sidebar ===== */}
          <div className="flex flex-col gap-4">

            {/* Edit Tracking Card — ALWAYS VISIBLE */}
            <div className={`rounded-lg border p-4 ${editHistory.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
                  <History className={`h-4 w-4 ${editHistory.length > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
                  Edit Tracking
                </h3>
                {editHistory.length > 0 && (
                  <span className="text-xs bg-amber-200 text-amber-900 rounded-full px-2 py-0.5 font-semibold">
                    {editHistory.length}
                  </span>
                )}
              </div>

              {editHistory.length > 0 ? (
                <>
                  {/* Summary */}
                  <div className="text-xs text-amber-800 mb-3 space-y-0.5">
                    {(() => {
                      const uniqueFields = new Set(editHistory.map(e => e.field_label || e.field_id));
                      const uniqueStaff = new Set(editHistory.map(e => e.edited_by));
                      const latestEdit = editHistory[0];
                      return (
                        <>
                          <p><span className="font-semibold">{uniqueFields.size}</span> field{uniqueFields.size !== 1 ? 's' : ''} modified by {Array.from(uniqueStaff).join(', ')}</p>
                          {latestEdit && <p>Last edit: {formatDate(latestEdit.edited_at)}</p>}
                        </>
                      );
                    })()}
                  </div>

                  {/* Changes List */}
                  <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                    {editHistory.slice(0, 8).map((entry) => (
                      <div key={entry.id} className="border-l-2 border-amber-400 pl-2.5 py-0.5">
                        <p className="text-xs font-medium text-gray-900">{entry.field_label || entry.field_id}</p>
                        <p className="text-[11px] text-gray-500">
                          <span className="text-red-600 line-through">
                            {entry.old_value === null ? '(empty)' : typeof entry.old_value === 'string' && entry.old_value.startsWith('data:image') ? '[Signature]' : String(entry.old_value).slice(0, 30)}
                          </span>
                          {' → '}
                          <span className="text-green-700 font-medium">
                            {typeof entry.new_value === 'string' && entry.new_value.startsWith('data:image') ? '[Signature]' : String(entry.new_value).slice(0, 30)}
                          </span>
                        </p>
                        <p className="text-[10px] text-gray-400">{formatDate(entry.edited_at)} • {entry.edited_by}</p>
                      </div>
                    ))}
                    {editHistory.length > 8 && (
                      <p className="text-[11px] text-gray-500 text-center">+{editHistory.length - 8} more</p>
                    )}
                  </div>

                  {/* Changes PDF Button — PROMINENT */}
                  <button
                    onClick={handleDownloadChangesPDF}
                    disabled={isGeneratingChangesPDF}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {isGeneratingChangesPDF ? 'Generating...' : 'Download Changes PDF'}
                  </button>
                </>
              ) : (
                <div className="text-center py-3">
                  <p className="text-sm text-gray-400">No staff edits recorded yet</p>
                  <p className="text-xs text-gray-300 mt-1">Changes will appear here after using Edit mode</p>
                </div>
              )}
            </div>

            {/* Timeline Card */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="mb-3 font-semibold text-gray-900 text-sm">Timeline</h3>
              <div className="space-y-3 text-sm">
                <div className="flex gap-2.5">
                  <Clock className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-gray-900">Created</p>
                    <p className="text-xs text-gray-500">{formatDate(submission.created_at)}</p>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <CheckCircle className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-gray-900">Submitted</p>
                    <p className="text-xs text-gray-500">{formatDate(submission.submitted_at)}</p>
                  </div>
                </div>
                {editHistory.length > 0 && (
                  <div className="flex gap-2.5">
                    <Edit3 className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-gray-900">Edited by Staff</p>
                      <p className="text-xs text-gray-500">{editHistory.length} change{editHistory.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                )}
                {submission.reviewed_at && (
                  <div className="flex gap-2.5">
                    {submission.status === 'finalized' ? (
                      <Lock className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-xs font-medium text-gray-900">
                        {submission.status === 'finalized' ? 'Finalized' : getStatusLabel(submission.status)}
                      </p>
                      <p className="text-xs text-gray-500">{formatDate(submission.reviewed_at)}</p>
                      {submission.reviewed_by && (
                        <p className="text-xs text-gray-400">by {submission.reviewed_by}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* E-Signature Security Card */}
            <ESignatureSecurityCard
              signatureData={signatureMetadata}
              formDefinition={formDefinition}
            />

            {/* Quick Downloads */}
            {!editMode && (
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 font-semibold text-gray-900 text-sm">Downloads</h3>
                <div className="space-y-1.5">
                  <button
                    onClick={() => handleDownloadPDF('current')}
                    disabled={isGeneratingPDF}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {isGeneratingPDF ? 'Generating...' : 'Current Submission PDF'}
                  </button>
                  {submission.original_form_data && (
                    <button
                      onClick={() => handleDownloadPDF('original')}
                      disabled={isGeneratingPDF}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Original Submission PDF
                    </button>
                  )}
                  {editHistory.length > 0 && (
                    <button
                      onClick={handleDownloadChangesPDF}
                      disabled={isGeneratingChangesPDF}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    >
                      <History className="h-3.5 w-3.5" />
                      {isGeneratingChangesPDF ? 'Generating...' : 'Changes Log PDF'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Certificate Section — only for training courses */}
            {hasTrainingCertificate && !editMode && (
              <div className="rounded-lg border border-teal-200 bg-white p-4">
                <h3 className="mb-3 font-semibold text-gray-900 text-sm flex items-center gap-2">
                  <Award className="h-4 w-4 text-teal-600" />
                  Certificate
                </h3>
                <div className="space-y-2">
                  {certificateLoading ? (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                    </div>
                  ) : certificateUrl ? (
                    <>
                      <a
                        href={certificateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-800 hover:bg-teal-100"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download Certificate
                      </a>
                      <button
                        onClick={handleGenerateCertificate}
                        disabled={isGeneratingCertificate}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {isGeneratingCertificate ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Award className="h-3.5 w-3.5" />
                        )}
                        {isGeneratingCertificate ? 'Regenerating...' : 'Regenerate Certificate'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleGenerateCertificate}
                      disabled={isGeneratingCertificate}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-50"
                    >
                      {isGeneratingCertificate ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Award className="h-3.5 w-3.5" />
                      )}
                      {isGeneratingCertificate ? 'Generating...' : 'Generate Certificate'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
