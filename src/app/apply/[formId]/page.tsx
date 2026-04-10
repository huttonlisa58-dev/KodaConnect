'use client';

/**
 * Public applicant form page with OTP verification and consent screens.
 * URL: /apply/[formId]
 *
 * Flow:
 *  1. Phone input → Send OTP
 *  2. Code verification → Verify OTP
 *  3. E-Signature consent screen
 *  4. Staff edit consent screen
 *  5. Form wizard (MobileFormWizard OR PDFReplicaForm based on render_mode)
 *  6. Submitted confirmation
 *
 * FIX 2026-02-26: Added replica mode support.
 * When form metadata has render_mode="replica" and packet data exists,
 * uses PDFReplicaForm to render all pages as canvas images with field overlays.
 *
 * FIX 2026-02-26 v2: Use server-side API (/api/form-pdf/) instead of direct
 * Supabase client queries for packet data. This avoids RLS restrictions on
 * form_packets table and ensures reliable PDF loading.
 *
 * FIX 2026-02-27: Pass applicantData (name/phone from OTP screen) to
 * PDFReplicaForm for auto-fill. Remove onSaveDraft for replica mode.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import MobileFormWizard from '@/components/forms/MobileFormWizard';
import PDFReplicaForm, { FieldPositionInfo } from '@/components/forms/PDFReplicaForm';
import { FormDefinition, FormSubmissionData } from '@/lib/form-engine';
import { Loader2, AlertCircle, CheckCircle2, XCircle, Phone, ShieldCheck, FileText, BookOpen, RefreshCw, ChevronDown, ChevronUp, Award, Download } from 'lucide-react';
import { gradeExam, ExamGradeResult } from '@/lib/exam-grading';
import { ExamGradeDisplay } from '@/components/forms/ExamGradeDisplay';
import ESignatureConsent, { ESignConsentRecord } from '@/components/consent/ESignatureConsent';
import StaffEditConsent, { StaffEditConsentRecord } from '@/components/consent/StaffEditConsent';

type PageState = 'loading' | 'error' | 'phone' | 'code' | 'esign_consent' | 'staff_consent' | 'resume_prompt' | 'form' | 'submitted';

interface DraftData {
  submission_id: string;
  form_data: FormSubmissionData;
  current_step: number;
  updated_at: string;
  applicant_id: string;
}

export default function ApplyFormPage() {
  const params = useParams();
  const formId = params.formId as string;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [formDefinition, setFormDefinition] = useState<FormDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Replica mode state ──────────────────────────────────────────
  const [isReplicaMode, setIsReplicaMode] = useState(false);
  const [packetData, setPacketData] = useState<{
    pdfBase64: string;
    fieldPositionMap: Record<string, FieldPositionInfo>;
    pageSizes: Record<string, [number, number]>;
  } | null>(null);

  // OTP state
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [applicantId, setApplicantId] = useState<string | null>(null);

  // Consent state
  const [esignConsent, setEsignConsent] = useState<ESignConsentRecord | null>(null);
  const [staffEditConsent, setStaffEditConsent] = useState<StaffEditConsentRecord | null>(null);

  // Draft resume state
  const [existingDraft, setExistingDraft] = useState<DraftData | null>(null);
  const [draftSubmissionId, setDraftSubmissionId] = useState<string | null>(null);
  const [checkingDraft, setCheckingDraft] = useState(false);

  // Auto-grading state
  const [gradeResult, setGradeResult] = useState<ExamGradeResult | null>(null);

  // Certificate state (for training courses)
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null);
  const [certificateLoading, setCertificateLoading] = useState(false);

  // FIX 2026-03-01: Use refs to prevent draft save race conditions.
  // State updates are async, so rapid Next clicks could see stale draftSubmissionId
  // and create duplicate submissions. Refs provide synchronous access.
  const draftIdRef = useRef<string | null>(null);
  const savingDraftRef = useRef(false);

  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadForm();
  }, [formId]);

  async function loadForm() {
    setPageState('loading');
    setError(null);

    try {
      const response = await fetch(`/api/forms/${formId}`);
      if (!response.ok) {
        throw new Error('This form is no longer available.');
      }

      const data = await response.json();

      if (data.form.status === 'archived') {
        throw new Error('This form has been archived and is no longer accepting responses.');
      }

      const formDef = data.form;
      setFormDefinition(formDef);

      // ── Check for replica mode and load packet data via API ──────
      const renderMode = formDef.metadata?.render_mode;
      const formType = formDef.metadata?.form_type;
      const isReplica = renderMode === 'replica' || formType === 'type_a';

      if (isReplica) {
        try {
          // Use server-side API route (service role key) instead of direct
          // Supabase client queries. This bypasses RLS on form_packets and
          // ensures reliable PDF loading for public-facing pages.
          const pdfResponse = await fetch(`/api/form-pdf/${formDef.form_id}?include=packet`);

          if (pdfResponse.ok) {
            const pdfData = await pdfResponse.json();

            if (pdfData.pdf_base64 && pdfData.field_position_map) {
              // Defensive: strip data: URI prefix if present
              let rawBase64 = pdfData.pdf_base64;
              if (typeof rawBase64 === 'string' && rawBase64.startsWith('data:')) {
                rawBase64 = rawBase64.split(',')[1] || rawBase64;
              }

              setPacketData({
                pdfBase64: rawBase64,
                fieldPositionMap: pdfData.field_position_map,
                pageSizes: pdfData.page_sizes || {},
              });
              setIsReplicaMode(true);
              console.log('[ApplyPage] Replica mode enabled, PDF length:', rawBase64.length);
            } else {
              console.warn('[ApplyPage] Packet API returned incomplete data, falling back to generated mode');
            }
          } else {
            console.warn('[ApplyPage] Packet API returned', pdfResponse.status, '- falling back to generated mode');
          }
        } catch (packetErr) {
          console.warn('[ApplyPage] Could not load packet data, falling back to generated mode:', packetErr);
        }
      }

      setPageState('phone');
    } catch (err) {
      console.error('Failed to load form:', err);
      setError(err instanceof Error ? err.message : 'Failed to load form');
      setPageState('error');
    }
  }

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    setOtpError('');
    setSending(true);

    try {
      const response = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to send verification code');
      }

      setPageState('code');
      if (data.dev_mode) setOtpError('📱 Dev mode: SMS blocked. Use code: 123456');
      // Focus the code input after state change
      setTimeout(() => codeInputRef.current?.focus(), 100);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setOtpError('');
    setVerifying(true);

    try {
      const response = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, name: name || undefined }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Invalid verification code');
      }

      if (data.applicant?.id) {
        setApplicantId(data.applicant.id);
      }

      // After OTP verification, check for existing draft before proceeding
      try {
        setCheckingDraft(true);
        const draftRes = await fetch(`/api/forms/${formId}/draft?phone=${encodeURIComponent(phone)}`);
        if (draftRes.ok) {
          const draftData: DraftData = await draftRes.json();
          if (draftData.submission_id) {
            setExistingDraft(draftData);
            // Use the applicant_id from the draft if we didn't get one from OTP
            if (!data.applicant?.id && draftData.applicant_id) {
              setApplicantId(draftData.applicant_id);
            }
            setPageState('resume_prompt');
            return;
          }
        }
      } catch (draftErr) {
        console.warn('[ApplyPage] Draft lookup failed, proceeding normally:', draftErr);
      } finally {
        setCheckingDraft(false);
      }

      // No draft found — show consent screens
      setPageState('esign_consent');
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }

  function handleESignConsent(consentData: ESignConsentRecord) {
    setEsignConsent(consentData);
    setPageState('staff_consent');
  }

  function handleStaffEditConsent(consentData: StaffEditConsentRecord) {
    setStaffEditConsent(consentData);
    setPageState('form');
  }

  async function handleSubmit(data: FormSubmissionData) {
    try {
      // Check if this is a CHW form — if so, extract chw_name/chw_phone from the
      // actual form field values (NOT the OTP login name, which is the person who logged in)
      const meta = (formDefinition as any)?.metadata || {};
      const fpkg = meta.form_package || (formDefinition as any)?.form_package || {};
      const chwNameFieldId = fpkg.chw_name_field || '';
      const chwPhoneFieldId = fpkg.chw_phone_field || '';

      // Pull CHW name/phone from the form data the user filled in
      const chwNameValue = chwNameFieldId ? (data[chwNameFieldId] || name) : '';
      const chwPhoneValue = chwPhoneFieldId ? (data[chwPhoneFieldId] || phone) : '';

      // FIX 2026-03-01: Use ref for submission ID (synchronous access prevents race conditions)
      const currentDraftId = draftIdRef.current || draftSubmissionId;

      const response = await fetch(`/api/forms/${formId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_data: data,
          applicant_id: applicantId,
          phone,
          // If we have a draft submission_id, pass it so the submit updates the existing record
          ...(currentDraftId ? { submission_id: currentDraftId } : {}),
          consent_records: {
            esignature: esignConsent,
            staff_edit: staffEditConsent,
          },
          // CHW fields from form data — stored on form_submissions for the submissions list
          ...(chwNameValue ? { chw_name: chwNameValue } : {}),
          ...(chwPhoneValue ? { chw_phone: chwPhoneValue } : {}),
        }),
      });

      // FIX 2026-03-01: Check response status — don't show success on server errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Submission failed (${response.status})`);
      }

      // Auto-grade if this form has grading metadata
      if (formDefinition) {
        const meta = (formDefinition as any).metadata || {};
        if (meta.auto_grade && meta.answer_key) {
          const sections = (formDefinition as any).sections || [];
          const result = gradeExam(meta, sections, data);
          if (result) setGradeResult(result);
        }
      }

      setPageState('submitted');

      // Generate certificate for training courses (fire-and-forget)
      const certMeta = formDefinition ? (formDefinition as any).metadata || {} : {};
      const hasCertConfig = certMeta.certificate_config?.enabled;
      const submissionId = draftIdRef.current || draftSubmissionId;
      if (hasCertConfig && submissionId) {
        setCertificateLoading(true);
        fetch('/api/certificates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submission_id: submissionId }),
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.pdf_url) {
              setCertificateUrl(result.pdf_url);
            }
          })
          .catch((err) => console.error('Certificate generation failed:', err))
          .finally(() => setCertificateLoading(false));
      }
    } catch (err) {
      console.error('Submit error:', err);
      // Don't transition to submitted on error — let the wizard show the error
      throw err;
    }
  }

  async function handleSaveDraft(data: FormSubmissionData, currentStep: number) {
    // FIX 2026-03-01: Guard against overlapping save requests from rapid Next clicks.
    // Without this, two concurrent saves could both see draftSubmissionId as null and
    // create duplicate submissions in Supabase.
    if (savingDraftRef.current) return;
    savingDraftRef.current = true;

    try {
      const res = await fetch(`/api/forms/${formId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_data: data,
          applicant_id: applicantId,
          status: 'draft',
          // Use ref for synchronous access — state may be stale during rapid saves
          submission_id: draftIdRef.current || draftSubmissionId || undefined,
          current_step: currentStep,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        // Store the submission_id for subsequent upserts (ref + state)
        if (result.submission_id && !draftIdRef.current) {
          draftIdRef.current = result.submission_id;
          setDraftSubmissionId(result.submission_id);
        }
      }
    } catch (err) {
      console.warn('[ApplyPage] Draft auto-save failed:', err);
    } finally {
      savingDraftRef.current = false;
    }
  }

  function handleResumeDraft() {
    if (existingDraft) {
      draftIdRef.current = existingDraft.submission_id;
      setDraftSubmissionId(existingDraft.submission_id);
    }
    // Skip consent screens — they were already accepted when the draft was created
    setPageState('form');
  }

  function handleStartOver() {
    setExistingDraft(null);
    setPageState('esign_consent');
  }

  // Loading
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  // Error
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Form Unavailable</h1>
          <p className="text-gray-600">{error || 'This form could not be loaded.'}</p>
        </div>
      </div>
    );
  }

  // Phone input step
  if (pageState === 'phone') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8 text-teal-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">
              {formDefinition?.form_name || 'Verify Your Identity'}
            </h1>
            <p className="text-sm text-gray-500">
              Enter your phone number to receive a verification code
            </p>
          </div>

          <form onSubmit={handleSendOTP} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-lg text-gray-900 placeholder:text-gray-400"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-lg text-gray-900 placeholder:text-gray-400"
                required
                autoFocus
              />
            </div>

            {otpError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {otpError}
              </div>
            )}

            <button
              type="submit"
              disabled={sending || !phone.trim() || !name.trim()}
              className="w-full py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {sending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending Code...
                </>
              ) : (
                'Send Verification Code'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Code verification step
  if (pageState === 'code') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-teal-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">Enter Verification Code</h1>
            <p className="text-sm text-gray-500">
              We sent a code to <span className="font-medium text-gray-700">{phone}</span>
            </p>
          </div>

          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div>
              <input
                ref={codeInputRef}
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit code"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-center text-2xl tracking-widest font-mono text-gray-900 placeholder:text-gray-400 placeholder:text-base placeholder:tracking-normal"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </div>

            {otpError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {otpError}
              </div>
            )}

            <button
              type="submit"
              disabled={verifying || code.length < 4}
              className="w-full py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Continue'
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setCode('');
                  setOtpError('');
                  setPageState('phone');
                }}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium"
              >
                Change phone number
              </button>
              <span className="mx-2 text-gray-300">|</span>
              <button
                type="button"
                onClick={() => {
                  setCode('');
                  setOtpError('');
                  handleSendOTP({ preventDefault: () => {} } as React.FormEvent);
                }}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium"
              >
                Resend code
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // E-Signature Consent Screen
  if (pageState === 'esign_consent') {
    return (
      <ESignatureConsent
        onConsent={handleESignConsent}
        applicantName={name}
        phone={phone}
      />
    );
  }

  // Staff Edit Consent Screen
  if (pageState === 'staff_consent') {
    return (
      <StaffEditConsent
        onConsent={handleStaffEditConsent}
        applicantName={name}
        phone={phone}
      />
    );
  }

  // Resume Draft Prompt
  if (pageState === 'resume_prompt' && existingDraft) {
    const savedDate = new Date(existingDraft.updated_at);
    const dateStr = savedDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-teal-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              Welcome Back!
            </h1>
            <p className="text-sm text-gray-600">
              We found a saved draft from <span className="font-medium text-gray-800">{dateStr}</span>. Would you like to continue where you left off?
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleResumeDraft}
              className="w-full py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors"
            >
              Resume Draft
            </button>
            <button
              onClick={handleStartOver}
              className="w-full py-3 bg-white text-gray-700 rounded-lg font-semibold border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Submitted
  if (pageState === 'submitted') {
    const meta = formDefinition ? (formDefinition as any).metadata || {} : {};
    const retakeEnabled = meta.retake_enabled && gradeResult && !gradeResult.passed;
    const tutorialSections: { title: string; content: string }[] = meta.retake_tutorial || [];

    // If the applicant failed and retake is enabled, show the tutorial + retake flow
    if (retakeEnabled && tutorialSections.length > 0) {
      return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Score Card */}
            <div className="bg-white rounded-xl shadow-lg p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Your Test Has Been Submitted</h1>
              <p className="text-gray-600 mb-4">
                Unfortunately, you did not achieve the passing score. Please review the study material below and you may retake the quiz.
              </p>
              <ExamGradeDisplay result={gradeResult!} showDetails={false} />
            </div>

            {/* Tutorial Study Material */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="px-6 py-4 bg-teal-600 text-white flex items-center gap-3">
                <BookOpen className="w-5 h-5 flex-shrink-0" />
                <div>
                  <h2 className="text-lg font-semibold">Study Material</h2>
                  <p className="text-teal-100 text-sm">Review these key concepts before retaking the quiz</p>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {tutorialSections.map((section, idx) => (
                  <details key={idx} className="group">
                    <summary className="px-6 py-3 cursor-pointer flex items-center justify-between hover:bg-gray-50 transition-colors list-none">
                      <span className="font-medium text-gray-800 text-sm flex items-center gap-2">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        {section.title}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
                    </summary>
                    <div className="px-6 pb-4 pl-14">
                      <p className="text-sm text-gray-600 leading-relaxed">{section.content}</p>
                    </div>
                  </details>
                ))}
              </div>
            </div>

            {/* Retake Button */}
            <div className="bg-white rounded-xl shadow-lg p-6 text-center">
              <p className="text-gray-600 text-sm mb-4">
                Once you have reviewed the study material, you may retake the competency test.
              </p>
              <button
                onClick={() => {
                  // Reset state for a fresh submission
                  draftIdRef.current = null;
                  setDraftSubmissionId(null);
                  setExistingDraft(null);
                  setGradeResult(null);
                  setPageState('form');
                }}
                className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retake Quiz
              </button>
              <p className="text-xs text-gray-400 mt-3">
                Your previous submission has been saved. A new submission will be created for this attempt.
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Check if this is a training course with certificate
    const isCertificateCourse = meta.certificate_config?.enabled;

    // Normal success screen (passed or no grading)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            {isCertificateCourse ? (
              <Award className="w-10 h-10 text-green-600" />
            ) : (
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            {isCertificateCourse ? 'Congratulations!' : 'Thank You!'}
          </h1>
          <p className="text-gray-600 mb-2">
            {isCertificateCourse
              ? 'You have successfully completed the training course.'
              : 'Your form has been submitted successfully.'}
          </p>

          {/* Auto-grading results (caregiver view — no question details) */}
          {gradeResult && !isCertificateCourse && (
            <div className="mt-6 text-left">
              <h2 className="text-lg font-semibold text-gray-800 mb-3 text-center">Your Test Results</h2>
              <ExamGradeDisplay result={gradeResult} showDetails={false} />
            </div>
          )}

          {/* Certificate download for training courses */}
          {isCertificateCourse && (
            <div className="mt-6">
              {certificateLoading ? (
                <div className="flex items-center justify-center gap-2 text-gray-500 py-3">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Generating your certificate...</span>
                </div>
              ) : certificateUrl ? (
                <a
                  href={certificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors shadow-md"
                >
                  <Download className="w-5 h-5" />
                  Download Certificate
                </a>
              ) : (
                <p className="text-sm text-gray-400">
                  Your certificate will be available from the office portal.
                </p>
              )}
            </div>
          )}

          <p className="text-sm text-gray-400 mt-4">
            {isCertificateCourse
              ? 'A copy of your certificate has been saved to your file.'
              : 'The office will review your submission and be in touch.'}
          </p>
        </div>
      </div>
    );
  }

  // Form (after OTP verification and consent)
  if (!formDefinition) return null;

  // ── Replica Mode: PDFReplicaForm ──────────────────────────────────
  if (isReplicaMode && packetData) {
    return (
      <PDFReplicaForm
        definition={{
          ...formDefinition,
          ...((formDefinition as any).metadata?.section_group_order && {
            section_group_order: (formDefinition as any).metadata.section_group_order,
          }),
        }}
        pdfBase64={packetData.pdfBase64}
        fieldPositionMap={packetData.fieldPositionMap}
        pageSizes={packetData.pageSizes}
        applicantData={{ name: name || undefined, phone: phone || undefined }}
        onSubmit={handleSubmit}
        brandColors={{
          primary: '#0f766e',
          secondary: '#1e40af',
          accent: '#ea580c',
        }}
      />
    );
  }

  // ── Generated Mode: MobileFormWizard ──────────────────────────────
  // Pre-fill phone and name fields from OTP verification to avoid duplicate entry.
  // ONLY fill the applicant's own fields — not references, employers, emergency contacts, etc.
  // Also pre-fill CHW name/phone fields from the OTP data (for CHW forms).
  const prefillData: FormSubmissionData = {};

  // IDs of the applicant's own phone/name fields (from the Personal Information section)
  const APPLICANT_PHONE_IDS = new Set(['phone', 'contact_phone', 'home_phone', 'cell_phone', 'ei_phone', 'ei_cell_phone']);
  // Reference/employer/emergency/other-entity prefixes to exclude
  const EXCLUDE_PREFIXES = ['ref1_', 'ref2_', 'ref3_', 'emp1_', 'emp2_', 'emp3_', 'ec1_', 'ec2_', 'ec_'];

  // Check for CHW name/phone field mappings in form metadata
  const formMeta = (formDefinition as any).metadata || {};
  const formPkg = formMeta.form_package || (formDefinition as any).form_package || {};
  const chwNameField = formPkg.chw_name_field || '';
  const chwPhoneField = formPkg.chw_phone_field || '';

  for (const section of formDefinition.sections) {
    for (const field of section.fields || []) {
      const fid = field.field_id || '';

      // Skip fields belonging to other entities (references, employers, emergency contacts, etc.)
      const isExcludedPrefix = EXCLUDE_PREFIXES.some(p => fid.startsWith(p));
      if (isExcludedPrefix) continue;

      // CHW name pre-fill: fill the CHW name field from OTP name
      if (name && (fid === chwNameField || fid === 'chw_name')) {
        prefillData[fid] = name;
      }

      // CHW phone pre-fill: fill the CHW phone field from OTP phone
      if (phone && (fid === chwPhoneField || fid === 'chw_phone')) {
        prefillData[fid] = phone;
      }

      // Phone: fill the applicant's own phone field AND any auto-fill source phone fields
      if (phone && (APPLICANT_PHONE_IDS.has(fid) || fid.endsWith('__phone'))) {
        prefillData[fid] = phone;
      }

      // Name: fill first_name, last_name, and any full_name source fields
      // The OTP name is a full name — split into first/last if possible
      if (name && field.type === 'text') {
        const nameParts = name.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

        if (fid === 'first_name' && firstName) {
          prefillData[fid] = firstName;
        } else if (fid === 'last_name' && lastName) {
          prefillData[fid] = lastName;
        }

        // Pre-fill any "full_name" fields that serve as auto-fill sources
        // (e.g. orientation_attendance__full_name) so propagation works on load
        if (fid.endsWith('__full_name') || fid === 'full_name') {
          prefillData[fid] = name.trim();
        }
      }
    }
  }

  // Merge prefill data with draft data.
  // FIX 2026-03-01: Fresh OTP name/phone should override stale draft values for identity fields.
  // Draft data takes priority for all OTHER fields (the user's in-progress work).
  const draftFormData = existingDraft?.form_data || {};
  // Strip _draft_metadata from form data before passing to wizard
  const { _draft_metadata, ...cleanDraftData } = draftFormData as any;

  // Build set of identity field IDs that should always use fresh OTP data
  const otpOverrideFields = new Set<string>();
  for (const key of Object.keys(prefillData)) {
    if (
      key === 'first_name' || key === 'last_name' || key === 'full_name' ||
      key.endsWith('__full_name') || key.endsWith('__phone') ||
      APPLICANT_PHONE_IDS.has(key)
    ) {
      otpOverrideFields.add(key);
    }
  }

  const mergedInitialData: FormSubmissionData = {
    ...prefillData,
    // Draft data takes priority for non-identity fields
    ...(Object.fromEntries(
      Object.entries(cleanDraftData).filter(([k, v]) =>
        v !== null && v !== undefined && v !== '' && !otpOverrideFields.has(k)
      )
    ) as FormSubmissionData),
  };

  return (
    <MobileFormWizard
      definition={{
        ...formDefinition,
        ...((formDefinition as any).metadata?.section_group_order && {
          section_group_order: (formDefinition as any).metadata.section_group_order,
        }),
      }}
      initialData={Object.keys(mergedInitialData).length > 0 ? mergedInitialData : undefined}
      initialStep={existingDraft ? existingDraft.current_step : 0}
      submissionId={draftSubmissionId || undefined}
      applicantId={applicantId || undefined}
      showDocumentUpload={!(formDefinition as any)?.metadata?.hide_document_uploads}
      documentTypes={(formDefinition as any)?.metadata?.document_types}
      onSubmit={handleSubmit}
      onSaveDraft={handleSaveDraft}
      brandColors={{
        primary: '#0f766e',
        secondary: '#1e40af',
        accent: '#ea580c',
      }}
    />
  );
}
