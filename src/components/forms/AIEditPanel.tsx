'use client';

import React, { useState } from 'react';
import { Wand2, Check, X, ChevronDown, ChevronUp, Loader } from 'lucide-react';

interface Change {
  id: string;
  type: 'rename' | 'add' | 'remove' | 'reorder' | 'modify' | 'other';
  description: string;
  details?: Record<string, any>;
  approved?: boolean;
}

interface AIEditPanelProps {
  formId: string;
  onFormUpdated: () => void;
}

const getChangeBadgeColor = (type: string): string => {
  const colors: Record<string, string> = {
    rename: 'bg-blue-100 text-blue-800',
    add: 'bg-green-100 text-green-800',
    remove: 'bg-red-100 text-red-800',
    reorder: 'bg-purple-100 text-purple-800',
    modify: 'bg-amber-100 text-amber-800',
    other: 'bg-gray-100 text-gray-800',
  };
  return colors[type] || 'bg-gray-100 text-gray-800';
};

export function AIEditPanel({ formId, onFormUpdated }: AIEditPanelProps) {
  const [editRequest, setEditRequest] = useState('');
  const [suggestedChanges, setSuggestedChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedChanges, setExpandedChanges] = useState<Set<string>>(new Set());
  const [changeApprovals, setChangeApprovals] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSuggestChanges = async () => {
    if (!editRequest.trim()) {
      setError('Please enter an edit request');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuggestedChanges([]);

      const response = await fetch('/api/forms/ai-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_id: formId,
          request: editRequest,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate suggestions');
      }

      const data = await response.json();
      const changes = (data.changes || []).map((change: any, idx: number) => ({
        id: `change-${idx}`,
        type: change.type || 'other',
        description: change.description || '',
        details: change.details || {},
      }));

      setSuggestedChanges(changes);
      setChangeApprovals(
        changes.reduce(
          (acc: Record<string, boolean>, change: Change) => {
            acc[change.id] = true;
            return acc;
          },
          {}
        )
      );
      setShowSuggestions(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSuggestedChanges([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleExpand = (changeId: string) => {
    const newExpanded = new Set(expandedChanges);
    if (newExpanded.has(changeId)) {
      newExpanded.delete(changeId);
    } else {
      newExpanded.add(changeId);
    }
    setExpandedChanges(newExpanded);
  };

  const handleApprovalChange = (changeId: string, approved: boolean) => {
    setChangeApprovals((prev) => ({
      ...prev,
      [changeId]: approved,
    }));
  };

  const handleApplyAll = async () => {
    const approvedChanges = suggestedChanges.filter((c) => changeApprovals[c.id]);

    if (approvedChanges.length === 0) {
      setError('No changes selected to apply');
      return;
    }

    try {
      setApplying(true);
      setError(null);

      const response = await fetch('/api/forms/ai-edit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_id: formId,
          changes: approvedChanges,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to apply changes');
      }

      // Reset form and notify parent
      setEditRequest('');
      setSuggestedChanges([]);
      setShowSuggestions(false);
      setChangeApprovals({});
      setError(null);
      onFormUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply changes');
    } finally {
      setApplying(false);
    }
  };

  const handleRejectAll = () => {
    setSuggestedChanges([]);
    setShowSuggestions(false);
    setChangeApprovals({});
  };

  const approvedCount = Object.values(changeApprovals).filter((v) => v).length;

  return (
    <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
      {/* Edit Request Input */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-3">
          Describe Your Edit
        </label>
        <div className="space-y-3">
          <textarea
            value={editRequest}
            onChange={(e) => setEditRequest(e.target.value)}
            placeholder="e.g., 'Add a section about emergency contacts' or 'Rename the health history section'"
            className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none min-h-24 font-sans text-sm"
            disabled={loading || applying}
          />

          <button
            onClick={handleSuggestChanges}
            disabled={loading || applying || !editRequest.trim()}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition"
          >
            {loading ? (
              <>
                <Loader size={18} className="animate-spin" />
                Generating suggestions...
              </>
            ) : (
              <>
                <Wand2 size={18} />
                Suggest Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-900 font-medium text-sm">{error}</p>
        </div>
      )}

      {/* Suggested Changes */}
      {showSuggestions && suggestedChanges.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div>
              <p className="text-blue-900 font-medium">
                {approvedCount} of {suggestedChanges.length} changes selected
              </p>
              <p className="text-blue-700 text-sm">
                Review changes and select which to apply
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {suggestedChanges.map((change) => {
              const isExpanded = expandedChanges.has(change.id);
              const isApproved = changeApprovals[change.id] ?? true;

              return (
                <div key={change.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Change Header */}
                  <div className="flex items-center gap-3 p-4 bg-gray-50 hover:bg-gray-100 transition cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isApproved}
                      onChange={(e) => handleApprovalChange(change.id, e.target.checked)}
                      className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                      onClick={(e) => e.stopPropagation()}
                    />

                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${getChangeBadgeColor(
                        change.type
                      )}`}
                    >
                      {change.type.charAt(0).toUpperCase() + change.type.slice(1)}
                    </span>

                    <p className="flex-1 font-medium text-gray-900 text-sm">
                      {change.description}
                    </p>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        handleToggleExpand(change.id);
                      }}
                      className="p-1 hover:bg-gray-200 rounded transition"
                    >
                      {isExpanded ? (
                        <ChevronUp size={18} className="text-gray-600" />
                      ) : (
                        <ChevronDown size={18} className="text-gray-600" />
                      )}
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && Object.keys(change.details || {}).length > 0 && (
                    <div className="px-4 py-3 bg-white border-t border-gray-200 text-xs text-gray-700 space-y-1">
                      {Object.entries(change.details).map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <span className="font-medium text-gray-900 min-w-fit">
                            {key}:
                          </span>
                          <span className="text-gray-600 break-words">
                            {typeof value === 'object'
                              ? JSON.stringify(value, null, 2)
                              : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleApplyAll}
              disabled={applying || approvedCount === 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition"
            >
              {applying ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Check size={18} />
                  Apply {approvedCount > 0 ? `(${approvedCount})` : ''}
                </>
              )}
            </button>

            <button
              onClick={handleRejectAll}
              disabled={applying}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-900 font-medium rounded-lg transition"
            >
              <X size={18} />
              Reject All
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!showSuggestions && suggestedChanges.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">
          <Wand2 size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            Enter an edit request above and click "Suggest Changes" to see AI-powered suggestions
          </p>
        </div>
      )}
    </div>
  );
}
