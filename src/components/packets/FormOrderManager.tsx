'use client'

import { useState } from 'react'
import { GripVertical, ChevronUp, ChevronDown, Save } from 'lucide-react'

interface Form {
  form_id: string
  form_name: string
  section_count: number
  field_count: number
}

interface FormOrderManagerProps {
  packetId: string
  forms: Form[]
  onReorder: (newOrder: string[]) => void
}

export function FormOrderManager({ packetId, forms, onReorder }: FormOrderManagerProps) {
  const [reorderedForms, setReorderedForms] = useState<Form[]>(forms)
  const [isDirty, setIsDirty] = useState(false)
  const [lastMovedIndex, setLastMovedIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const moveFormUp = (index: number) => {
    if (index === 0) return

    const newForms = [...reorderedForms]
    ;[newForms[index - 1], newForms[index]] = [newForms[index], newForms[index - 1]]
    setReorderedForms(newForms)
    setIsDirty(true)
    setLastMovedIndex(index - 1)
  }

  const moveFormDown = (index: number) => {
    if (index === reorderedForms.length - 1) return

    const newForms = [...reorderedForms]
    ;[newForms[index], newForms[index + 1]] = [newForms[index + 1], newForms[index]]
    setReorderedForms(newForms)
    setIsDirty(true)
    setLastMovedIndex(index + 1)
  }

  const handleSaveOrder = async () => {
    setLoading(true)
    try {
      const newOrder = reorderedForms.map((f) => f.form_id)
      await onReorder(newOrder)
      setIsDirty(false)
      setLastMovedIndex(null)
    } catch (err) {
      console.error('Failed to save form order:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Form Order</h3>
          <p className="text-sm text-gray-600">Arrange forms in the order caregivers will complete them</p>
        </div>
      </div>

      {/* Forms List */}
      <div className="space-y-2 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        {reorderedForms.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">No forms in this packet</p>
          </div>
        ) : (
          reorderedForms.map((form, index) => (
            <div
              key={form.form_id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                lastMovedIndex === index
                  ? 'bg-teal-50 border-teal-200'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {/* Grip Handle */}
              <div className="flex-shrink-0 text-gray-400 cursor-grab active:cursor-grabbing">
                <GripVertical size={18} />
              </div>

              {/* Form Info */}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 truncate">{form.form_name}</h4>
                <p className="text-xs text-gray-500">
                  {form.section_count} section{form.section_count !== 1 ? 's' : ''} •{' '}
                  {form.field_count} field{form.field_count !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Position Indicator */}
              <div className="flex-shrink-0 text-gray-400 text-sm font-medium w-8 text-center">
                {index + 1}
              </div>

              {/* Up/Down Buttons */}
              <div className="flex-shrink-0 flex gap-1">
                <button
                  onClick={() => moveFormUp(index)}
                  disabled={index === 0}
                  className="p-2 rounded-lg text-gray-600 hover:bg-teal-100 hover:text-teal-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  aria-label="Move form up"
                  title="Move up"
                >
                  <ChevronUp size={18} />
                </button>
                <button
                  onClick={() => moveFormDown(index)}
                  disabled={index === reorderedForms.length - 1}
                  className="p-2 rounded-lg text-gray-600 hover:bg-teal-100 hover:text-teal-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  aria-label="Move form down"
                  title="Move down"
                >
                  <ChevronDown size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Save Button */}
      {isDirty && (
        <div className="flex items-center justify-between p-3 bg-teal-50 border border-teal-200 rounded-lg">
          <p className="text-sm font-medium text-teal-900">Changes pending</p>
          <button
            onClick={handleSaveOrder}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {loading ? 'Saving...' : 'Save Order'}
          </button>
        </div>
      )}

      {/* Info Text */}
      <p className="text-xs text-gray-500">
        Use the up and down arrows to reorder forms, or drag the grip handle (coming soon). Click Save Order to apply changes.
      </p>
    </div>
  )
}
