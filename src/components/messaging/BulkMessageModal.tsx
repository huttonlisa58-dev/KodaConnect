'use client';

import { useState } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

interface BulkMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendBulk: (
    recipients: string[],
    body: string,
    templateId?: string
  ) => Promise<void>;
  templates: Array<{ id: string; name: string; body: string }>;
}

export default function BulkMessageModal({
  isOpen,
  onClose,
  onSendBulk,
  templates,
}: BulkMessageModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedArea, setSelectedArea] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);

  const areas = ['Queens', 'Brooklyn', 'Bronx', 'Manhattan', 'Staten Island'];
  const statuses = ['Active', 'Onboarding', 'On Hold', 'Inactive'];

  // Mock recipient count (in real app, query from API)
  const getRecipientCount = () => {
    let count = 50;
    if (selectedArea.length > 0) count = Math.floor(count * 0.8);
    if (selectedStatus.length > 0) count = Math.floor(count * 0.9);
    return Math.max(1, count);
  };

  const handleSendBulk = async () => {
    if (!message.trim()) return;

    setIsLoading(true);
    try {
      // In real app, fetch actual recipients based on filters
      const mockRecipients = Array.from({ length: getRecipientCount() }, (_, i) =>
        `+1555${String(i).padStart(7, '0')}`
      );

      await onSendBulk(mockRecipients, message, selectedTemplateId || undefined);
      resetModal();
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const resetModal = () => {
    setStep(1);
    setSelectedArea([]);
    setSelectedStatus([]);
    setMessage('');
    setSelectedTemplateId(null);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const toggleArea = (area: string) => {
    setSelectedArea(prev =>
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    );
  };

  const toggleStatus = (status: string) => {
    setSelectedStatus(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setMessage(template.body);
      setSelectedTemplateId(templateId);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-semibold text-gray-900">
            Bulk Message
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Step 1: Filter Recipients
                </h3>

                {/* Area filter */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Service Areas
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {areas.map(area => (
                      <label
                        key={area}
                        className="flex items-center gap-2 p-2 rounded-lg border border-gray-300 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedArea.includes(area)}
                          onChange={() => toggleArea(area)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm text-gray-700">{area}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Status filter */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Caregiver Status
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {statuses.map(status => (
                      <label
                        key={status}
                        className="flex items-center gap-2 p-2 rounded-lg border border-gray-300 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedStatus.includes(status)}
                          onChange={() => toggleStatus(status)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm text-gray-700">{status}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Recipient count */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold text-blue-600">
                      {getRecipientCount()}
                    </span>{' '}
                    recipients match your filters
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Step 2: Compose Message
                </h3>

                {/* Template selector */}
                {templates.length > 0 && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Use Template (optional)
                    </label>
                    <select
                      value={selectedTemplateId || ''}
                      onChange={e => {
                        if (e.target.value) {
                          handleTemplateSelect(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Choose a template...</option>
                      {templates.map(template => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Message textarea */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message
                  </label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    maxLength={1600}
                    rows={6}
                    placeholder="Compose your message here. Supports variables like {{name}}, {{credential}}, {{date}}"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                {/* Character count */}
                <div className="text-xs text-gray-500 mb-4">
                  {message.length} / 1600 characters
                  {message.length > 1600 && (
                    <span className="text-red-600 font-medium ml-1">
                      (exceeds limit)
                    </span>
                  )}
                </div>

                {/* Preview */}
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs font-medium text-gray-700 mb-2">
                    Preview (with sample name)
                  </p>
                  <p className="text-sm text-gray-600 bg-white p-3 rounded border border-gray-300">
                    {message.replace(
                      /\{\{name\}\}/g,
                      'John'
                    ) || 'Your message preview will appear here'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Step 3: Confirm & Send
                </h3>

                <div className="space-y-4">
                  {/* Summary */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                    <div>
                      <p className="text-xs font-medium text-gray-700">
                        Recipients
                      </p>
                      <p className="text-lg font-semibold text-gray-900">
                        {getRecipientCount()} caregivers
                      </p>
                    </div>

                    <div className="border-t pt-3">
                      <p className="text-xs font-medium text-gray-700 mb-2">
                        Message Preview
                      </p>
                      <p className="text-sm text-gray-600 bg-white p-3 rounded border border-gray-300 max-h-24 overflow-y-auto">
                        {message}
                      </p>
                    </div>
                  </div>

                  {/* Confirmation */}
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm text-yellow-800">
                      <span className="font-medium">Note:</span> This action
                      will send messages to {getRecipientCount()} recipients at
                      a rate of 1 message per second.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Step {step} of 3
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (step > 1) setStep((step - 1) as 1 | 2 | 3);
              }}
              disabled={step === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            <button
              onClick={() => {
                if (step < 3) setStep((step + 1) as 1 | 2 | 3);
                else handleSendBulk();
              }}
              disabled={
                (step === 2 && !message.trim()) ||
                isLoading ||
                message.length > 1600
              }
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Sending...
                </>
              ) : step === 3 ? (
                'Send to All'
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
