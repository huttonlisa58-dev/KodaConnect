'use client'

import { useState } from 'react'
import { X, Loader2, UserPlus, Phone, User, MapPin, Calendar, Copy, Check, ExternalLink } from 'lucide-react'

interface CreateForClientModalProps {
  formId: string
  formName: string
  onClose: () => void
  onCreated: (submissionId: string, clientPhone: string) => void
  staffUser: { id: string; email: string } | null
}

/**
 * Modal for office staff to create a new submission for a client.
 * Staff pre-fills client info, and the system creates a draft submission
 * that the client can access via phone lookup.
 */
export default function CreateForClientModal({
  formId,
  formName,
  onClose,
  onCreated,
  staffUser,
}: CreateForClientModalProps) {
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientDob, setClientDob] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [representativeName, setRepresentativeName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ submissionId: string; phone: string; linkCopied: boolean } | null>(null)

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setClientPhone(formatPhone(e.target.value))
  }

  const handleSubmit = async () => {
    if (!clientName.trim() || !clientPhone.trim()) {
      setError('Client name and phone number are required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Build prefill data matching the JSON package field IDs
      const prefillData: Record<string, any> = {
        agreement_header__client_name: clientName.trim(),
        agreement_header__client_phone: clientPhone.trim(),
        service_plan_header__client_name: clientName.trim(),
      }
      if (clientDob) prefillData.agreement_header__client_dob = clientDob
      if (clientAddress) prefillData.agreement_header__client_address = clientAddress.trim()
      if (representativeName) prefillData.agreement_header__representative_name = representativeName.trim()

      const res = await fetch(`/api/forms/${formId}/create-for-client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: staffUser?.id || '',
          staff_user_email: staffUser?.email || '',
          client_name: clientName.trim(),
          client_phone: clientPhone.trim(),
          prefill_data: prefillData,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create submission')
        return
      }

      setSuccess({
        submissionId: data.submission_id,
        phone: data.client_phone,
        linkCopied: false,
      })
      onCreated(data.submission_id, data.client_phone)
    } catch (err) {
      setError('Network error — please try again')
    } finally {
      setIsSubmitting(false)
    }
  }

  const clientLink = typeof window !== 'undefined'
    ? `${window.location.origin}/form/client/${formId}`
    : `/form/client/${formId}`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(clientLink)
      setSuccess((s) => s ? { ...s, linkCopied: true } : null)
      setTimeout(() => {
        setSuccess((s) => s ? { ...s, linkCopied: false } : null)
      }, 2000)
    } catch {
      // Fallback
      const el = document.createElement('textarea')
      el.value = clientLink
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setSuccess((s) => s ? { ...s, linkCopied: true } : null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">Create for Client</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-200 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {success ? (
            // Success state — show link to share
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm font-medium text-green-800">
                  Form created successfully for {clientName}
                </p>
                <p className="text-xs text-green-700 mt-1">
                  The client can access the form using their phone number.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Client form link</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={clientLink}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {success.linkCopied ? (
                      <><Check className="h-4 w-4 text-green-600" /> Copied</>
                    ) : (
                      <><Copy className="h-4 w-4" /> Copy</>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Share this link with the client. They will enter their phone number ({formatPhone(success.phone)}) to access the form.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={onClose}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            // Form state
            <>
              <p className="text-sm text-gray-600">
                Pre-fill client information for <strong>{formName}</strong>. The client will
                receive a link to review and sign the form using their phone number.
              </p>

              {/* Client Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <User className="h-3.5 w-3.5 inline mr-1" />
                  Client Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="John Smith"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus:outline-none"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Phone className="h-3.5 w-3.5 inline mr-1" />
                  Client Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={handlePhoneChange}
                  placeholder="(555) 123-4567"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">The client will use this number to look up their form</p>
              </div>

              {/* DOB */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="h-3.5 w-3.5 inline mr-1" />
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={clientDob}
                  onChange={(e) => setClientDob(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus:outline-none"
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <MapPin className="h-3.5 w-3.5 inline mr-1" />
                  Client Address
                </label>
                <input
                  type="text"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="123 Main St, Indianapolis, IN 46201"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus:outline-none"
                />
              </div>

              {/* Representative Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Authorized Representative (optional)
                </label>
                <input
                  type="text"
                  value={representativeName}
                  onChange={(e) => setRepresentativeName(e.target.value)}
                  placeholder="If someone acts on behalf of the client"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus:outline-none"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !clientName.trim() || !clientPhone.trim()}
                  className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                  ) : (
                    <><UserPlus className="h-4 w-4" /> Create for Client</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
