'use client';

import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Loader, Clock } from 'lucide-react';

interface VersionEntry {
  version: number;
  timestamp: string;
  comment: string;
  author?: string;
  changeCount?: number;
}

interface VersionHistoryPanelProps {
  formId: string;
  onRestore: (version: number) => void;
  onClose: () => void;
}

export function VersionHistoryPanel({
  formId,
  onRestore,
  onClose,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  useEffect(() => {
    const fetchVersionHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/forms/version-history?form_id=${formId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch version history');
        }

        const data = await response.json();
        const sortedVersions = (data.versions || []).sort(
          (a: VersionEntry, b: VersionEntry) => b.version - a.version
        );
        setVersions(sortedVersions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setVersions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVersionHistory();
  }, [formId]);

  const handleRestore = async (version: number) => {
    try {
      setRestoringVersion(version);
      onRestore(version);
      // Give a brief moment before closing to show feedback
      setTimeout(() => {
        setRestoringVersion(null);
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore version');
      setRestoringVersion(null);
    }
  };

  const formatDate = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return `Today at ${date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })}`;
      } else if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday at ${date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })}`;
      } else {
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
        });
      }
    } catch (e) {
      return timestamp;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Clock size={24} className="text-teal-600" />
            <h2 className="text-xl font-semibold text-gray-900">Version History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader size={20} className="animate-spin text-teal-600" />
              <p className="text-gray-600">Loading version history...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-900 font-medium">Error loading version history</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Clock size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No version history available for this form</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Timeline */}
              {versions.map((version, index) => {
                const isLatest = index === 0;
                const isRestoringThis = restoringVersion === version.version;

                return (
                  <div key={version.version} className="relative">
                    {/* Timeline Connector */}
                    {index < versions.length - 1 && (
                      <div className="absolute left-6 top-12 w-0.5 h-8 bg-gray-200" />
                    )}

                    {/* Version Card */}
                    <div className="flex gap-4">
                      {/* Timeline Dot */}
                      <div className="flex flex-col items-center pt-1">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                            isLatest
                              ? 'border-teal-600 bg-teal-600'
                              : isRestoringThis
                                ? 'border-amber-600 bg-amber-600'
                                : 'border-gray-300 bg-white'
                          }`}
                        />
                      </div>

                      {/* Version Content */}
                      <div className="flex-1 pb-6">
                        <div
                          className={`border rounded-lg p-4 transition ${
                            isLatest
                              ? 'bg-teal-50 border-teal-200'
                              : isRestoringThis
                                ? 'bg-amber-50 border-amber-200'
                                : 'bg-white border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {/* Version Header */}
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-gray-900">
                                  Version {version.version}
                                </h3>
                                {isLatest && (
                                  <span className="inline-block px-2 py-0.5 bg-teal-600 text-white text-xs font-semibold rounded">
                                    Latest
                                  </span>
                                )}
                                {isRestoringThis && (
                                  <span className="inline-block px-2 py-0.5 bg-amber-600 text-white text-xs font-semibold rounded">
                                    Restoring...
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">
                                {formatDate(version.timestamp)}
                              </p>
                            </div>

                            {!isLatest && (
                              <button
                                onClick={() => handleRestore(version.version)}
                                disabled={restoringVersion !== null}
                                className="flex items-center gap-2 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white font-medium text-sm rounded-lg transition whitespace-nowrap"
                              >
                                {isRestoringThis ? (
                                  <>
                                    <Loader size={16} className="animate-spin" />
                                    Restoring...
                                  </>
                                ) : (
                                  <>
                                    <RotateCcw size={16} />
                                    Restore
                                  </>
                                )}
                              </button>
                            )}
                          </div>

                          {/* Version Comment */}
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <p className="text-sm text-gray-700">
                              {version.comment || 'No comment provided'}
                            </p>
                          </div>

                          {/* Version Metadata */}
                          <div className="mt-3 flex gap-4 text-xs text-gray-600">
                            {version.author && (
                              <div>
                                <span className="font-medium">Author:</span> {version.author}
                              </div>
                            )}
                            {version.changeCount !== undefined && (
                              <div>
                                <span className="font-medium">Changes:</span> {version.changeCount}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
