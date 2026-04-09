'use client'

import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, User, Phone, Mail, Download, FileText
} from 'lucide-react'
import { FormSubmission, formatDate } from '@/lib/submissions'
import { FormDefinition } from '@/lib/form-engine'
import { getOfficeUser, canEdit, canFinalize, canDelete, canEditAfterFinalization } from '@/lib/auth'
import { PartState, UnifiedPart, createInitialPartState, EditHistoryEntry } from '@/lib/caregiver-types'
import CaregiverPartCard from '@/components/office/CaregiverPartCard'

function CaregiverUnifiedPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const name = searchParams.get('name') || ''
  const phone = searchParams.get('phone') || ''
  const templateId = searchParams.get('templateId') || ''

  // Core state
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [applicant, setApplicant] = useState<{ full_name: string; phone?: string; email?: string | null }>({ full_name: name, phone })
  const [parts, setParts] = useState<UnifiedPart[]>([])
  const [expandedParts, setExpandedParts] = useState<Set<number>>(new Set())
  const [activeTabByPart, setActiveTabByPart] = useState<Record<number, number>>({})
  const [isDownloadingAll, setIsDownloadingAll] = useState(false)

  // Per-part state
  const [partStates, setPartStates] = useState<Record<number, PartState>>({})
  const fetchedPartsRef = useRef<Set<number>>(new Set())

  // Auth
  const currentUser = getOfficeUser()
  const permissions = {
    canEdit: currentUser ? canEdit(currentUser, 'submitted') : false,
    canFinalize: canFinalize(currentUser),
    canDelete: canDelete(currentUser),
    canEditAfterFinalize: canEditAfterFinalization(currentUser),
  }

  // Auth headers helper
  const getAuthHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (currentUser) {
      headers['x-user-id'] = currentUser.id || ''
      headers['x-user-email'] = currentUser.email || ''
    }
    return headers
  }, [currentUser])

  // ===== Part state helpers =====
  const getPartState = useCallback((partIndex: number): PartState => {
    return partStates[partIndex] || createInitialPartState()
  }, [partStates])

  const updatePartState = useCallback((partIndex: number, updates: Partial<PartState>) => {
    setPartStates(prev => ({
      ...prev,
      [partIndex]: { ...(prev[partIndex] || createInitialPartState()), ...updates }
    }))
  }, [])

  // ===== Fetch initial unified data =====
  useEffect(() => {
    const fetchData = async () => {
      if (!name || !phone) {
        setError('Missing caregiver info')
        setIsLoading(false)
        return
      }

      try {
        const params = new URLSearchParams({ name, phone })
        if (templateId) params.set('templateId', templateId)

        const res = await fetch(`/api/submissions/unified?${params}`, {
          headers: getAuthHeaders(),
        })
        if (!res.ok) throw new Error('Failed to load caregiver data')

        const data = await res.json()
        setTemplateName(data.template?.name || '')
        setApplicant(data.applicant || { full_name: name, phone })
        setParts(data.parts || [])

        // Auto-expand all parts
        const expanded = new Set<number>()
        data.parts?.forEach((_: any, i: number) => expanded.add(i))
        setExpandedParts(expanded)
      } catch (err: any) {
        setError(err.message || 'Failed to load data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [name, phone, templateId, getAuthHeaders])

  // ===== Lazy-load full submission data when part is expanded =====
  const fetchPartDetails = useCallback(async (partIndex: number) => {
    const part = parts[partIndex]
    if (!part?.submission?.submission_id) return
    if (fetchedPartsRef.current.has(partIndex)) return // already fetched or in-flight

    fetchedPartsRef.current.add(partIndex)
    updatePartState(partIndex, { isLoadingDetails: true })

    try {
      // Fetch full submission (includes original_form_data)
      const res = await fetch(`/api/submissions/${part.submission.submission_id}`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error('Failed to load submission details')

      const data = await res.json()
      updatePartState(partIndex, {
        fullSubmission: data.submission,
        editedFormData: structuredClone(data.submission.form_data),
        isLoadingDetails: false,
      })

      // Also fetch edit history
      try {
        const histRes = await fetch(`/api/submissions/${part.submission.submission_id}/edit-history`, {
          headers: getAuthHeaders(),
        })
        if (histRes.ok) {
          const histData = await histRes.json()
          updatePartState(partIndex, { editHistory: histData.history || [] })
        }
      } catch (err) {
        console.error('Failed to fetch edit history:', err)
      }
    } catch (err: any) {
      fetchedPartsRef.current.delete(partIndex) // allow retry on error
      updatePartState(partIndex, {
        error: err.message || 'Failed to load details',
        isLoadingDetails: false,
      })
    }
  }, [parts, updatePartState, getAuthHeaders])

  const fetchPartHistory = useCallback(async (partIndex: number, submissionId: string) => {
    try {
      const res = await fetch(`/api/submissions/${submissionId}/edit-history`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        updatePartState(partIndex, { editHistory: data.history || [] })
      }
    } catch (err) {
      console.error('Failed to fetch edit history:', err)
    }
  }, [updatePartState, getAuthHeaders])

  // Trigger lazy-load when parts expand — sequential to avoid resource exhaustion
  useEffect(() => {
    let cancelled = false
    const loadSequentially = async () => {
      for (const partIndex of Array.from(expandedParts)) {
        if (cancelled) break
        if (parts[partIndex]?.submission?.submission_id && !fetchedPartsRef.current.has(partIndex)) {
          await fetchPartDetails(partIndex)
        }
      }
    }
    loadSequentially()
    return () => { cancelled = true }
  }, [expandedParts, parts, fetchPartDetails])

  // ===== Toggle expand =====
  const toggleExpand = useCallback((partIndex: number) => {
    setExpandedParts(prev => {
      const next = new Set(prev)
      if (next.has(partIndex)) next.delete(partIndex)
      else next.add(partIndex)
      return next
    })
  }, [])

  // ===== Tab management =====
  const setActiveTab = useCallback((partIndex: number, tab: number) => {
    setActiveTabByPart(prev => ({ ...prev, [partIndex]: tab }))
  }, [])

  // ===== Edit handlers =====
  const handleEditToggle = useCallback((partIndex: number) => {
    const state = getPartState(partIndex)
    const part = parts[partIndex]
    const submission = state.fullSubmission || part.submission

    if (state.editMode) {
      // Cancel edit
      updatePartState(partIndex, {
        editMode: false,
        editedFormData: submission ? structuredClone(submission.form_data) : null,
        editedFields: new Set(),
      })
    } else {
      updatePartState(partIndex, {
        editMode: true,
        editedFormData: submission ? structuredClone(submission.form_data) : null,
        editedFields: new Set(),
        error: null,
        successMessage: null,
      })
    }
  }, [parts, getPartState, updatePartState])

  const handleFieldChange = useCallback((partIndex: number, fieldId: string, value: any) => {
    const state = getPartState(partIndex)
    if (!state.editedFormData) return

    const newFormData = { ...state.editedFormData, [fieldId]: value }
    const newEditedFields = new Set(state.editedFields)
    newEditedFields.add(fieldId)

    updatePartState(partIndex, {
      editedFormData: newFormData,
      editedFields: newEditedFields,
    })
  }, [getPartState, updatePartState])

  const handleSave = useCallback(async (partIndex: number) => {
    const part = parts[partIndex]
    const state = getPartState(partIndex)
    const submission = state.fullSubmission || part.submission
    if (!submission?.submission_id || !state.editedFormData) return

    updatePartState(partIndex, { isSaving: true, error: null })

    try {
      const res = await fetch(`/api/submissions/${submission.submission_id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          form_data: state.editedFormData,
          edited_by: currentUser?.name || currentUser?.email || 'office_staff',
        }),
      })

      if (!res.ok) throw new Error('Failed to save changes')

      const data = await res.json()

      // Update part submission in the parts array
      const newParts = [...parts]
      newParts[partIndex] = { ...newParts[partIndex], submission: data.submission }
      setParts(newParts)

      updatePartState(partIndex, {
        editMode: false,
        fullSubmission: data.submission,
        editedFormData: structuredClone(data.submission.form_data),
        editedFields: new Set(),
        isSaving: false,
        successMessage: 'Changes saved successfully',
      })

      // Refresh history
      fetchPartHistory(partIndex, submission.submission_id)

      setTimeout(() => updatePartState(partIndex, { successMessage: null }), 3000)
    } catch (err: any) {
      updatePartState(partIndex, { error: err.message, isSaving: false })
    }
  }, [parts, getPartState, updatePartState, getAuthHeaders, currentUser, fetchPartHistory])

  const handleCancel = useCallback((partIndex: number) => {
    const part = parts[partIndex]
    const state = getPartState(partIndex)
    const submission = state.fullSubmission || part.submission

    updatePartState(partIndex, {
      editMode: false,
      editedFormData: submission ? structuredClone(submission.form_data) : null,
      editedFields: new Set(),
    })
  }, [parts, getPartState, updatePartState])

  // ===== Finalize/Unfinalize =====
  const handleFinalize = useCallback(async (partIndex: number) => {
    const part = parts[partIndex]
    const state = getPartState(partIndex)
    const submission = state.fullSubmission || part.submission
    if (!submission?.submission_id) return

    updatePartState(partIndex, { isFinalizing: true, error: null })

    try {
      const res = await fetch(`/api/submissions/${submission.submission_id}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status: 'finalized',
          reviewed_by: currentUser?.name || currentUser?.email || '',
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to finalize')
      }

      const updatedSubmission = await res.json()
      const newParts = [...parts]
      newParts[partIndex] = { ...newParts[partIndex], submission: updatedSubmission }
      setParts(newParts)

      updatePartState(partIndex, {
        fullSubmission: updatedSubmission,
        isFinalizing: false,
        successMessage: 'Submission finalized successfully',
      })
      setTimeout(() => updatePartState(partIndex, { successMessage: null }), 3000)
    } catch (err: any) {
      updatePartState(partIndex, { error: err.message, isFinalizing: false })
    }
  }, [parts, getPartState, updatePartState, getAuthHeaders, currentUser])

  const handleUnfinalize = useCallback(async (partIndex: number) => {
    const part = parts[partIndex]
    const state = getPartState(partIndex)
    const submission = state.fullSubmission || part.submission
    if (!submission?.submission_id) return

    updatePartState(partIndex, { isFinalizing: true, error: null })

    try {
      const res = await fetch(`/api/submissions/${submission.submission_id}/status`, {
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
        throw new Error(errData.error || 'Failed to revert')
      }

      const updatedSubmission = await res.json()
      const newParts = [...parts]
      newParts[partIndex] = { ...newParts[partIndex], submission: updatedSubmission }
      setParts(newParts)

      updatePartState(partIndex, {
        fullSubmission: updatedSubmission,
        isFinalizing: false,
        successMessage: 'Submission reverted to submitted',
      })
      setTimeout(() => updatePartState(partIndex, { successMessage: null }), 3000)
    } catch (err: any) {
      updatePartState(partIndex, { error: err.message, isFinalizing: false })
    }
  }, [parts, getPartState, updatePartState, getAuthHeaders, currentUser])

  // ===== Delete =====
  const handleDelete = useCallback(async (partIndex: number) => {
    const part = parts[partIndex]
    const state = getPartState(partIndex)
    const submission = state.fullSubmission || part.submission
    if (!submission?.submission_id || state.deleteConfirmText !== 'DELETE') return

    updatePartState(partIndex, { isDeleting: true, error: null })

    try {
      const res = await fetch(`/api/submissions/${submission.submission_id}`, {
        method: 'DELETE',
        headers: {
          'x-user-email': currentUser?.email || '',
          'x-user-id': currentUser?.id || '',
        },
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to delete')
      }

      // Clear the submission from this part (don't remove the part, just clear its submission)
      fetchedPartsRef.current.delete(partIndex)
      const newParts = [...parts]
      newParts[partIndex] = { ...newParts[partIndex], submission: null }
      setParts(newParts)

      updatePartState(partIndex, {
        ...createInitialPartState(),
      })
    } catch (err: any) {
      updatePartState(partIndex, {
        error: err.message,
        isDeleting: false,
        showDeleteConfirm: false,
        deleteConfirmText: '',
      })
    }
  }, [parts, getPartState, updatePartState, currentUser])

  // ===== PDF generation =====
  const handleDownloadPDF = useCallback(async (partIndex: number, type: 'current' | 'original') => {
    const part = parts[partIndex]
    const state = getPartState(partIndex)
    const submission = state.fullSubmission || part.submission
    if (!submission?.submission_id) return

    updatePartState(partIndex, { isGeneratingPDF: true, error: null })

    try {
      const dataToUse = type === 'original' && (submission as any)?.original_form_data
        ? (submission as any).original_form_data
        : submission.form_data

      const res = await fetch(`/api/forms/${part.formId}/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_data: dataToUse,
          applicant_name: applicant.full_name,
        }),
      })

      if (!res.ok) throw new Error('Failed to generate PDF')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${applicant.full_name}-${part.formName}-${type}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err: any) {
      updatePartState(partIndex, { error: err.message || 'Failed to download PDF' })
    } finally {
      updatePartState(partIndex, { isGeneratingPDF: false, showPDFDropdown: false })
    }
  }, [parts, getPartState, updatePartState, applicant])

  const handleDownloadChangesPDF = useCallback(async (partIndex: number) => {
    const part = parts[partIndex]
    const state = getPartState(partIndex)
    const submission = state.fullSubmission || part.submission
    if (!submission?.submission_id) return

    updatePartState(partIndex, { isGeneratingChangesPDF: true, error: null })

    try {
      const res = await fetch(`/api/submissions/${submission.submission_id}/changes-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicant_name: applicant.full_name,
          form_name: part.formDefinition?.form_name || part.formName,
        }),
      })

      if (!res.ok) throw new Error('Failed to generate changes PDF')

      const html = await res.text()
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(html)
        win.document.close()
      }
    } catch (err: any) {
      updatePartState(partIndex, { error: err.message })
    } finally {
      updatePartState(partIndex, { isGeneratingChangesPDF: false })
    }
  }, [parts, getPartState, updatePartState, applicant])

  // Download All PDFs
  const handleDownloadAllPDFs = useCallback(async () => {
    setIsDownloadingAll(true)
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const state = getPartState(i)
      const submission = state.fullSubmission || part.submission
      if (submission?.submission_id) {
        await handleDownloadPDF(i, 'current')
        await new Promise(resolve => setTimeout(resolve, 600))
      }
    }
    setIsDownloadingAll(false)
  }, [parts, getPartState, handleDownloadPDF])

  // ===== Review & Sign handlers =====
  const handleEnterReviewMode = useCallback((partIndex: number) => {
    updatePartState(partIndex, {
      reviewMode: true,
      reviewStaffData: {},
      error: null,
      successMessage: null,
    })
  }, [updatePartState])

  const handleReviewFieldChange = useCallback((partIndex: number, fieldId: string, value: any) => {
    const state = getPartState(partIndex)
    updatePartState(partIndex, {
      reviewStaffData: { ...(state.reviewStaffData || {}), [fieldId]: value },
    })
  }, [getPartState, updatePartState])

  const handleCancelReview = useCallback((partIndex: number) => {
    updatePartState(partIndex, {
      reviewMode: false,
      reviewStaffData: null,
    })
  }, [updatePartState])

  const handleSignAndApprove = useCallback(async (partIndex: number) => {
    const part = parts[partIndex]
    const state = getPartState(partIndex)
    const submission = state.fullSubmission || part.submission
    if (!submission?.submission_id || !state.reviewStaffData) return

    updatePartState(partIndex, { isApproving: true, error: null })

    try {
      // Merge staff data into existing form_data
      const mergedFormData = { ...submission.form_data, ...state.reviewStaffData }

      // Add signature security metadata for staff signatures
      for (const [key, value] of Object.entries(state.reviewStaffData)) {
        if (typeof value === 'string' && value.startsWith('data:image')) {
          mergedFormData[`_signature_metadata_${key}`] = {
            signed_at: new Date().toISOString(),
            signed_by: currentUser?.email || 'staff',
            signer_role: 'staff',
            platform: navigator.platform || 'unknown',
            is_touch_device: 'ontouchstart' in window,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        }
      }

      // Save the merged form data
      const saveRes = await fetch(`/api/submissions/${submission.submission_id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          form_data: mergedFormData,
          edited_by: currentUser?.name || currentUser?.email || 'office_staff',
        }),
      })

      if (!saveRes.ok) throw new Error('Failed to save staff fields')
      const saveData = await saveRes.json()

      // Update status to 'approved'
      const statusRes = await fetch(`/api/submissions/${submission.submission_id}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status: 'approved',
          reviewed_by: currentUser?.name || currentUser?.email || '',
        }),
      })

      if (!statusRes.ok) {
        const errData = await statusRes.json()
        throw new Error(errData.error || 'Failed to approve submission')
      }

      const updatedSubmission = await statusRes.json()
      const newParts = [...parts]
      newParts[partIndex] = { ...newParts[partIndex], submission: updatedSubmission }
      setParts(newParts)

      updatePartState(partIndex, {
        reviewMode: false,
        reviewStaffData: null,
        isApproving: false,
        fullSubmission: { ...updatedSubmission, form_data: mergedFormData },
        editedFormData: structuredClone(mergedFormData),
        successMessage: 'Approved — staff signatures saved',
      })

      // Refresh history
      fetchPartHistory(partIndex, submission.submission_id)

      setTimeout(() => updatePartState(partIndex, { successMessage: null }), 4000)
    } catch (err: any) {
      updatePartState(partIndex, { error: err.message, isApproving: false })
    }
  }, [parts, getPartState, updatePartState, getAuthHeaders, currentUser, fetchPartHistory])

  // ===== View toggle =====
  const handleToggleView = useCallback((partIndex: number) => {
    const state = getPartState(partIndex)
    updatePartState(partIndex, {
      currentView: state.currentView === 'current' ? 'original' : 'current',
    })
  }, [getPartState, updatePartState])

  // ===== Completion stats =====
  const completedCount = parts.filter(p => p.submission && (p.submission as any).submission_id).length
  const totalCount = parts.length

  // ===== Render =====
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error && parts.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <Link href="/office/submissions" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 mb-4">
            <ArrowLeft className="h-4 w-4" /> Back to Submissions
          </Link>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Back link */}
        <Link href="/office/submissions" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 mb-4">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Submissions
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{applicant.full_name}</h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${completedCount === totalCount ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  {completedCount} of {totalCount} complete
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                {applicant.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{applicant.phone}</span>}
                {applicant.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{applicant.email}</span>}
                {templateName && <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{templateName}</span>}
              </div>
            </div>
          </div>

          {/* Download All PDFs */}
          {completedCount > 0 && (
            <button
              onClick={handleDownloadAllPDFs}
              disabled={isDownloadingAll}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {isDownloadingAll ? 'Downloading...' : `Download All PDFs`}
            </button>
          )}
        </div>

        {/* Parts */}
        <div className="space-y-4">
          {parts.map((part, index) => (
            <CaregiverPartCard
              key={`${part.formId}-${index}`}
              part={part}
              partIndex={index}
              totalParts={totalCount}
              isExpanded={expandedParts.has(index)}
              state={getPartState(index)}
              activeTab={activeTabByPart[index] || 0}
              permissions={permissions}
              currentUserEmail={currentUser?.email}
              currentUserRole={currentUser?.role}
              onToggleExpand={() => toggleExpand(index)}
              onSetActiveTab={(tab) => setActiveTab(index, tab)}
              onEditToggle={() => handleEditToggle(index)}
              onFieldChange={(fieldId, value) => handleFieldChange(index, fieldId, value)}
              onSave={() => handleSave(index)}
              onCancel={() => handleCancel(index)}
              onFinalize={() => handleFinalize(index)}
              onUnfinalize={() => handleUnfinalize(index)}
              onDelete={() => handleDelete(index)}
              onToggleView={() => handleToggleView(index)}
              onTogglePDFDropdown={() => updatePartState(index, { showPDFDropdown: !getPartState(index).showPDFDropdown })}
              onDownloadPDF={(type) => handleDownloadPDF(index, type)}
              onDownloadChangesPDF={() => handleDownloadChangesPDF(index)}
              onDeleteConfirmTextChange={(text) => updatePartState(index, { deleteConfirmText: text })}
              onShowDeleteConfirm={(show) => updatePartState(index, { showDeleteConfirm: show, deleteConfirmText: '' })}
              onEnterReviewMode={() => handleEnterReviewMode(index)}
              onReviewFieldChange={(fieldId, value) => handleReviewFieldChange(index, fieldId, value)}
              onSignAndApprove={() => handleSignAndApprove(index)}
              onCancelReview={() => handleCancelReview(index)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Wrapper with Suspense for useSearchParams
export default function CaregiverUnifiedPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    }>
      <CaregiverUnifiedPage />
    </Suspense>
  )
}
