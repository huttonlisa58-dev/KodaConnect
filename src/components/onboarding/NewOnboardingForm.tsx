'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Company,
  Template,
  TemplatePacket,
  CreateBundlePayload,
} from './types';

// Loading spinner component
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center">
      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
    </div>
  );
}

// Render mode badge component
function RenderModeBadge({ mode }: { mode: 'generated' | 'replica' }) {
  const config = {
    generated: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Generated' },
    replica: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Replica' },
  };

  const c = config[mode];
  return (
    <span className={`px-2 py-1 rounded text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// Role badge component
function RoleBadge({ role }: { role: 'applicant' | 'rn_evaluator' | 'hr_admin' }) {
  const config = {
    applicant: { bg: 'bg-green-100', text: 'text-green-800', label: 'Applicant' },
    rn_evaluator: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'RN Evaluator' },
    hr_admin: { bg: 'bg-red-100', text: 'text-red-800', label: 'HR Admin' },
  };

  const c = config[role];
  return (
    <span className={`px-2 py-1 rounded text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

/**
 * NewOnboardingForm Component
 * Multi-step form for HR to create a new onboarding bundle
 * Steps include: company selection, template selection, applicant info, and confirmation
 */
export default function NewOnboardingForm() {
  const router = useRouter();

  // Step management
  const [step, setStep] = useState(1);

  // Data state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([]);

  // Form state
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [sendSms, setSendSms] = useState(true);
  const [notes, setNotes] = useState('');

  // UI state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [companiesRes, templatesRes] = await Promise.all([
          fetch('/api/companies'),
          fetch('/api/onboarding/templates'),
        ]);

        if (!companiesRes.ok || !templatesRes.ok) {
          throw new Error('Failed to fetch required data');
        }

        const companiesData = await companiesRes.json();
        const templatesData = await templatesRes.json();

        setCompanies(companiesData);
        setTemplates(templatesData);

        // Pre-select first company if only one exists
        if (companiesData.length === 1) {
          setSelectedCompanyId(companiesData[0].id);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load required data. Please refresh and try again.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter templates by selected company
  useEffect(() => {
    if (selectedCompanyId) {
      const filtered = templates.filter(
        (t) => t.company_id === selectedCompanyId && t.is_active
      );
      setFilteredTemplates(filtered);
      setSelectedTemplateId('');
      setSelectedTemplate(null);
    } else {
      setFilteredTemplates([]);
      setSelectedTemplate(null);
    }
  }, [selectedCompanyId, templates]);

  // Handle template selection
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = filteredTemplates.find((t) => t.id === templateId);
    setSelectedTemplate(template || null);
  };

  // Validate current step
  const canProceedToNextStep = (): boolean => {
    switch (step) {
      case 1:
        return !!selectedCompanyId;
      case 2:
        return !!selectedTemplateId;
      case 3:
        return !!(firstName.trim() && lastName.trim() && phone.trim());
      default:
        return false;
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCompanyId || !selectedTemplateId) {
      setError('Please complete all required fields');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: CreateBundlePayload = {
        company_id: selectedCompanyId,
        template_id: selectedTemplateId,
        applicant_first_name: firstName.trim(),
        applicant_last_name: lastName.trim(),
        applicant_phone: phone.trim(),
        applicant_email: email.trim() || undefined,
        send_sms_invitation: sendSms,
        notes: notes.trim() || undefined,
      };

      const response = await fetch('/api/onboarding/bundles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || 'Failed to create onboarding bundle'
        );
      }

      const data = await response.json();
      router.push(`/office/onboarding/${data.bundle_id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-gray-900">New Onboarding</h1>
          <p className="text-gray-600 mt-2">Step {step} of 4</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex justify-between mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex flex-col items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold mb-2 ${
                  s <= step
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-300 text-gray-600'
                }`}
              >
                {s}
              </div>
              <p className="text-xs text-gray-600 text-center">
                {s === 1 && 'Company'}
                {s === 2 && 'Template'}
                {s === 3 && 'Applicant'}
                {s === 4 && 'Review'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Main form */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">
                <strong>Error:</strong> {error}
              </p>
            </div>
          )}

          {/* Step 1: Company Selection */}
          {step === 1 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">
                Select Company
              </h2>

              {companies.length === 0 ? (
                <p className="text-gray-600">
                  No companies available. Please contact an administrator.
                </p>
              ) : (
                <div className="space-y-3">
                  {companies.map((company) => (
                    <label key={company.id} className="flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="company"
                        value={company.id}
                        checked={selectedCompanyId === company.id}
                        onChange={(e) => setSelectedCompanyId(e.target.value)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <div className="ml-4">
                        <p className="font-medium text-gray-900">
                          {company.name}
                        </p>
                        {company.state && (
                          <p className="text-sm text-gray-600">{company.state}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Template Selection */}
          {step === 2 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">
                Select Template
              </h2>

              {filteredTemplates.length === 0 ? (
                <p className="text-gray-600">
                  No templates available for the selected company.
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredTemplates.map((template) => (
                    <label
                      key={template.id}
                      className="flex items-start p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="radio"
                        name="template"
                        value={template.id}
                        checked={selectedTemplateId === template.id}
                        onChange={(e) => handleSelectTemplate(e.target.value)}
                        className="w-4 h-4 text-blue-600 mt-1"
                      />
                      <div className="ml-4 flex-1">
                        <p className="font-medium text-gray-900">
                          {template.name}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
                            {template.state}
                          </span>
                          <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
                            {template.packet_count} packets
                          </span>
                        </div>
                        {template.description && (
                          <p className="text-sm text-gray-600 mt-2">
                            {template.description}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Template Preview and Applicant Info */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Template preview */}
              {selectedTemplate && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Included Packets
                  </h3>
                  <div className="space-y-3">
                    {selectedTemplate.packets
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((packet) => (
                        <div
                          key={packet.id}
                          className="flex items-start justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              {packet.packet_name}
                            </p>
                            <div className="flex gap-2 mt-2">
                              <RenderModeBadge mode={packet.render_mode} />
                              <RoleBadge role={packet.assigned_to_role} />
                              {packet.is_required && (
                                <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded">
                                  Required
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Applicant info */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">
                  Applicant Information
                </h2>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="John"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Doe"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email (Optional)
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="john.doe@example.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="sendSms"
                      checked={sendSms}
                      onChange={(e) => setSendSms(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <label
                      htmlFor="sendSms"
                      className="text-sm font-medium text-gray-700"
                    >
                      Send SMS invitation now
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes (Optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any special notes about this onboarding..."
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">
                Review Information
              </h2>

              <div className="space-y-4">
                <div className="border-b border-gray-200 pb-4">
                  <p className="text-sm text-gray-600">Company</p>
                  <p className="font-medium text-gray-900">
                    {companies.find((c) => c.id === selectedCompanyId)?.name}
                  </p>
                </div>

                <div className="border-b border-gray-200 pb-4">
                  <p className="text-sm text-gray-600">Template</p>
                  <p className="font-medium text-gray-900">
                    {selectedTemplate?.name}
                  </p>
                </div>

                <div className="border-b border-gray-200 pb-4">
                  <p className="text-sm text-gray-600">Applicant</p>
                  <p className="font-medium text-gray-900">
                    {firstName} {lastName}
                  </p>
                </div>

                <div className="border-b border-gray-200 pb-4">
                  <p className="text-sm text-gray-600">Contact</p>
                  <p className="font-medium text-gray-900">{phone}</p>
                  {email && (
                    <p className="font-medium text-gray-900">{email}</p>
                  )}
                </div>

                <div>
                  <p className="text-sm text-gray-600">Send SMS Invitation</p>
                  <p className="font-medium text-gray-900">
                    {sendSms ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  Click "Start Onboarding" to create the bundle and send invitations
                  to the applicant.
                </p>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between gap-4">
            <button
              type="button"
              onClick={() => (step === 1 ? router.back() : setStep(step - 1))}
              className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={!canProceedToNextStep()}
                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <LoadingSpinner />
                    Starting...
                  </>
                ) : (
                  'Start Onboarding'
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
