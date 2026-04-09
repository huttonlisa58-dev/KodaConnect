'use client'

import { useState } from 'react'
import { Copy, Mail, Phone, Link as LinkIcon, X, Eye, AlertCircle, CheckCircle } from 'lucide-react'

interface SendTestPanelProps {
  formId: string
  formName: string
  onClose: () => void
}

type TabType = 'copy' | 'email' | 'sms'

export function SendTestPanel({ formId, formName, onClose }: SendTestPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('copy')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedToClipboard, setCopiedToClipboard] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const testUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/forms/preview/${formId}?test=true`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(testUrl)
      setCopiedToClipboard(true)
      setTimeout(() => setCopiedToClipboard(false), 2000)
    } catch (err) {
      setErrorMessage('Failed to copy link')
    }
  }

  const handlePreviewAsCaregiver = () => {
    window.open(testUrl, '_blank')
  }

  const handleSendEmail = async () => {
    if (!email) {
      setErrorMessage('Please enter an email address')
      return
    }

    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const response = await fetch('/api/forms/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId,
          method: 'email',
          recipient: email,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send email')
      }

      setSuccessMessage(`Test link sent to ${email}`)
      setEmail('')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setLoading(false)
    }
  }

  const handleSendSMS = async () => {
    if (!phone) {
      setErrorMessage('Please enter a phone number')
      return
    }

    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const response = await fetch('/api/forms/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId,
          method: 'sms',
          recipient: phone,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send SMS')
      }

      setSuccessMessage(`Test link sent to ${phone}`)
      setPhone('')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send SMS')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Send Test</h2>
            <p className="text-sm text-gray-600">{formName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close panel"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('copy')}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'copy'
                ? 'bg-white text-teal-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <LinkIcon size={16} className="inline mr-1" />
            Copy Link
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'email'
                ? 'bg-white text-teal-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Mail size={16} className="inline mr-1" />
            Email
          </button>
          <button
            onClick={() => setActiveTab('sms')}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'sms'
                ? 'bg-white text-teal-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Phone size={16} className="inline mr-1" />
            SMS
          </button>
        </div>

        {/* Content */}
        <div className="mb-6">
          {activeTab === 'copy' && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Test URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testUrl}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-600 font-mono"
                />
                <button
                  onClick={handleCopyLink}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    copiedToClipboard
                      ? 'bg-green-100 text-green-700'
                      : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  {copiedToClipboard ? (
                    <>
                      <CheckCircle size={16} className="inline mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={16} className="inline mr-1" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'email' && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="caregiver@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                onClick={handleSendEmail}
                disabled={loading || !email}
                className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send Test Link'}
              </button>
            </div>
          )}

          {activeTab === 'sms' && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                onClick={handleSendSMS}
                disabled={loading || !phone}
                className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send Test Link'}
              </button>
            </div>
          )}
        </div>

        {/* Messages */}
        {successMessage && (
          <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
            <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-700">{successMessage}</p>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>
        )}

        {/* Preview Button */}
        <button
          onClick={handlePreviewAsCaregiver}
          className="w-full px-6 py-3 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg font-semibold hover:from-teal-600 hover:to-teal-700 transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <Eye size={18} />
          Preview as Caregiver
        </button>
      </div>
    </div>
  )
}
