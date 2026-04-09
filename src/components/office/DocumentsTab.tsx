'use client';

import { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Loader2,
  Check,
  X,
  AlertCircle,
  ImageIcon,
  ExternalLink,
} from 'lucide-react';
import {
  DOCUMENT_TYPES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from '@/lib/document-types';

interface UploadedDoc {
  id: string;
  doc_type: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  signed_url: string | null;
  status: string;
  review_notes: string | null;
  created_at: string;
}

interface DocumentsTabProps {
  submissionId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function DocumentsTab({ submissionId }: DocumentsTabProps) {
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDocuments();
  }, [submissionId]);

  async function loadDocuments() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${submissionId}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      } else {
        setError('Failed to load documents');
      }
    } catch (err) {
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  // Group uploaded docs by type
  const docsByType: Record<string, UploadedDoc[]> = {};
  for (const doc of documents) {
    if (!docsByType[doc.doc_type]) docsByType[doc.doc_type] = [];
    docsByType[doc.doc_type].push(doc);
  }

  const totalUploaded = new Set(documents.map((d) => d.doc_type)).size;
  const totalTypes = DOCUMENT_TYPES.length;

  return (
    <div className="p-5 space-y-6">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Uploaded Documents</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalUploaded} of {totalTypes} document types uploaded
            ({documents.length} file{documents.length !== 1 ? 's' : ''} total)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${(totalUploaded / totalTypes) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-500">
            {Math.round((totalUploaded / totalTypes) * 100)}%
          </span>
        </div>
      </div>

      {/* Categories */}
      {CATEGORY_ORDER.map((category) => {
        const categoryDocTypes = DOCUMENT_TYPES.filter((d) => d.category === category);
        if (categoryDocTypes.length === 0) return null;

        return (
          <div key={category}>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {CATEGORY_LABELS[category]}
            </h4>

            <div className="space-y-2">
              {categoryDocTypes.map((config) => {
                const uploads = docsByType[config.doc_type] || [];
                const hasUploads = uploads.length > 0;

                return (
                  <div
                    key={config.doc_type}
                    className={`rounded-lg border p-3 ${
                      hasUploads
                        ? 'border-green-200 bg-green-50/50'
                        : 'border-gray-200 bg-gray-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {hasUploads ? (
                          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        )}
                        <span
                          className={`text-sm font-medium ${
                            hasUploads ? 'text-gray-900' : 'text-gray-500'
                          }`}
                        >
                          {config.label}
                        </span>
                        {config.note && (
                          <span className="text-xs text-gray-400">({config.note})</span>
                        )}
                      </div>
                      {hasUploads && (
                        <span className="text-xs text-green-600 font-medium">
                          {uploads.length} file{uploads.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* File list */}
                    {uploads.length > 0 && (
                      <div className="mt-2 space-y-1.5 pl-6">
                        {uploads.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center gap-3 p-2 rounded bg-white border border-gray-100"
                          >
                            {/* Thumbnail */}
                            {doc.signed_url && doc.mime_type.startsWith('image/') ? (
                              <img
                                src={doc.signed_url}
                                alt={doc.original_filename}
                                className="w-10 h-10 rounded object-cover border border-gray-200 cursor-pointer hover:opacity-80"
                                onClick={() => doc.signed_url && window.open(doc.signed_url, '_blank')}
                              />
                            ) : (
                              <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
                                <FileText className="w-5 h-5 text-gray-400" />
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-700 truncate">
                                {doc.original_filename}
                              </p>
                              <p className="text-xs text-gray-400">
                                {formatFileSize(doc.file_size)} &middot; {formatDate(doc.created_at)}
                              </p>
                            </div>

                            {/* View / Download */}
                            {doc.signed_url && (
                              <a
                                href={doc.signed_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600 transition-colors"
                                title="Open in new tab"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {documents.length === 0 && (
        <div className="text-center py-8">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No documents have been uploaded yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            The applicant can upload documents from their form wizard.
          </p>
        </div>
      )}
    </div>
  );
}
