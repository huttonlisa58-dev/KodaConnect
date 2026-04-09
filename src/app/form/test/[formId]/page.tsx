'use client';

/**
 * Test page for previewing the MobileFormWizard as an applicant would see it.
 * URL: /form/test/[formId]
 *
 * This page skips OTP verification and directly renders the wizard.
 * For internal testing only.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import MobileFormWizard from '@/components/forms/MobileFormWizard';
import { FormDefinition, FormSubmissionData } from '@/lib/form-engine';
import { Loader2, AlertCircle, FileText } from 'lucide-react';

export default function FormTestPage() {
  const params = useParams();
  const formId = params.formId as string;

  const [formDefinition, setFormDefinition] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    loadForm();
  }, [formId]);

  async function loadForm() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/forms/${formId}`);
      if (!response.ok) {
        throw new Error('Form not found');
      }

      const data = await response.json();
      setFormDefinition(data.form);
    } catch (err) {
      console.error('Failed to load form:', err);
      setError(err instanceof Error ? err.message : 'Failed to load form');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(data: FormSubmissionData) {
    // For testing, just log the data and show success
    console.log('Form submitted (test mode):', data);

    try {
      const response = await fetch(`/api/forms/${formId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_data: data,
          applicant_id: 'test-applicant',
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        console.warn('Submit response:', result);
        // Don't throw - just show success for testing
      }
    } catch (err) {
      console.warn('Submit error (expected in test mode):', err);
    }

    setSubmitted(true);
  }

  async function handleSaveDraft(data: FormSubmissionData) {
    console.log('Draft saved (test mode):', data);
    alert('Draft saved! (Test mode - data logged to console)');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  if (error || !formDefinition) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Form Not Found</h1>
          <p className="text-gray-600 mb-4">{error || 'The form could not be loaded.'}</p>
          <p className="text-sm text-gray-400">Form ID: {formId}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Form Submitted!</h1>
          <p className="text-gray-600 mb-6">
            Test submission completed successfully. Check the browser console for the submitted data.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
            }}
            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium"
          >
            Fill Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Test Mode Banner */}
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-center">
        <p className="text-sm text-yellow-800 font-medium">
          Test Mode — OTP verification skipped. This is how caregivers will see the form.
        </p>
      </div>

      <MobileFormWizard
        definition={formDefinition}
        onSubmit={handleSubmit}
        onSaveDraft={handleSaveDraft}
        brandColors={{
          primary: '#0f766e',
          secondary: '#1e40af',
          accent: '#ea580c',
        }}
      />
    </>
  );
}
