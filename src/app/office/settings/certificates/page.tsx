'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getOfficeUser, type OfficeUser } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';
import {
  Shield,
  Upload,
  Save,
  ChevronLeft,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  X,
  FileText,
} from 'lucide-react';
import Link from 'next/link';

interface CertificateConfig {
  representative_name: string;
  representative_title: string;
  signature_url: string;
}

interface FormOption {
  form_id: string;
  form_name: string;
}

export default function CertificateSettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentUser, setCurrentUser] = useState<OfficeUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Form selector
  const [forms, setForms] = useState<FormOption[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>('');

  // Config state
  const [representativeName, setRepresentativeName] = useState('');
  const [representativeTitle, setRepresentativeTitle] = useState('');
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string>('');
  const [signaturePreview, setSignaturePreview] = useState<string>('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const user = getOfficeUser();
    if (!user || user.role !== 'super_admin') {
      router.push('/office/settings');
      return;
    }
    setCurrentUser(user);
    loadForms();
  }, []);

  // Load forms that have certificate_config enabled
  async function loadForms() {
    try {
      const { data: formDefs } = await getSupabase()
        .from('form_definitions')
        .select('form_id, form_name, status, metadata')
        .neq('status', 'deleted')
        .order('form_name');

      if (formDefs) {
        // Filter to active forms that have certificate_config enabled
        const certForms = formDefs
          .filter((f: any) => f.metadata?.certificate_config?.enabled)
          .map((f: any) => ({
            form_id: f.form_id,
            form_name: f.form_name || f.form_id,
          }));

        setForms(certForms);

        // Auto-select first form if available
        if (certForms.length > 0) {
          setSelectedFormId(certForms[0].form_id);
        }
      }
    } catch (err) {
      console.error('Error loading forms:', err);
    } finally {
      setLoading(false);
    }
  }

  // Load config when form selection changes
  useEffect(() => {
    if (selectedFormId && currentUser) {
      loadCertificateConfig(selectedFormId);
    }
  }, [selectedFormId, currentUser]);

  async function loadCertificateConfig(formId: string) {
    setLoading(true);
    setRepresentativeName('');
    setRepresentativeTitle('');
    setSignatureUrl('');
    setSignaturePreview('');
    setSignatureFile(null);

    try {
      const res = await fetch(`/api/certificates/config?form_id=${formId}`, {
        headers: { 'x-office-user-id': currentUser?.id || '' },
      });

      if (!res.ok) {
        setLoading(false);
        return;
      }

      const data = await res.json();
      setRepresentativeName(data.representative_name || '');
      setRepresentativeTitle(data.representative_title || '');
      if (data.signature_url) {
        setSignatureUrl(data.signature_url);
        setSignaturePreview(data.signature_url);
      }
    } catch (err) {
      console.error('Error loading certificate config:', err);
      setErrorMessage('Failed to load current settings');
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelect(file: File | null) {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setErrorMessage('Only PNG and JPG files are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('File size must be less than 5MB');
      return;
    }
    setSignatureFile(file);
    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = (e) => setSignaturePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleDrag(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) handleFileSelect(files[0]);
  }

  async function uploadSignature() {
    if (!signatureFile || !currentUser || !selectedFormId) {
      setErrorMessage('No signature file selected');
      return;
    }

    setUploadingSignature(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('signature', signatureFile);
      formData.append('form_id', selectedFormId);

      const res = await fetch('/api/certificates/config/signature', {
        method: 'POST',
        headers: { 'x-office-user-id': currentUser.id },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to upload signature');
      }

      const data = await res.json();
      if (data.signature_url) {
        setSignatureUrl(data.signature_url);
        setSignatureFile(null);
        setSuccessMessage('Signature uploaded successfully');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to upload signature');
    } finally {
      setUploadingSignature(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (!currentUser || !selectedFormId) throw new Error('User not authenticated or no form selected');
      if (!representativeName.trim() || !representativeTitle.trim()) {
        setErrorMessage('Please fill in all required fields');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/certificates/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-office-user-id': currentUser.id,
        },
        body: JSON.stringify({
          representative_name: representativeName.trim(),
          representative_title: representativeTitle.trim(),
          form_id: selectedFormId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save settings');
      }

      setSuccessMessage('Certificate settings saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function clearSignature() {
    setSignatureFile(null);
    setSignaturePreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/office/settings" className="text-gray-400 hover:text-gray-600 transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Shield className="w-6 h-6 text-teal-600" />
              Certificate Settings
            </h1>
          </div>
          <p className="text-sm text-gray-500 ml-8">
            Configure certificate signer information per form
          </p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {successMessage && (
          <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-6 text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-6 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {errorMessage}
          </div>
        )}

        {/* Form Selector */}
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-600" />
            Select Form
          </h2>
          {forms.length === 0 && !loading ? (
            <p className="text-sm text-gray-500">No forms with certificate configuration found. Enable <code>certificate_config</code> in a form&apos;s metadata first.</p>
          ) : (
            <select
              value={selectedFormId}
              onChange={(e) => setSelectedFormId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            >
              {forms.map((f) => (
                <option key={f.form_id} value={f.form_id}>
                  {f.form_name}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Each form can have its own signer and signature. Settings are saved per form.
          </p>
        </div>

        {selectedFormId && !loading ? (
          <>
            {/* Representative Information */}
            <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Representative Information</h2>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Representative Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={representativeName}
                    onChange={(e) => setRepresentativeName(e.target.value)}
                    placeholder="e.g., Dr. Sarah Johnson"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Full name of the person signing the certificates</p>
                </div>
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                    Representative Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={representativeTitle}
                    onChange={(e) => setRepresentativeTitle(e.target.value)}
                    placeholder="e.g., Chief Medical Officer"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Job title to appear on certificates</p>
                </div>
                <div className="pt-4 border-t">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-6 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Information
                  </button>
                </div>
              </form>
            </div>

            {/* Signature Upload */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Digital Signature</h2>
              <div className="space-y-6">
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive ? 'border-teal-500 bg-teal-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                    className="hidden"
                    aria-label="Upload signature"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex flex-col items-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-8 h-8 text-teal-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Click to upload or drag and drop</p>
                      <p className="text-xs text-gray-500 mt-1">PNG or JPG - Max 5MB</p>
                    </div>
                  </button>
                </div>

                {signaturePreview && (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-gray-700">
                        {signatureFile ? 'New Signature Preview' : 'Current Signature'}
                      </p>
                      {signatureFile && (
                        <button type="button" onClick={clearSignature} className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1">
                          <X className="w-3 h-3" /> Clear
                        </button>
                      )}
                    </div>
                    <div className="border rounded-lg bg-white p-4 flex items-center justify-center min-h-[120px] max-h-[200px]">
                      <img src={signaturePreview} alt="Signature preview" className="max-h-full max-w-full object-contain" />
                    </div>
                  </div>
                )}

                {!signaturePreview && !signatureUrl && (
                  <div className="border rounded-lg p-8 text-center bg-gray-50">
                    <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">No signature uploaded yet</p>
                  </div>
                )}

                {signatureFile && (
                  <button
                    type="button"
                    onClick={uploadSignature}
                    disabled={uploadingSignature}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
                  >
                    {uploadingSignature ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload Signature
                  </button>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900">
                    <strong>Tip:</strong> Upload a high-quality PNG or JPG image of the representative&apos;s signature. This will appear on certificates generated for this specific form.
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
