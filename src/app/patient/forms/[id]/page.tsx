'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface FormField {
  id: string;
  fieldKey: string;
  fieldType: string;
  label: string;
  placeholder?: string;
  helpText?: string;
  isRequired: boolean;
  options?: Array<{ label: string; value: string }>;
}

interface FormDefinition {
  id: string;
  name: string;
  description?: string;
  fields: FormField[];
}

export default function PatientFormPage() {
  const router = useRouter();
  const params = useParams();
  const formId = params.id as string;

  const [formDef, setFormDef] = useState<FormDefinition | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadForm();
  }, [formId]);

  const loadForm = async () => {
    try {
      setLoading(true);
      setError(null);

      const patientId = localStorage.getItem('patient_id');
      const token = localStorage.getItem('patient_token');

      if (!patientId || !token) {
        router.push('/patient/login');
        return;
      }

      // Fetch form definition
      const response = await fetch(`/api/patient/forms/${formId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to load form');
      }

      const form = await response.json();
      setFormDef(form);

      // Initialize form data with empty values
      const initialData: Record<string, unknown> = {};
      form.fields.forEach((field: FormField) => {
        initialData[field.fieldKey] = '';
      });
      setFormData(initialData);
    } catch (err) {
      console.error('Form load error:', err);
      setError('Failed to load form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (fieldKey: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [fieldKey]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const patientId = localStorage.getItem('patient_id');
      const token = localStorage.getItem('patient_token');

      if (!patientId || !token) {
        router.push('/patient/login');
        return;
      }

      const response = await fetch('/api/patient/forms/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          formId,
          patientId,
          formData,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit form');
      }

      setSubmitted(true);
      setTimeout(() => {
        router.push('/patient/forms');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Form Submitted!</h2>
          <p className="text-gray-600 mb-6">Thank you for completing the form. Redirecting to forms page...</p>
        </div>
      </div>
    );
  }

  if (!formDef) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Form Not Found</h2>
          <p className="text-gray-600 mb-6">{error || 'The form could not be loaded.'}</p>
          <Link
            href="/patient/forms"
            className="block bg-blue-600 text-white font-semibold px-6 py-2 rounded-lg hover:bg-blue-700 transition text-center"
          >
            Back to Forms
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/patient/forms"
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition font-semibold mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Forms
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{formDef.name}</h1>
          {formDef.description && (
            <p className="text-gray-600 mt-1">{formDef.description}</p>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 flex gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Error</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-8 space-y-6">
          {formDef.fields.map((field) => (
            <FormFieldRenderer
              key={field.fieldKey}
              field={field}
              value={formData[field.fieldKey]}
              onChange={(value) => handleFieldChange(field.fieldKey, value)}
            />
          ))}

          {/* Submit Button */}
          <div className="pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Form'
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

interface FormFieldRendererProps {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
}

function FormFieldRenderer({ field, value, onChange }: FormFieldRendererProps) {
  const baseInputClasses = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';

  switch (field.fieldType) {
    case 'text':
    case 'email':
    case 'phone':
      return (
        <div>
          <label htmlFor={field.fieldKey} className="block text-sm font-semibold text-gray-900 mb-2">
            {field.label}
            {field.isRequired && <span className="text-red-600">*</span>}
          </label>
          <input
            id={field.fieldKey}
            type={field.fieldType}
            placeholder={field.placeholder}
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            className={baseInputClasses}
            required={field.isRequired}
            aria-label={field.label}
          />
          {field.helpText && <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>}
        </div>
      );

    case 'textarea':
      return (
        <div>
          <label htmlFor={field.fieldKey} className="block text-sm font-semibold text-gray-900 mb-2">
            {field.label}
            {field.isRequired && <span className="text-red-600">*</span>}
          </label>
          <textarea
            id={field.fieldKey}
            placeholder={field.placeholder}
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            className={`${baseInputClasses} min-h-32`}
            required={field.isRequired}
            aria-label={field.label}
          />
          {field.helpText && <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>}
        </div>
      );

    case 'select':
      return (
        <div>
          <label htmlFor={field.fieldKey} className="block text-sm font-semibold text-gray-900 mb-2">
            {field.label}
            {field.isRequired && <span className="text-red-600">*</span>}
          </label>
          <select
            id={field.fieldKey}
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            className={baseInputClasses}
            required={field.isRequired}
            aria-label={field.label}
          >
            <option value="">Select an option...</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {field.helpText && <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>}
        </div>
      );

    case 'checkbox':
      return (
        <div className="flex items-center">
          <input
            id={field.fieldKey}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            required={field.isRequired}
            aria-label={field.label}
          />
          <label htmlFor={field.fieldKey} className="ml-3 text-sm font-medium text-gray-900">
            {field.label}
          </label>
          {field.helpText && <p className="text-xs text-gray-500 ml-7 mt-1">{field.helpText}</p>}
        </div>
      );

    case 'date':
      return (
        <div>
          <label htmlFor={field.fieldKey} className="block text-sm font-semibold text-gray-900 mb-2">
            {field.label}
            {field.isRequired && <span className="text-red-600">*</span>}
          </label>
          <input
            id={field.fieldKey}
            type="date"
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            className={baseInputClasses}
            required={field.isRequired}
            aria-label={field.label}
          />
          {field.helpText && <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>}
        </div>
      );

    default:
      return null;
  }
}
