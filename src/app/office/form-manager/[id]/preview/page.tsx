'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FormDefinition, createEmptySubmission } from '@/lib/form-engine';
import DynamicForm from '@/components/forms/DynamicForm';
import MobileFormWizard from '@/components/forms/MobileFormWizard';
import { ChevronLeft, Monitor, Smartphone } from 'lucide-react';
import Link from 'next/link';

export default function FormPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.id as string;

  const [form, setForm] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewData, setPreviewData] = useState<any>(null);
  const [showSampleData, setShowSampleData] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    loadForm();
  }, [formId]);

  async function loadForm() {
    setLoading(true);
    try {
      const response = await fetch(`/api/forms/${formId}`);
      if (!response.ok) throw new Error('Failed to load form');
      const data = await response.json();
      setForm(data.form);

      // Create sample data
      const sampleData = createEmptySubmission(data.form);

      // Fill with sample values for demonstration
      Object.keys(sampleData).forEach((key) => {
        const field = data.form.sections
          .flatMap((s: any) => s.fields)
          .find((f: any) => f.field_id === key);

        if (!field) return;

        switch (field.type) {
          case 'text':
            sampleData[key] = 'Sample Text';
            break;
          case 'email':
            sampleData[key] = 'john@example.com';
            break;
          case 'phone':
            sampleData[key] = '(555) 123-4567';
            break;
          case 'date':
            sampleData[key] = new Date().toISOString().split('T')[0];
            break;
          case 'number':
            sampleData[key] = '42';
            break;
          case 'textarea':
            sampleData[key] = 'Sample paragraph of text for demonstration purposes.';
            break;
          case 'checkbox':
            sampleData[key] = false;
            break;
          case 'checkbox_group':
          case 'checkbox_grid':
            sampleData[key] = {};
            break;
          case 'radio':
          case 'select':
            if (field.options && field.options.length > 0) {
              sampleData[key] = field.options[0].value;
            }
            break;
        }
      });

      setPreviewData(sampleData);
    } catch (error) {
      console.error('Failed to load form:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Form not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link
            href={`/office/form-manager/${formId}`}
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4 font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Editor
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Form Preview</h1>
          <p className="text-sm text-gray-500">
            This is how your form will appear to users. Editing is disabled in preview mode.
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Preview Controls */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-medium text-blue-900">Preview Mode</p>
              <p className="text-sm text-blue-800">Form is read-only. Switch to editor to make changes.</p>
            </div>
            <button
              onClick={() => setShowSampleData(!showSampleData)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              {showSampleData ? 'Clear Sample Data' : 'Fill Sample Data'}
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-blue-900">View:</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPreviewMode('desktop')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  previewMode === 'desktop'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-50'
                }`}
              >
                <Monitor className="w-4 h-4" />
                Desktop
              </button>
              <button
                onClick={() => setPreviewMode('mobile')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  previewMode === 'mobile'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-50'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                Mobile
              </button>
            </div>
          </div>
        </div>

        {/* Form Renderer */}
        {previewMode === 'desktop' ? (
          <div className="bg-white rounded-lg border p-8">
            {previewData && (
              <DynamicForm
                definition={form}
                initialData={showSampleData ? previewData : undefined}
                onSubmit={async () => {
                  alert('In preview mode, form submission is disabled. This would submit the form in production.');
                }}
                readOnly={true}
                brandColors={{
                  primary: '#2563eb',
                  secondary: '#64748b',
                  accent: '#3b82f6',
                }}
              />
            )}
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-full max-w-sm mx-auto border-4 border-black rounded-3xl bg-black p-3 shadow-2xl">
              <div className="bg-white rounded-2xl overflow-hidden min-h-96">
                {previewData && (
                  <MobileFormWizard
                    definition={form}
                    initialData={showSampleData ? previewData : undefined}
                    onSubmit={async () => {
                      alert('In preview mode, form submission is disabled. This would submit the form in production.');
                    }}
                    brandColors={{
                      primary: '#2563eb',
                      secondary: '#64748b',
                      accent: '#3b82f6',
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Form Statistics */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border p-6">
            <p className="text-gray-600 text-sm">Total Sections</p>
            <p className="text-3xl font-bold text-gray-900">{form.sections.length}</p>
          </div>
          <div className="bg-white rounded-lg border p-6">
            <p className="text-gray-600 text-sm">Total Fields</p>
            <p className="text-3xl font-bold text-gray-900">
              {form.sections.reduce((sum, s) => sum + s.fields.length, 0)}
            </p>
          </div>
          <div className="bg-white rounded-lg border p-6">
            <p className="text-gray-600 text-sm">Required Fields</p>
            <p className="text-3xl font-bold text-gray-900">
              {form.sections.reduce(
                (sum, s) => sum + s.fields.filter((f) => f.required).length,
                0
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
