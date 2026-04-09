'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getOfficeUser, type OfficeUser } from '@/lib/auth';
import {
  Settings,
  Loader2,
  CheckCircle,
  AlertCircle,
  Stethoscope,
  Save,
  Upload,
  X,
  ArrowLeft,
} from 'lucide-react';

interface FormOption {
  form_id: string;
  form_name: string;
  company_id: string | null;
}

interface RnSettings {
  rn_evaluator_initials: string;
  rn_evaluator_name: string;
  rn_license_number: string;
  rn_evaluator_signature: string;
}

export default function RnEvaluatorSettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentUser, setCurrentUser] = useState<OfficeUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Form selector
  const [forms, setForms] = useState<FormOption[]>([]);
  const [selectedFormId, setSelectedFormId] = useState('');
  const [loadingForms, setLoadingForms] = useState(true);

  // RN settings
  const [settings, setSettings] = useState<RnSettings>({
    rn_evaluator_initials: '',
    rn_evaluator_name: '',
    rn_license_number: '',
    rn_evaluator_signature: '',
  });
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check auth
  useEffect(() => {
    const user = getOfficeUser();
    if (!user) {
      router.push('/office/login');
      return;
    }
    if (user.role !== 'super_admin') {
      router.push('/office/settings');
      return;
    }
    setCurrentUser(user);
    setLoading(false);
  }, [router]);

  // Load forms
  useEffect(() => {
    if (!currentUser) return;
    loadForms();
  }, [currentUser]);

  // Load RN settings when form is selected
  useEffect(() => {
    if (!selectedFormId) {
      setSettings({
        rn_evaluator_initials: '',
        rn_evaluator_name: '',
        rn_license_number: '',
        rn_evaluator_signature: '',
      });
      return;
    }
    loadSettings(selectedFormId);
  }, [selectedFormId]);

  async function loadForms() {
    setLoadingForms(true);
    try {
      const response = await fetch('/api/forms', {
        headers: {
          'x-user-id': currentUser?.id || '',
          'x-user-email': currentUser?.email || '',
        },
      });
      if (response.ok) {
        const data = await response.json();
        const formList = (data.forms || data || []).map((f: any) => ({
          form_id: f.form_id || f.id,
          form_name: f.form_name || f.name,
          company_id: f.company_id,
        }));
        setForms(formList);
      }
    } catch (err) {
      console.error('Error loading forms:', err);
    } finally {
      setLoadingForms(false);
    }
  }

  async function loadSettings(formId: string) {
    setLoadingSettings(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/settings/rn-evaluator?form_id=${formId}`, {
        headers: {
          'x-user-id': currentUser?.id || '',
          'x-user-email': currentUser?.email || '',
        },
      });
      if (response.ok) {
        const data = await response.json();
        setSettings({
          rn_evaluator_initials: data.rn_evaluator_initials || '',
          rn_evaluator_name: data.rn_evaluator_name || '',
          rn_license_number: data.rn_license_number || '',
          rn_evaluator_signature: data.rn_evaluator_signature || '',
        });
      } else {
        setErrorMessage('Could not load settings for this form');
      }
    } catch (err) {
      setErrorMessage('Failed to load RN evaluator settings');
    } finally {
      setLoadingSettings(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFormId) return;

    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/settings/rn-evaluator', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || '',
          'x-user-email': currentUser?.email || '',
        },
        body: JSON.stringify({
          form_id: selectedFormId,
          ...settings,
        }),
      });

      if (response.ok) {
        setSuccessMessage('RN evaluator settings saved successfully');
      } else {
        const data = await response.json();
        setErrorMessage(data.error || 'Failed to save settings');
      }
    } catch (err) {
      setErrorMessage('Failed to save RN evaluator settings');
    } finally {
      setSaving(false);
    }
  }

  function handleSignatureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload an image file (PNG, JPG, etc.)');
      return;
    }

    // Validate file size (max 500KB)
    if (file.size > 500 * 1024) {
      setErrorMessage('Signature image must be under 500KB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setSettings(prev => ({ ...prev, rn_evaluator_signature: base64 }));
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  }

  function clearSignature() {
    setSettings(prev => ({ ...prev, rn_evaluator_signature: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <button
            onClick={() => router.push('/office/settings')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Settings
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Stethoscope className="w-6 h-6" />
            RN Evaluator Settings
          </h1>
          <p className="text-sm text-gray-500">
            Configure the RN evaluator details used in PDF generation for each form
          </p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Form Selector */}
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Form</h2>
          {loadingForms ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading forms...
            </div>
          ) : (
            <select
              value={selectedFormId}
              onChange={(e) => setSelectedFormId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">Choose a form...</option>
              {forms.map((form) => (
                <option key={form.form_id} value={form.form_id}>
                  {form.form_name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* RN Settings Form */}
        {selectedFormId && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Settings className="w-5 h-5" />
              RN Evaluator Details
            </h2>

            {loadingSettings ? (
              <div className="flex items-center gap-2 text-gray-500 py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading settings...
              </div>
            ) : (
              <>
                {successMessage && (
                  <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    {successMessage}
                  </div>
                )}

                {errorMessage && (
                  <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {errorMessage}
                  </div>
                )}

                <form onSubmit={handleSave} className="space-y-5">
                  {/* RN Full Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      RN Evaluator Name
                    </label>
                    <input
                      type="text"
                      value={settings.rn_evaluator_name}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, rn_evaluator_name: e.target.value }))
                      }
                      placeholder="e.g., Kenia Acevedo"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Full name printed on SVR and CE forms
                    </p>
                  </div>

                  {/* RN Initials */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      RN Initials
                    </label>
                    <input
                      type="text"
                      value={settings.rn_evaluator_initials}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          rn_evaluator_initials: e.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="e.g., K.A"
                      maxLength={10}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 uppercase"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Initials used in the Competency Evaluation table R.N. Initials column
                    </p>
                  </div>

                  {/* RN License Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      RN License Number
                    </label>
                    <input
                      type="text"
                      value={settings.rn_license_number}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, rn_license_number: e.target.value }))
                      }
                      placeholder="e.g., 677306"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      License number printed in the CE form footer
                    </p>
                  </div>

                  {/* RN Signature Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      RN Evaluator Signature
                    </label>

                    {settings.rn_evaluator_signature ? (
                      <div className="border rounded-lg p-3 bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div>
                            <img
                              src={settings.rn_evaluator_signature}
                              alt="RN Signature"
                              className="max-h-16 max-w-xs"
                            />
                            <p className="text-xs text-green-600 mt-1">Signature uploaded</p>
                          </div>
                          <button
                            type="button"
                            onClick={clearSignature}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Remove signature"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                      >
                        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">
                          Click to upload signature image
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          PNG or JPG, max 500KB
                        </p>
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleSignatureUpload}
                      className="hidden"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      This signature is auto-populated on SVR and CE forms during PDF generation
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save Settings
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        )}

        {/* Info card when no form selected */}
        {!selectedFormId && !loadingForms && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
            <Stethoscope className="w-10 h-10 text-blue-400 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-blue-900 mb-1">
              Select a form to configure RN evaluator settings
            </h3>
            <p className="text-xs text-blue-600">
              RN evaluator name, initials, license number, and signature are configured per form.
              These values are used to pre-fill the Supervisory Visit Report and Competency Evaluation
              tables during PDF generation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
