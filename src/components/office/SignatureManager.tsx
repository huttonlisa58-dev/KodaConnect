'use client';

import { useState, useEffect } from 'react';
import {
  Upload,
  X,
  Trash2,
  Loader2,
  AlertCircle,
  Plus,
  Image as ImageIcon,
} from 'lucide-react';

interface TargetSubForm {
  sub_form_id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StaticSignature {
  id: string;
  label: string;
  image_base64: string;
  target_sub_forms: TargetSubForm[];
  uploaded_by: string;
  created_at: string;
}

interface SubFormOption {
  sub_form_id: string;
  name: string;
}

interface SignatureManagerProps {
  packageId: string;
  subForms: SubFormOption[];
}

export default function SignatureManager({
  packageId,
  subForms,
}: SignatureManagerProps) {
  const [signatures, setSignatures] = useState<StaticSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    label: '',
    file: null as File | null,
    preview: null as string | null,
  });
  const [selectedSubForms, setSelectedSubForms] = useState<string[]>([]);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  // Load signatures on mount
  useEffect(() => {
    loadSignatures();
  }, [packageId]);

  async function loadSignatures() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/packages/${packageId}/signatures`);
      if (res.ok) {
        const data = await res.json();
        setSignatures(data.signatures || []);
      } else {
        setError('Failed to load signatures');
      }
    } catch (err) {
      setError('Failed to load signatures');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setError('File must be PNG or JPEG');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('File must be smaller than 2MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const preview = event.target?.result as string;
      setFormData({
        ...formData,
        file,
        preview,
      });
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!formData.label.trim()) {
      setError('Label is required');
      return;
    }

    if (!formData.file) {
      setError('File is required');
      return;
    }

    if (selectedSubForms.length === 0) {
      setError('Select at least one sub-form');
      return;
    }

    setUploading(true);
    try {
      // Build target_sub_forms array with default positioning
      const targetSubForms = selectedSubForms.map((subFormId) => ({
        sub_form_id: subFormId,
        page: 1,
        x: 50,
        y: 50,
        width: 100,
        height: 50,
      }));

      const fd = new FormData();
      fd.append('file', formData.file);
      fd.append('label', formData.label.trim());
      fd.append('target_sub_forms', JSON.stringify(targetSubForms));

      const res = await fetch(`/api/packages/${packageId}/signatures`, {
        method: 'POST',
        body: fd,
      });

      if (res.ok) {
        const data = await res.json();
        setSignatures([...signatures, data.signature]);
        setFormData({ label: '', file: null, preview: null });
        setSelectedSubForms([]);
        setShowAddForm(false);
      } else {
        const errorData = await res.json();
        setError(errorData.error || 'Failed to upload signature');
      }
    } catch (err) {
      setError('Failed to upload signature');
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(signatureId: string) {
    if (!window.confirm('Are you sure you want to delete this signature?')) {
      return;
    }

    setDeleteLoading(signatureId);
    try {
      const res = await fetch(`/api/packages/${packageId}/signatures`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature_id: signatureId }),
      });

      if (res.ok) {
        setSignatures(signatures.filter((sig) => sig.id !== signatureId));
      } else {
        setError('Failed to delete signature');
      }
    } catch (err) {
      setError('Failed to delete signature');
      console.error(err);
    } finally {
      setDeleteLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Admin Signatures</h3>
          <p className="text-sm text-gray-500 mt-1">
            Manage static signature templates for this package
          </p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Signature
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Add signature form */}
      {showAddForm && (
        <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900">Upload New Signature</h4>
            <button
              onClick={() => {
                setShowAddForm(false);
                setFormData({ label: '', file: null, preview: null });
                setSelectedSubForms([]);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Label input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Label *
              </label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) =>
                  setFormData({ ...formData, label: e.target.value })
                }
                placeholder="e.g., Kenia - Supervising RN"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                A descriptive label for this signature
              </p>
            </div>

            {/* File upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Image File *
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  onChange={handleFileChange}
                  className="hidden"
                  id="signature-file-input"
                />
                <label htmlFor="signature-file-input" className="cursor-pointer block">
                  {formData.preview ? (
                    <div className="space-y-2">
                      <img
                        src={formData.preview}
                        alt="Preview"
                        className="h-32 mx-auto object-contain"
                      />
                      <p className="text-sm text-gray-600">
                        {formData.file?.name}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <ImageIcon className="w-8 h-8 mx-auto text-gray-400" />
                      <p className="text-sm font-medium text-gray-700">
                        Drag and drop your image here
                      </p>
                      <p className="text-xs text-gray-500">
                        PNG or JPEG, up to 2MB, minimum 200px wide
                      </p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Sub-form selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Sub-Forms *
              </label>
              <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-300 rounded-lg p-3 bg-white">
                {subForms.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No sub-forms available
                  </p>
                ) : (
                  subForms.map((subForm) => (
                    <label
                      key={subForm.sub_form_id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSubForms.includes(subForm.sub_form_id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSubForms([
                              ...selectedSubForms,
                              subForm.sub_form_id,
                            ]);
                          } else {
                            setSelectedSubForms(
                              selectedSubForms.filter(
                                (id) => id !== subForm.sub_form_id
                              )
                            );
                          }
                        }}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">
                        {subForm.name}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Select which sub-forms this signature can be applied to
              </p>
            </div>

            {/* Form actions */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={uploading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                {uploading ? 'Uploading...' : 'Upload Signature'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({ label: '', file: null, preview: null });
                  setSelectedSubForms([]);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Signatures list */}
      <div className="space-y-3">
        {signatures.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
            <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No signatures uploaded yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Click "Add Signature" to upload your first signature template
            </p>
          </div>
        ) : (
          signatures.map((signature) => (
            <div
              key={signature.id}
              className="border border-gray-200 rounded-lg p-4 bg-white hover:border-gray-300 transition-colors"
            >
              <div className="flex gap-4">
                {/* Signature image preview */}
                <div className="flex-shrink-0">
                  <img
                    src={`data:image/png;base64,${signature.image_base64}`}
                    alt={signature.label}
                    className="h-24 w-auto object-contain border border-gray-200 rounded bg-gray-50 p-2"
                  />
                </div>

                {/* Signature details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-900">
                        {signature.label}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        ID: {signature.id.split('_')[0]}...
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(signature.id)}
                      disabled={deleteLoading === signature.id}
                      className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed p-1"
                      title="Delete signature"
                    >
                      {deleteLoading === signature.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Target sub-forms */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-600 mb-2">
                      Target Sub-Forms:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {signature.target_sub_forms.length === 0 ? (
                        <span className="text-xs text-gray-400">
                          No target sub-forms
                        </span>
                      ) : (
                        signature.target_sub_forms.map((target, idx) => {
                          const subForm = subForms.find(
                            (sf) => sf.sub_form_id === target.sub_form_id
                          );
                          return (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs"
                            >
                              {subForm?.name || target.sub_form_id} (p.
                              {target.page})
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
                    <span>
                      Uploaded:{' '}
                      {new Date(signature.created_at).toLocaleDateString()}
                    </span>
                    <span>By: {signature.uploaded_by.slice(0, 8)}...</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
