'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle, Clock, Archive } from 'lucide-react'

interface FormStatusBadgeProps {
  status: string
}

interface FormStatusChangerProps {
  formId: string
  currentStatus: string
  onStatusChange: (newStatus: string) => void
}

const STATUS_CONFIG = {
  draft: {
    label: 'Draft',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-300',
    icon: AlertCircle,
  },
  review: {
    label: 'Ready for Review',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
    borderColor: 'border-yellow-300',
    icon: Clock,
  },
  active: {
    label: 'Active',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    borderColor: 'border-green-300',
    icon: CheckCircle,
  },
  archived: {
    label: 'Archived',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-500',
    borderColor: 'border-gray-300',
    icon: Archive,
  },
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['review', 'archived'],
  review: ['draft', 'active', 'archived'],
  active: ['review', 'archived'],
  archived: ['draft', 'review'],
}

/**
 * FormStatusBadge - Display a colored status badge
 */
export function FormStatusBadge({ status }: FormStatusBadgeProps) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.draft
  const Icon = config.icon

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${config.bgColor} ${config.textColor} ${config.borderColor}`}>
      <Icon size={14} />
      <span className="text-sm font-medium">{config.label}</span>
    </div>
  )
}

/**
 * FormStatusChanger - Status badge with dropdown to change status
 */
export function FormStatusChanger({
  formId,
  currentStatus,
  onStatusChange,
}: FormStatusChangerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)

  const config = STATUS_CONFIG[currentStatus as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.draft
  const Icon = config.icon
  const validNextStatuses = STATUS_TRANSITIONS[currentStatus] || []

  const handleStatusChange = async (newStatus: string) => {
    // Confirm before archiving
    if (newStatus === 'archived') {
      setPendingStatus(newStatus)
      setShowConfirm(true)
      return
    }

    await executeStatusChange(newStatus)
  }

  const executeStatusChange = async (newStatus: string) => {
    setLoading(true)
    setIsOpen(false)
    setShowConfirm(false)
    setPendingStatus(null)

    try {
      const response = await fetch('/api/forms/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId,
          newStatus,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update status')
      }

      onStatusChange(newStatus)
    } catch (err) {
      console.error('Failed to change form status:', err)
      alert('Failed to update form status')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      {/* Current Status Badge Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border transition-all ${
          config.bgColor
        } ${config.textColor} ${config.borderColor} hover:shadow-sm ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <Icon size={14} />
        <span className="text-sm font-medium">{config.label}</span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && !loading && (
        <div className="absolute top-full mt-2 left-0 bg-white rounded-xl border border-gray-200 shadow-lg z-50 min-w-48 p-2">
          <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Change Status To
          </p>

          {validNextStatuses.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No status transitions available</p>
          ) : (
            validNextStatuses.map((nextStatus) => {
              const nextConfig =
                STATUS_CONFIG[nextStatus as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.draft
              const NextIcon = nextConfig.icon

              return (
                <button
                  key={nextStatus}
                  onClick={() => handleStatusChange(nextStatus)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    nextStatus === 'archived'
                      ? 'hover:bg-red-50 text-red-700'
                      : `hover:${nextConfig.bgColor}`
                  }`}
                >
                  <NextIcon size={16} />
                  {nextConfig.label}
                </button>
              )
            })
          )}

          <button
            onClick={() => setIsOpen(false)}
            className="w-full text-center px-3 py-2 text-xs text-gray-500 hover:text-gray-700 font-medium rounded-lg hover:bg-gray-50 mt-1 border-t border-gray-200"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Confirmation Modal for Archive */}
      {showConfirm && pendingStatus === 'archived' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Archive Form?</h3>
              <p className="text-sm text-gray-600">
                Archived forms will no longer appear in the active list and cannot be assigned to new packets. This action can be undone.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirm(false)
                  setPendingStatus(null)
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => executeStatusChange('archived')}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
