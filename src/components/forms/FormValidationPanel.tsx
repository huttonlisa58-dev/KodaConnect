'use client';

import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Loader } from 'lucide-react';

interface ValidationResult {
  status: 'success' | 'warning' | 'error';
  category: string;
  message: string;
  field?: string;
  section?: string;
}

interface FormValidationPanelProps {
  formId: string;
  onClose: () => void;
}

export function FormValidationPanel({ formId, onClose }: FormValidationPanelProps) {
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchValidation = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/forms/validate?form_id=${formId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch validation results');
        }

        const data = await response.json();
        setValidationResults(data.results || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setValidationResults([]);
      } finally {
        setLoading(false);
      }
    };

    fetchValidation();
  }, [formId]);

  const successResults = validationResults.filter((r) => r.status === 'success');
  const warningResults = validationResults.filter((r) => r.status === 'warning');
  const errorResults = validationResults.filter((r) => r.status === 'error');

  const getIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle size={20} className="text-green-600" />;
      case 'warning':
        return <AlertTriangle size={20} className="text-amber-600" />;
      case 'error':
        return <AlertCircle size={20} className="text-red-600" />;
      default:
        return null;
    }
  };

  const getBgColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'warning':
        return 'bg-amber-50 border-amber-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getTextColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-900';
      case 'warning':
        return 'text-amber-900';
      case 'error':
        return 'text-red-900';
      default:
        return 'text-gray-900';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Form Validation Results</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader size={20} className="animate-spin text-teal-600" />
              <p className="text-gray-600">Validating form...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-900 font-medium">Error loading validation results</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          ) : validationResults.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-green-900 font-medium">No issues found</p>
                  <p className="text-green-700 text-sm">
                    Your form passed all validation checks
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle size={18} className="text-green-600" />
                    <span className="text-sm font-medium text-green-900">Passed</span>
                  </div>
                  <p className="text-2xl font-bold text-green-900">{successResults.length}</p>
                </div>

                <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={18} className="text-amber-600" />
                    <span className="text-sm font-medium text-amber-900">Warnings</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-900">{warningResults.length}</p>
                </div>

                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle size={18} className="text-red-600" />
                    <span className="text-sm font-medium text-red-900">Errors</span>
                  </div>
                  <p className="text-2xl font-bold text-red-900">{errorResults.length}</p>
                </div>
              </div>

              {/* Error Results */}
              {errorResults.length > 0 && (
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <AlertCircle size={20} className="text-red-600" />
                    Critical Errors ({errorResults.length})
                  </h3>
                  <div className="space-y-2">
                    {errorResults.map((result, idx) => (
                      <div
                        key={idx}
                        className={`border rounded-lg p-4 flex gap-3 ${getBgColor(result.status)}`}
                      >
                        {getIcon(result.status)}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium ${getTextColor(result.status)}`}>
                            {result.category}
                          </p>
                          <p className={`text-sm mt-1 ${getTextColor(result.status)}`}>
                            {result.message}
                          </p>
                          {(result.field || result.section) && (
                            <div className="flex gap-2 mt-2 text-xs">
                              {result.field && (
                                <span className="bg-white/50 px-2 py-1 rounded">
                                  Field: <span className="font-medium">{result.field}</span>
                                </span>
                              )}
                              {result.section && (
                                <span className="bg-white/50 px-2 py-1 rounded">
                                  Section: <span className="font-medium">{result.section}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Warning Results */}
              {warningResults.length > 0 && (
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <AlertTriangle size={20} className="text-amber-600" />
                    Warnings ({warningResults.length})
                  </h3>
                  <div className="space-y-2">
                    {warningResults.map((result, idx) => (
                      <div
                        key={idx}
                        className={`border rounded-lg p-4 flex gap-3 ${getBgColor(result.status)}`}
                      >
                        {getIcon(result.status)}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium ${getTextColor(result.status)}`}>
                            {result.category}
                          </p>
                          <p className={`text-sm mt-1 ${getTextColor(result.status)}`}>
                            {result.message}
                          </p>
                          {(result.field || result.section) && (
                            <div className="flex gap-2 mt-2 text-xs">
                              {result.field && (
                                <span className="bg-white/50 px-2 py-1 rounded">
                                  Field: <span className="font-medium">{result.field}</span>
                                </span>
                              )}
                              {result.section && (
                                <span className="bg-white/50 px-2 py-1 rounded">
                                  Section: <span className="font-medium">{result.section}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Success Results */}
              {successResults.length > 0 && (
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <CheckCircle size={20} className="text-green-600" />
                    Passed Checks ({successResults.length})
                  </h3>
                  <div className="space-y-2">
                    {successResults.map((result, idx) => (
                      <div
                        key={idx}
                        className={`border rounded-lg p-4 flex gap-3 ${getBgColor(result.status)}`}
                      >
                        {getIcon(result.status)}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium ${getTextColor(result.status)}`}>
                            {result.category}
                          </p>
                          <p className={`text-sm mt-1 ${getTextColor(result.status)}`}>
                            {result.message}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium rounded-lg transition"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
