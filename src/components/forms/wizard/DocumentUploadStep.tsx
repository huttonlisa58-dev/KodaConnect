'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Camera,
  FileText,
  X,
  Check,
  Loader2,
  AlertCircle,
  ImageIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  DOCUMENT_TYPES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  DocumentTypeConfig,
} from '@/lib/document-types';

// ─── Types ──────────────────────────────────────────────────────

interface UploadedDoc {
  id: string;
  doc_type: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  signed_url: string | null;
  status: string;
  created_at: string;
}

interface DocumentUploadStepProps {
  submissionId: string | null;
  applicantId: string | null;
  brandColor?: string;
  /** Per-form document types override. Falls back to hardcoded DOCUMENT_TYPES if not provided. */
  documentTypes?: DocumentTypeConfig[];
}

// ─── Helpers ────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

// ─── Single Document Type Row ───────────────────────────────────

function DocumentTypeRow({
  config,
  uploads,
  onUpload,
  onDelete,
  uploading,
  brandColor,
}: {
  config: DocumentTypeConfig;
  uploads: UploadedDoc[];
  onUpload: (docType: string, file: File) => void;
  onDelete: (documentId: string) => void;
  uploading: boolean;
  brandColor: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const hasUploads = uploads.length > 0;
  const canUploadMore = uploads.length < config.maxFiles;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(config.doc_type, file);
      // Reset the input so the same file can be re-selected
      e.target.value = '';
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900 text-sm">{config.label}</h4>
            {config.note && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                {config.note}
              </span>
            )}
            {config.maxFiles > 1 && (
              <span className="text-xs text-gray-400">
                (up to {config.maxFiles})
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{config.description}</p>
        </div>

        {/* Status indicator */}
        {hasUploads && (
          <div className="flex items-center gap-1 shrink-0">
            <Check className="w-4 h-4 text-green-500" />
            <span className="text-xs font-medium text-green-600">
              {uploads.length}/{config.maxFiles}
            </span>
          </div>
        )}
      </div>

      {/* Uploaded files */}
      {uploads.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploads.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100"
            >
              {/* Thumbnail / icon */}
              {doc.signed_url && isImageType(doc.mime_type) ? (
                <img
                  src={doc.signed_url}
                  alt={doc.original_filename}
                  className="w-10 h-10 rounded object-cover border border-gray-200"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-gray-500" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">
                  {doc.original_filename}
                </p>
                <p className="text-xs text-gray-400">
                  {formatFileSize(doc.file_size)}
                </p>
              </div>

              {/* Delete button */}
              <button
                onClick={() => onDelete(doc.id)}
                className="p-1.5 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                title="Remove"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload buttons */}
      {canUploadMore && (
        <div className="mt-3 flex gap-2">
          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept={config.accept}
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Camera button (primarily for mobile) */}
          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Take Photo</span>
            <span className="sm:hidden">Photo</span>
          </button>

          {/* File picker button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 border-2 border-dashed rounded-lg text-sm font-medium hover:bg-opacity-5 disabled:opacity-50 transition-colors"
            style={{
              borderColor: brandColor,
              color: brandColor,
            }}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Upload File</span>
            <span className="sm:hidden">Upload</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function DocumentUploadStep({
  submissionId,
  applicantId,
  brandColor = '#0f766e',
  documentTypes,
}: DocumentUploadStepProps) {
  // Use per-form document types if provided, otherwise fall back to hardcoded defaults
  const activeDocTypes = documentTypes && documentTypes.length > 0 ? documentTypes : DOCUMENT_TYPES;
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Load existing documents on mount
  useEffect(() => {
    if (submissionId) {
      loadDocuments();
    } else {
      setLoading(false);
    }
  }, [submissionId]);

  async function loadDocuments() {
    if (!submissionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${submissionId}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.warn('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(docType: string, file: File) {
    if (!submissionId || !applicantId) {
      setError('Please save your form as a draft first before uploading documents.');
      return;
    }

    setUploadingType(docType);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('doc_type', docType);
      formData.append('applicant_id', applicantId);

      const res = await fetch(`/api/documents/${submissionId}`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Upload failed');
      }

      const data = await res.json();
      setDocuments((prev) => [...prev, data.document]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setUploadingType(null);
    }
  }

  async function handleDelete(documentId: string) {
    if (!submissionId) return;

    try {
      const res = await fetch(`/api/documents/${submissionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId }),
      });

      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== documentId));
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Failed to delete document');
      }
    } catch (err) {
      setError('Failed to delete document');
    }
  }

  function toggleCategory(category: string) {
    setCollapsedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }

  // Count uploaded documents
  const totalUploaded = documents.length;
  const totalTypes = activeDocTypes.length;

  // Group documents by doc_type
  const docsByType: Record<string, UploadedDoc[]> = {};
  for (const doc of documents) {
    if (!docsByType[doc.doc_type]) docsByType[doc.doc_type] = [];
    docsByType[doc.doc_type].push(doc);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${brandColor}10` }}
          >
            <Upload className="w-5 h-5" style={{ color: brandColor }} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Document Uploads</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Upload any documents you have ready — you can always come back to add more later.
              All documents are optional.
            </p>
          </div>
        </div>

        {/* Upload progress summary */}
        {totalUploaded > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min((totalUploaded / totalTypes) * 100, 100)}%`,
                  backgroundColor: brandColor,
                }}
              />
            </div>
            <span className="text-xs font-medium text-gray-500 shrink-0">
              {totalUploaded} uploaded
            </span>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto p-0.5 hover:bg-red-100 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* No submission ID warning */}
      {!submissionId && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 p-4 rounded-xl text-sm">
          <p className="font-medium">Save your form first</p>
          <p className="mt-1 text-amber-600">
            Navigate back and forth once to auto-save your form as a draft,
            then return here to upload documents.
          </p>
        </div>
      )}

      {/* Document categories */}
      {CATEGORY_ORDER.map((category) => {
        const categoryDocs = activeDocTypes.filter((d) => d.category === category);
        if (categoryDocs.length === 0) return null;

        const isCollapsed = collapsedCategories[category];
        const categoryUploadCount = categoryDocs.reduce(
          (count, d) => count + (docsByType[d.doc_type]?.length || 0),
          0
        );

        return (
          <div key={category}>
            {/* Category header */}
            <button
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center justify-between px-1 py-2 mb-2"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-700">
                  {CATEGORY_LABELS[category]}
                </h3>
                {categoryUploadCount > 0 && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: `${brandColor}15`,
                      color: brandColor,
                    }}
                  >
                    {categoryUploadCount} uploaded
                  </span>
                )}
              </div>
              {isCollapsed ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {/* Category documents */}
            {!isCollapsed && (
              <div className="space-y-3">
                {categoryDocs.map((config) => (
                  <DocumentTypeRow
                    key={config.doc_type}
                    config={config}
                    uploads={docsByType[config.doc_type] || []}
                    onUpload={handleUpload}
                    onDelete={handleDelete}
                    uploading={uploadingType === config.doc_type}
                    brandColor={brandColor}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
