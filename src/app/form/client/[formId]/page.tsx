'use client'

/**
 * Client Phone Lookup Page — /form/client/[formId]
 *
 * Patient-facing page for staff-initiated forms. The client enters their
 * phone number to find their pre-filled submission, then reviews the
 * agreement text, fills in any remaining fields, signs, and submits.
 *
 * Flow:
 *   1. Phone input → Look up submission
 *   2. Form review (read-only for staff-filled fields, editable for client fields)
 *   3. Signatures
 *   4. Submit → Confirmation
 */

import { useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import MobileFormWizard from '@/components/forms/MobileFormWizard'
import { FormDefinition, FormSubmissionData } from '@/lib/form-engine'
import {
  Phone, Loader2, AlertCircle, CheckCircle2, ArrowRight,
  FileText, Shield, Building2
} from 'lucide-react'

type PageState = 'phone' | 'loading' | 'form' | 'submitted' | 'error'

export default function ClientFormPage() {
  const params = useParams()
  const formId = params.formId as string

  const [pageState, setPageState] = useState<PageState>('phone')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Form data
  const [formDefinition, setFormDefinition] = useState<FormDefinition | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [applicantId, setApplicantId] = useState<string | null>(null)
  const [initialData, setInitialData] = useState<FormSubmissionData>({})
  const [clientName, setClientName] = useState('')
  const [formName, setFormName] = useState('')

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value))
    setError(null)
  }

  const handleLookup = async () => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      setError('Please enter a valid 10-digit phone number')
      return
    }

    setIsSearching(true)
    setError(null)

    try {
      const res = await fetch(`/api/forms/client-lookup?phone=${digits}&form_id=${formId}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'No form found for this phone number')
        setIsSearching(false)
        return
      }

      // Load form data
      setFormDefinition(data.formDefinition)
      setSubmissionId(data.submission.submission_id)
      setApplicantId(data.submission.applicant_id)
      setInitialData(data.submission.form_data || {})
      setClientName(data.applicant?.full_name || '')
      setFormName(data.formDefinition?.form_name || 'Service Agreement')

      setPageState('form')
    } catch (err) {
      setError('Unable to connect. Please try again.')
    } finally {
      setIsSearching(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLookup()
  }

  const handleFormSubmit = useCallback(async () => {
    setPageState('submitted')
  }, [])

  // Phone lookup screen
  if (pageState === 'phone') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-md mx-auto flex items-center gap-3">
            <Building2 className="h-6 w-6 text-teal-600" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">Complete Homecare Indiana</h1>
              <p className="text-xs text-gray-500">Client Service Agreement</p>
            </div>
          </div>
        </div>

        {/* Phone input */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-md space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center">
                <FileText className="h-8 w-8 text-teal-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Access Your Form</h2>
              <p className="text-gray-600 text-sm">
                Enter your phone number to find and complete your service agreement.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <Phone className="h-4 w-4 inline mr-1.5 text-teal-600" />
                  Your Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={handlePhoneChange}
                  onKeyDown={handleKeyPress}
                  placeholder="(555) 123-4567"
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus:outline-none"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <button
                onClick={handleLookup}
                disabled={isSearching || phone.replace(/\D/g, '').length < 10}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 text-base font-semibold text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSearching ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Looking up...</>
                ) : (
                  <>Find My Form <ArrowRight className="h-5 w-5" /></>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2 justify-center text-xs text-gray-500">
              <Shield className="h-3.5 w-3.5" />
              <span>Your information is secure and encrypted</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Form view — pass to MobileFormWizard with custom styling
  if (pageState === 'form' && formDefinition) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Sticky gradient header */}
        <div className="sticky top-0 z-50 bg-gradient-to-r from-teal-700 to-teal-600 text-white px-4 py-3 shadow-md">
          <div className="max-w-lg mx-auto text-center">
            <p className="text-xs opacity-80 font-medium">Welcome, {clientName}</p>
            <h1 className="text-base font-bold tracking-tight">{formName}</h1>
          </div>
        </div>

        {/* Custom CSS for form content styling in client view */}
        <style jsx global>{`
          /* Enhanced form-content styling for client view */
          .form-content strong {
            color: #0f172a;
          }
          .form-content ul li {
            padding: 4px 0 4px 4px;
            border-bottom: 1px solid #f1f5f9;
            position: relative;
          }
          .form-content ul li:last-child {
            border-bottom: none;
          }
          .form-content ul {
            list-style: none;
            padding-left: 0.5rem;
          }
          .form-content ul li::before {
            content: "›";
            color: #0d9488;
            font-weight: 700;
            margin-right: 8px;
            font-size: 1.1em;
          }
          /* Subsection dividers (br tags between merged sections) */
          .form-content br {
            display: block;
            content: "";
            margin-top: 0.75rem;
            border-top: 1px solid #e2e8f0;
            padding-top: 0.75rem;
          }
        `}</style>

        <MobileFormWizard
          definition={formDefinition}
          initialData={initialData}
          applicantId={applicantId || undefined}
          submissionId={submissionId || undefined}
          onSubmit={async (data) => {
            try {
              const res = await fetch(`/api/forms/${formId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  submission_data: data,
                  applicant_id: applicantId,
                  status: 'submitted',
                  submission_id: submissionId,
                }),
              })
              if (!res.ok) throw new Error('Submit failed')
              handleFormSubmit()
            } catch (err) {
              console.error('Submit error:', err)
            }
          }}
          onSaveDraft={async (data, step) => {
            try {
              await fetch(`/api/forms/${formId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  submission_data: data,
                  applicant_id: applicantId,
                  status: 'draft',
                  submission_id: submissionId,
                  current_step: step,
                }),
              })
            } catch (err) {
              console.error('Draft save error:', err)
            }
          }}
          showDocumentUpload={false}
          readOnlyFieldIds={getStaffFieldIds(formDefinition)}
          includeContentSections={true}
          brandColors={{ primary: '#0d9488' }}
        />
      </div>
    )
  }

  // Submitted confirmation
  if (pageState === 'submitted') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Form Submitted</h2>
          <p className="text-gray-600">
            Thank you, {clientName}. Your service agreement has been submitted successfully.
            Your agency will contact you if any additional information is needed.
          </p>
          <div className="pt-4">
            <p className="text-xs text-gray-400">You can close this page now.</p>
          </div>
        </div>
      </div>
    )
  }

  // Error fallback
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900">Something went wrong</h2>
        <p className="text-gray-600">{error || 'Please try again later.'}</p>
        <button
          onClick={() => setPageState('phone')}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}

/**
 * Extracts field IDs that have signer_role === "hr_admin" from the form definition.
 * These fields are staff-only and should render as read-only in the client view.
 */
function getStaffFieldIds(formDef: FormDefinition): string[] {
  const staffIds: string[] = []
  if (!formDef?.sections) return staffIds

  for (const section of formDef.sections) {
    if (!section.fields) continue
    for (const field of section.fields) {
      const signerRole = (field as any).signer_role
      if (signerRole === 'hr_admin' || signerRole === 'rn_evaluator') {
        staffIds.push(field.field_id || (field as any).id || '')
      }
    }
  }

  return staffIds.filter(Boolean)
}
