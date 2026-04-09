'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface ApprovalButtonsProps {
  status: string;
  onApprove: (notes: string) => void;
  onReject: (notes: string) => void;
  isLoading?: boolean;
}

type ConfirmationState = null | 'approve' | 'reject';

export function ApprovalButtons({
  status,
  onApprove,
  onReject,
  isLoading = false,
}: ApprovalButtonsProps) {
  const [confirmationState, setConfirmationState] = useState<ConfirmationState>(null);
  const [notes, setNotes] = useState('');

  // Only show buttons when status is submitted
  if (status !== 'submitted') {
    return null;
  }

  const handleConfirm = () => {
    if (confirmationState === 'approve') {
      onApprove(notes);
    } else if (confirmationState === 'reject') {
      onReject(notes);
    }
    setConfirmationState(null);
    setNotes('');
  };

  const handleCancel = () => {
    setConfirmationState(null);
    setNotes('');
  };

  return (
    <>
      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setConfirmationState('approve')}
          disabled={isLoading}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          Approve
        </button>

        <button
          onClick={() => setConfirmationState('reject')}
          disabled={isLoading}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          Reject
        </button>
      </div>

      {/* Confirmation Modal */}
      {confirmationState && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {confirmationState === 'approve' ? 'Approve Submission' : 'Reject Submission'}
            </h2>

            <p className="text-gray-600 mb-4">
              {confirmationState === 'approve'
                ? 'Are you sure you want to approve this submission?'
                : 'Are you sure you want to reject this submission?'}
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  confirmationState === 'approve'
                    ? 'Add approval notes...'
                    : 'Explain why you are rejecting this submission...'
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={isLoading}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  confirmationState === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {confirmationState === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
