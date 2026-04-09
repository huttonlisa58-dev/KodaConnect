'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import MobileFormWizard from '@/components/forms/MobileFormWizard';
import PDFReplicaForm from '@/components/forms/PDFReplicaForm';
import { FormDefinition, FormSubmissionData, createEmptySubmission } from '@/lib/form-engine';
import type { DocumentTemplate, DocumentField, Submission } from '@/types/database';
import { FileText, Check, AlertCircle, Loader2, User } from 'lucide-react';

type VerificationState = 'loading' | 'chw_entry' | 'verify' | 'form' | 'success' | 'error';

interface AccessToken {
  id: string;
  token: string;
  template_id: string;
  applicant_id: string;
  form_id?: string;
  expires_at: string;
  is_active: boolean;
}

interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
}

interface CompanyConfig {
  chw_mode: boolean;
  applicant_label: string;
}

export default function ApplicantFormPage() {
  const params = useParams();
  const token = params.token as string;

  // Main state
  const [state, setState] = useState<VerificationState>('loading');
  const [error, setError] = useState<string | null>(null);

  // CHW state
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>({ chw_mode: false, applicant_label: 'Applicant' });
  const [chwName, setChwName] = useState('');
  const [chwPhone, setChwPhone] = useState('');

  // Verification state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Token and template state
  const [accessToken, setAccessToken] = useState<AccessToken | null>(null);
  const [applicantId, setApplicantId] = useState<string | null>(null);

  // Old system state (document_templates + document_fields)
  const [template, setTemplate] = useState<DocumentTemplate | null>(null);
  const [fields, setFields] = useState<DocumentField[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // New system state (form_definitions)
  const [formDefinition, setFormDefinition] = useState<FormDefinition | null>(null);
  const [useNewSystem, setUseNewSystem] = useState(false);

  // PDF Replica (Type A) state
  const [packetData, setPacketData] = useState<{
    pdfBase64: string;
    fieldPositionMap: Record<string, any>;
    pageSizes: Record<string, [number, number]>;
  } | null>(null);
  const [isTypeA, setIsTypeA] = useState(false);

  // Brand colors
  const [brandColors, setBrandColors] = useState<BrandColors>({
    primary: '#0f766e',
    secondary: '#1e40af',
    accent: '#ea580c',
  });

  useEffect(() => {
    validateToken();
  }, [token]);

  // ============ TOKEN VALIDATION ============
  async function validateToken() {
    try {
      // Find access token
      const { data: tokenData, error: tokenError } = await getSupabase()
        .from('access_tokens')
        .select('*')
        .eq('token', token)
        .eq('is_active', true)
        .single();

      if (tokenError || !tokenData) {
        setError('Invalid or expired link. Please contact the office for a new link.');
        setState('error');
        return;
      }

      // Check expiration
      if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
        setError('This link has expired. Please contact the office for a new link.');
        setState('error');
        return;
      }

      setAccessToken(tokenData);

      // Get template and fields using template_id from access token
      const templateId = tokenData.template_id;

      if (!templateId) {
        setError('This link is invalid. Please contact the office for a new link.');
        setState('error');
        return;
      }

      const { data: templateData } = await getSupabase()
        .from('document_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      const { data: fieldsData } = await getSupabase()
        .from('document_fields')
        .select('*')
        .eq('template_id', templateId)
        .order('sort_order');

      if (templateData) setTemplate(templateData);
      if (fieldsData) setFields(fieldsData);

      // Try to fetch brand colors AND company config from the company
      if (templateData?.company_id) {
        const { data: companyData } = await getSupabase()
          .from('companies')
          .select('brand_primary, brand_secondary, brand_accent, chw_mode, applicant_label')
          .eq('id', templateData.company_id)
          .single();

        if (companyData) {
          setBrandColors({
            primary: companyData.brand_primary || '#0f766e',
            secondary: companyData.brand_secondary || '#1e40af',
            accent: companyData.brand_accent || '#ea580c',
          });
          setCompanyConfig({
            chw_mode: companyData.chw_mode || false,
            applicant_label: companyData.applicant_label || 'Applicant',
          });
        }
      }

      // Pre-fill name from applicant if available
      if (tokenData.applicant_id) {
        const { data: applicantData } = await getSupabase()
          .from('applicants')
          .select('full_name, phone')
          .eq('id', tokenData.applicant_id)
          .single();

        if (applicantData) {
          if (applicantData.full_name && applicantData.full_name !== 'Unknown') {
            setName(applicantData.full_name);
          }
          if (applicantData.phone) {
            setPhone(applicantData.phone);
          }
        }
      }

      // If CHW mode, show CHW entry screen first; otherwise go to OTP verify
      if (companyConfig.chw_mode) {
        setState('chw_entry');
      } else {
        setState('verify');
      }
    } catch (err) {
      console.error('Token validation error:', err);
      setError('Something went wrong. Please try again.');
      setState('error');
    }
  }

  // We need to re-check companyConfig after it's been set by validateToken
  useEffect(() => {
    if (state === 'verify' && companyConfig.chw_mode && !chwName) {
      setState('chw_entry');
    }
  }, [companyConfig]);

  // ============ CHW ENTRY HANDLER ============
  async function handleChwContinue() {
    if (!chwName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!chwPhone.trim()) {
      setError('Please enter your mobile number');
      return;
    }
    setError(null);

    // In CHW mode, skip OTP — go directly to loading the form
    setVerifying(true);
    try {
      // Create a generic applicant for this CHW submission
      const applicantName = chwName.trim();
      const applicantPhone = chwPhone.trim();

      // Create applicant record (no dedup — each CHW submission is independent)
      const { data: newApplicant, error: applicantError } = await getSupabase()
        .from('applicants')
        .insert({
          full_name: applicantName,
          phone: applicantPhone,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (applicantError) {
        throw new Error('Failed to create applicant record');
      }

      setApplicantId(newApplicant.id);

      // Try new system first
      const foundNewSystem = await loadFormDefinition(newApplicant.id);
      if (!foundNewSystem) {
        await loadOldFormSubmission(newApplicant.id);
      }

      setState('form');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setVerifying(false);
    }
  }

  // ============ OTP VERIFICATION ============
  async function handleSendOtp() {
    if (!name.trim() || !phone.trim()) {
      setError('Please enter your name and phone number');
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const response = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }

      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification code');
    } finally {
      setVerifying(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otp.trim()) {
      setError('Please enter the verification code');
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const response = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          code: otp,
          token: token,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid verification code');
      }

      const verifiedApplicantId = data.applicant.id;
      setApplicantId(verifiedApplicantId);

      const foundNewSystem = await loadFormDefinition(verifiedApplicantId);
      if (!foundNewSystem) {
        await loadOldFormSubmission(verifiedApplicantId);
      }

      setState('form');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }

  // ============ FORM LOADING - NEW SYSTEM ============
  async function loadFormDefinition(verifiedApplicantId: string): Promise<boolean> {
    try {
      let formId = accessToken?.form_id;

      if (!formId && accessToken?.template_id) {
        const { data: formDef } = await getSupabase()
          .from('form_definitions')
          .select('form_id')
          .eq('template_id', accessToken.template_id)
          .limit(1)
          .single();

        if (formDef) {
          formId = formDef.form_id;
        }

        if (!formId) {
          const { data: packet } = await getSupabase()
            .from('form_packets')
            .select('master_form_id')
            .eq('company_id', accessToken.template_id)
            .limit(1)
            .single();

          if (packet?.master_form_id) {
            formId = packet.master_form_id;
          }
        }
      }

      if (!formId) return false;

      const { data: formDef, error: formError } = await getSupabase()
        .from('form_definitions')
        .select('*')
        .eq('form_id', formId)
        .single();

      if (formError || !formDef) return false;

      setFormDefinition(formDef);
      setUseNewSystem(true);

      const renderMode = formDef.metadata?.render_mode;
      const formType = formDef.metadata?.form_type;
      const isReplica = renderMode === 'replica' || formType === 'type_a';

      try {
        const { data: packet, error: packetQueryError } = await getSupabase()
          .from('form_packets')
          .select('template_pdf_base64, field_position_map, page_sizes')
          .eq('master_form_id', formDef.form_id)
          .single();

        if (packet?.template_pdf_base64) {
          setPacketData({
            pdfBase64: packet.template_pdf_base64,
            fieldPositionMap: packet.field_position_map || {},
            pageSizes: packet.page_sizes || {},
          });
          if (isReplica && packet.field_position_map) {
            setIsTypeA(true);
          }
        }
      } catch (packetErr) {
        console.warn('[FormPage] Could not load packet data:', packetErr);
      }

      return true;
    } catch (err) {
      console.error('Error loading form definition:', err);
      return false;
    }
  }

  // ============ FORM LOADING - OLD SYSTEM ============
  async function loadOldFormSubmission(verifiedApplicantId: string) {
    try {
      if (!template) return;

      const { data: existingSubmission } = await getSupabase()
        .from('submissions')
        .select('*')
        .eq('applicant_id', verifiedApplicantId)
        .eq('template_id', template.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existingSubmission) {
        setSubmission(existingSubmission);
        setFormData(existingSubmission.form_data as Record<string, string> || {});
      } else {
        const { data: newSubmission, error: submitError } = await getSupabase()
          .from('submissions')
          .insert({
            applicant_id: verifiedApplicantId,
            template_id: template.id,
            status: 'draft',
            form_data: {},
          })
          .select()
          .single();

        if (submitError) throw new Error('Failed to create form submission');
        setSubmission(newSubmission);
      }
    } catch (err) {
      console.error('Error loading old form submission:', err);
      setError('Failed to load form data');
    }
  }

  // ============ OLD SYSTEM SAVE/SUBMIT ============
  async function handleSave(submit = false) {
    setSaving(true);
    setError(null);

    try {
      const updateData: Record<string, unknown> = {
        form_data: formData,
        updated_at: new Date().toISOString(),
      };

      if (submit) {
        updateData.status = 'submitted';
        updateData.submitted_at = new Date().toISOString();
      }

      const { error: updateError } = await getSupabase()
        .from('submissions')
        .update(updateData)
        .eq('id', submission?.id);

      if (updateError) throw updateError;

      if (submit) setState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // ============ NEW SYSTEM SUBMIT/DRAFT ============
  async function handleNewSystemSubmit(data: FormSubmissionData) {
    try {
      const response = await fetch(`/api/forms/${formDefinition!.form_id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_data: data,
          applicant_id: applicantId,
          // Include CHW info if in CHW mode
          ...(companyConfig.chw_mode && chwName ? {
            chw_name: chwName,
            chw_phone: chwPhone,
          } : {}),
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to submit form');
      }

      setState('success');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to submit form';
      setError(errorMsg);
      throw err;
    }
  }

  async function handleNewSystemSaveDraft(data: FormSubmissionData) {
    try {
      const response = await fetch(`/api/forms/${formDefinition!.form_id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_data: data,
          applicant_id: applicantId,
          status: 'draft',
          ...(companyConfig.chw_mode && chwName ? {
            chw_name: chwName,
            chw_phone: chwPhone,
          } : {}),
        }),
      });

      if (!response.ok) throw new Error('Failed to save draft');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save draft';
      setError(errorMsg);
      throw err;
    }
  }

  // ============ OLD SYSTEM FIELD RENDERING ============
  function renderField(field: DocumentField) {
    const value = formData[field.field_key] || '';
    const commonClasses = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent";

    switch (field.field_type) {
      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => setFormData({ ...formData, [field.field_key]: e.target.value })}
            placeholder={field.placeholder || ''}
            className={`${commonClasses} min-h-[100px]`}
            style={{ outlineColor: brandColors.primary }}
          />
        );
      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => setFormData({ ...formData, [field.field_key]: e.target.value })}
            className={commonClasses}
            style={{ outlineColor: brandColors.primary }}
          />
        );
      case 'checkbox':
        return (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value === 'true'}
              onChange={(e) => setFormData({ ...formData, [field.field_key]: String(e.target.checked) })}
              className="w-4 h-4 rounded focus:ring-2"
              style={{ accentColor: brandColors.primary }}
            />
            <span className="text-gray-700">{field.label}</span>
          </label>
        );
      default:
        return (
          <input
            type={field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'}
            value={value}
            onChange={(e) => setFormData({ ...formData, [field.field_key]: e.target.value })}
            placeholder={field.placeholder || ''}
            className={commonClasses}
            style={{ outlineColor: brandColors.primary }}
          />
        );
    }
  }

  // ============ RENDER STATES ============

  // Loading state
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto" style={{ color: brandColors.primary }} />
          <p className="mt-4 text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Unable to Load Form</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  // Success state
  if (state === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Form Submitted!</h1>
          <p className="text-gray-600">
            Thank you for completing your form. Our team will review your submission and contact you if we need any additional information.
          </p>
        </div>
      </div>
    );
  }

  // CHW Entry state — collect CHW name and phone before proceeding
  if (state === 'chw_entry') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${brandColors.primary}20` }}>
              <User className="w-8 h-8" style={{ color: brandColors.primary }} />
            </div>
            <h1 className="text-xl font-bold text-gray-900">CHW Identification</h1>
            <p className="text-gray-600 mt-2">Please enter your information to continue</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CHW Name *</label>
              <input
                type="text"
                value={chwName}
                onChange={(e) => setChwName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                style={{ outlineColor: brandColors.primary }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number *</label>
              <input
                type="tel"
                value={chwPhone}
                onChange={(e) => setChwPhone(e.target.value)}
                placeholder="(555) 555-5555"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                style={{ outlineColor: brandColors.primary }}
              />
            </div>

            <button
              onClick={handleChwContinue}
              disabled={verifying}
              className="w-full text-white py-3 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: brandColors.primary }}
            >
              {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
              Continue to Form
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Verification state (standard OTP flow for non-CHW)
  if (state === 'verify') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${brandColors.primary}20` }}>
              <FileText className="w-8 h-8" style={{ color: brandColors.primary }} />
            </div>
            <h1 className="text-xl font-bold text-gray-900">{template?.name || 'Document Form'}</h1>
            <p className="text-gray-600 mt-2">Please verify your identity to continue</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                disabled={otpSent}
                style={{ outlineColor: brandColors.primary }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                disabled={otpSent}
                style={{ outlineColor: brandColors.primary }}
              />
            </div>

            {otpSent && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent text-center text-xl tracking-widest"
                  style={{ outlineColor: brandColors.primary }}
                />
                <p className="text-sm text-gray-500 mt-1">Code sent to your phone</p>
              </div>
            )}

            <button
              onClick={otpSent ? handleVerifyOtp : handleSendOtp}
              disabled={verifying}
              className="w-full text-white py-3 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: brandColors.primary }}
            >
              {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
              {otpSent ? 'Verify Code' : 'Send Verification Code'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Form state - NEW SYSTEM Type A: PDF Replica Form
  if (state === 'form' && useNewSystem && formDefinition && isTypeA && packetData) {
    return (
      <PDFReplicaForm
        definition={formDefinition}
        pdfBase64={packetData.pdfBase64}
        fieldPositionMap={packetData.fieldPositionMap}
        pageSizes={packetData.pageSizes}
        onSubmit={handleNewSystemSubmit}
        onSaveDraft={handleNewSystemSaveDraft}
        brandColors={brandColors}
      />
    );
  }

  // Form state - NEW SYSTEM Type B: MobileFormWizard (default)
  if (state === 'form' && useNewSystem && formDefinition) {
    return (
      <MobileFormWizard
        definition={formDefinition}
        brandColors={brandColors}
        onSubmit={handleNewSystemSubmit}
        onSaveDraft={handleNewSystemSaveDraft}
      />
    );
  }

  // Form state - OLD SYSTEM with flat fields
  if (state === 'form') {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">{template?.name}</h1>
              {template?.description && (
                <p className="text-gray-600 mt-2">{template.description}</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-6 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-6">
              {fields.map(field => (
                <div key={field.id}>
                  {field.field_type !== 'checkbox' && (
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                      {field.is_required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                  )}
                  {renderField(field)}
                  {field.help_text && (
                    <p className="text-sm text-gray-500 mt-1">{field.help_text}</p>
                  )}
                </div>
              ))}

              {fields.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p>No form fields configured yet</p>
                </div>
              )}
            </div>

            <div className="mt-8 flex gap-4">
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Save Draft
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="flex-1 text-white py-3 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: brandColors.primary }}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Form
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
