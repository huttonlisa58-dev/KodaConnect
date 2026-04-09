'use client';

import { useState, useEffect } from 'react';
import { X, Upload, FileText, Loader, Building2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

interface Company {
  id: string;
  name: string;
}

interface CreateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFormCreated?: () => void;
}

export default function CreateFormModal({
  isOpen,
  onClose,
  onFormCreated,
}: CreateFormModalProps) {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [method, setMethod] = useState<'upload' | 'blank' | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [formName, setFormName] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchCompanies();
    }
  }, [isOpen]);

  async function fetchCompanies() {
    setLoadingCompanies(true);
    try {
      const { data, error: err } = await getSupabase()
        .from('companies')
        .select('id, name')
        .eq('active', true)
        .order('name');

      if (err) throw err;
      setCompanies(data || []);

      // Auto-select first company if only one
      if (data && data.length === 1) {
        setSelectedCompanyId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load companies:', err);
      setError('Failed to load companies');
    } finally {
      setLoadingCompanies(false);
    }
  }

  if (!isOpen) return null;

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!file) {
        setError('Please select a PDF file');
        return;
      }

      if (!selectedCompanyId) {
        setError('Please select a company');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('company_id', selectedCompanyId);

      const response = await fetch('/api/forms/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to analyze PDF');
      }

      const data = await response.json();
      const { form_definition } = data;

      // Save the analyzed form
      const saveResponse = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form_definition),
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save form');
      }

      const savedForm = await saveResponse.json();
      onFormCreated?.();
      router.push(`/office/form-manager/${savedForm.form.form_id}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create form');
    } finally {
      setLoading(false);
    }
  };

  const handleBlankForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!formName.trim()) {
        setError('Please enter a form name');
        return;
      }

      if (!selectedCompanyId) {
        setError('Please select a company');
        return;
      }

      const response = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_name: formName,
          company_id: selectedCompanyId,
          version: '1.0',
          status: 'draft',
          sections: [],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create form');
      }

      const data = await response.json();
      onFormCreated?.();
      router.push(`/office/form-manager/${data.form.form_id}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create form');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setMethod(null);
    setFile(null);
    setFormName('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Create New Form</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Company Selection - Always shown first */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Company *
            </label>
            {loadingCompanies ? (
              <div className="flex items-center justify-center border border-gray-300 rounded-lg px-3 py-2">
                <Loader className="w-4 h-4 animate-spin text-blue-600 mr-2" />
                <span className="text-sm text-gray-600">Loading companies...</span>
              </div>
            ) : (
              <div className="relative flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  disabled={loading || companies.length === 0}
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                >
                  <option value="">Choose a company...</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Method Selection - Only shown when company is selected */}
          {!method ? (
            <>
              {selectedCompanyId ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Upload PDF Option */}
                  <button
                    onClick={() => setMethod('upload')}
                    className="p-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-center space-y-4"
                  >
                    <div className="flex justify-center">
                      <Upload className="w-12 h-12 text-gray-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Upload PDF</h3>
                      <p className="text-sm text-gray-600 mt-2">
                        Analyze a PDF document to automatically extract fields
                      </p>
                    </div>
                  </button>

                  {/* Create Blank Option */}
                  <button
                    onClick={() => setMethod('blank')}
                    className="p-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-center space-y-4"
                  >
                    <div className="flex justify-center">
                      <FileText className="w-12 h-12 text-gray-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Create Blank</h3>
                      <p className="text-sm text-gray-600 mt-2">
                        Start with an empty form and build it from scratch
                      </p>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center border border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <p className="text-gray-500">Please select a company to continue</p>
                </div>
              )}
            </>
          ) : method === 'upload' ? (
            <form onSubmit={handleUpload} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-4">
                  Select PDF File
                </label>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    disabled={loading}
                    className="hidden"
                  />
                  <Upload className="w-12 h-12 text-gray-400 mb-4" />
                  <span className="text-gray-700 font-medium">
                    {file ? file.name : 'Click or drag PDF file here'}
                  </span>
                  <span className="text-xs text-gray-500 mt-2">PDF only, max 50MB</span>
                </label>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setMethod(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={!file || loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading && <Loader className="w-4 h-4 animate-spin" />}
                  {loading ? 'Analyzing...' : 'Analyze PDF'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleBlankForm} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Form Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Application Form, Intake Form"
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setMethod(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || !formName.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading && <Loader className="w-4 h-4 animate-spin" />}
                  {loading ? 'Creating...' : 'Create Form'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
