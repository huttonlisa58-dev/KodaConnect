'use client';

/**
 * PDFReplicaForm — renders PDF pages as canvas images with interactive field overlays.
 *
 * 2026-02-27 UX improvements:
 *  1. Auto-fill name/phone from applicant data (screen 1 → screen 2)
 *  2. No save draft button (controlled by parent not passing onSaveDraft)
 *  3. Submit button gated on form completion (election choice + signature)
 *  4. Checkbox mutual exclusion: decline ↔ enroll branches
 *  5. Date auto-fill with today's date (default_today flag in JSON)
 *  6. Signature alignment fix (left-align instead of center)
 *  7. Landscape page rendering with horizontal scroll
 *
 * 2026-03-07 UX improvements:
 *  8. Auto-fill signatures: sign once, apply to all signature fields
 *  9. Enhanced name/phone auto-fill by field_id pattern matching
 * 10. Missing fields indicator: clickable helper showing which fields are incomplete
 * 11. Improved field readability: thicker borders, blue empty state, larger font
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  Save,
  Send,
  PenLine,
  Info,
  X,
} from 'lucide-react';
import { FormDefinition, FormSubmissionData, FormField, validateForm, calculateFormCompletion, getAllFields, isStaffField } from '@/lib/form-engine';
import { bottomLeftToTopLeft, getPageHeight } from '@/lib/coordinate-utils';
import SignatureCanvas from './SignatureCanvas';
import { SignatureSecurityMetadata } from '@/lib/esignature-security';

// ─── Types ─────────────────────────────────────────────────────────

export interface FieldPositionInfo {
  label: string;
  positions: Array<{
    page: number;    // 0-indexed for pdf-lib
    x: number;       // bottom-left coordinates
    y: number;
    width: number;
    height: number;
    font_size?: number;
  }>;
}

interface PDFReplicaFormProps {
  definition: FormDefinition;
  pdfBase64: string;
  fieldPositionMap: Record<string, FieldPositionInfo>;
  pageSizes?: Record<string, [number, number]>;
  initialData?: FormSubmissionData;
  applicantData?: { name?: string; phone?: string };
  onSubmit: (data: FormSubmissionData) => Promise<void>;
  onSaveDraft?: (data: FormSubmissionData) => Promise<void>;
  readOnly?: boolean;
  brandColors?: { primary?: string; secondary?: string; accent?: string };
}

// Default US Letter dimensions in PDF points
const DEFAULT_PAGE_HEIGHT = 792;
const DEFAULT_PAGE_WIDTH = 612;

// ─── Election checkbox field ID helpers ─────────────────────────────

const isDeclineField = (id: string) => id === 'elect_decline';
const isEnrollField = (id: string) => id === 'elect_enroll';
const isCoverageReasonField = (id: string) => id.startsWith('cov_');
const isPlanSelectionField = (id: string) => id.startsWith('plan_');

// ─── Component ─────────────────────────────────────────────────────

export default function PDFReplicaForm({
  definition,
  pdfBase64,
  fieldPositionMap,
  pageSizes = {},
  initialData,
  applicantData,
  onSubmit,
  onSaveDraft,
  readOnly = false,
  brandColors,
}: PDFReplicaFormProps) {
  // PDF state
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Form state — built from initialData + auto-fill
  const [formData, setFormData] = useState<FormSubmissionData>(() => {
    const data: FormSubmissionData = { ...(initialData || {}) };
    return data;
  });
  const [errors, setErrors] = useState<Array<{ field_id: string; message: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Signature modal + e-signature security metadata
  const [signatureField, setSignatureField] = useState<string | null>(null);
  const [sigMetadata, setSigMetadata] = useState<SignatureSecurityMetadata | null>(null);

  // Signature auto-fill: store first signature to offer reuse
  const firstSignatureRef = useRef<string | null>(null);
  const [showSignaturePrompt, setShowSignaturePrompt] = useState(false);
  const pendingSignatureFieldRef = useRef<string | null>(null);

  // Missing fields indicator
  const [showMissingFields, setShowMissingFields] = useState(false);

  // Build field-to-page mapping (convert from 0-indexed to 1-indexed)
  const fieldsByPage = useCallback(() => {
    const map: Record<number, Array<{ fieldId: string; field: FieldPositionInfo; pos: FieldPositionInfo['positions'][0] }>> = {};

    for (const [fieldId, fieldInfo] of Object.entries(fieldPositionMap)) {
      for (const pos of fieldInfo.positions) {
        const pageNum = pos.page + 1; // Convert 0-indexed to 1-indexed
        if (!map[pageNum]) map[pageNum] = [];
        map[pageNum].push({ fieldId, field: fieldInfo, pos });
      }
    }

    return map;
  }, [fieldPositionMap]);

  // Get all form fields for validation
  const allFields = getAllFields(definition);

  // Field type lookup
  const fieldTypeMap = useCallback(() => {
    const map: Record<string, string> = {};
    for (const field of allFields) {
      map[field.field_id] = field.type;
    }
    return map;
  }, [allFields]);

  // Field definition lookup (for signer_role checks, etc.)
  const fieldDefMap = useMemo(() => {
    const map: Record<string, FormField> = {};
    for (const field of allFields) {
      map[field.field_id] = field;
    }
    return map;
  }, [allFields]);

  // ─── Auto-fill: name, phone, date (runs once on mount) ─────────
  // 2026-03-07: Enhanced with field_id pattern matching for name/phone

  // Prefixes to exclude from name/phone auto-fill (references, employers, emergency contacts)
  const EXCLUDED_PREFIXES = ['ref1_', 'ref2_', 'ref3_', 'emp1_', 'emp2_', 'emp3_', 'ec1_', 'ec2_', 'ec_'];

  const isExcludedField = (fieldId: string) =>
    EXCLUDED_PREFIXES.some(prefix => fieldId.startsWith(prefix));

  // Patterns that indicate a name field
  const NAME_PATTERNS = ['employee_name', 'print_name', 'full_name', 'applicant_name', 'name_print', 'employee_print'];
  const FIRST_NAME_PATTERNS = ['first_name', 'given_name', 'fname'];
  const LAST_NAME_PATTERNS = ['last_name', 'family_name', 'lname', 'surname'];
  const PHONE_PATTERNS = ['employee_phone', 'home_phone', 'cell_phone', 'contact_phone', 'applicant_phone', 'telephone'];

  useEffect(() => {
    const prefill: FormSubmissionData = {};
    const types = fieldTypeMap();
    const applicantName = applicantData?.name || '';
    const applicantPhone = applicantData?.phone || '';
    const nameParts = applicantName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    for (const field of allFields) {
      const fid = field.field_id;
      const fidLower = fid.toLowerCase();

      // Skip excluded fields (references, employers, emergency contacts)
      if (isExcludedField(fidLower)) continue;

      // Auto-fill name from applicant data — by auto_fill_from tag OR by field_id pattern
      if (applicantName) {
        if (field.auto_fill_from === 'full_name' || NAME_PATTERNS.some(p => fidLower.includes(p))) {
          prefill[fid] = applicantName;
        } else if (FIRST_NAME_PATTERNS.some(p => fidLower.includes(p))) {
          prefill[fid] = firstName;
        } else if (LAST_NAME_PATTERNS.some(p => fidLower.includes(p))) {
          prefill[fid] = lastName;
        }
      }

      // Auto-fill phone from applicant data — by type OR by field_id pattern
      if (applicantPhone) {
        if (field.type === 'phone' || PHONE_PATTERNS.some(p => fidLower.includes(p))) {
          prefill[fid] = applicantPhone;
        }
      }
    }

    // Auto-fill ALL date fields with today's date.
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    for (const [fieldId, fieldType] of Object.entries(types)) {
      if (fieldType === 'date') {
        prefill[fieldId] = todayStr;
      }
    }

    if (Object.keys(prefill).length > 0) {
      setFormData(prev => ({ ...prefill, ...prev }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── PDF Loading ───────────────────────────────────────────────

  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      setError('');
      try {
        const pdfjsLib = await import('pdfjs-dist');
        // Use self-hosted worker to comply with Vercel CSP (script-src 'self')
        if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }

        // Clean base64: strip data: URI prefix and any whitespace/newlines
        let cleanBase64 = pdfBase64;
        if (cleanBase64.startsWith('data:')) {
          cleanBase64 = cleanBase64.split(',')[1] || cleanBase64;
        }
        cleanBase64 = cleanBase64.replace(/[\s\r\n]/g, '');

        // Decode base64 to Uint8Array
        const binaryString = atob(cleanBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const doc = await pdfjsLib.getDocument({
          data: bytes,
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true,
          disableAutoFetch: true,
        }).promise;

        setPdfDoc(doc);
        setTotalPages(doc.numPages);
      } catch (err: any) {
        console.error('Failed to load PDF:', err);
        console.error('PDF error details:', err?.message || err?.name || 'unknown');
        console.error('PDF base64 length:', pdfBase64?.length, 'first 50 chars:', pdfBase64?.substring(0, 50));
        setError('Failed to load PDF template');
      } finally {
        setLoading(false);
      }
    };

    if (pdfBase64) loadPdf();
  }, [pdfBase64]);

  // ─── Page Rendering ────────────────────────────────────────────

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);

        // Get page dimensions to calculate proper scale
        const defaultViewport = page.getViewport({ scale: 1 });
        const pageWidth = defaultViewport.width;
        const pageHeight = defaultViewport.height;
        const isLandscape = pageWidth > pageHeight;

        // Scale calculation:
        // - Portrait pages: fit to container width (max 700px or screen width)
        // - Landscape pages: render at a readable scale with horizontal scroll.
        const containerWidth = Math.min(700, window.innerWidth - 32);
        let computedScale: number;

        if (isLandscape) {
          const heightBasedScale = (window.innerHeight * 0.7) / pageHeight;
          computedScale = Math.max(1.5, heightBasedScale);
        } else {
          computedScale = containerWidth / pageWidth;
        }

        const viewport = page.getViewport({ scale: computedScale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        setScale(computedScale);

        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;
      } catch (err) {
        console.error('Failed to render page:', err);
      }
    };

    renderPage();
  }, [pdfDoc, currentPage]);

  // ─── Checkbox election logic ──────────────────────────────────

  // Derive election state from formData
  const isDeclineChecked = !!formData['elect_decline'];
  const isEnrollChecked = !!formData['elect_enroll'];

  // Determine which checkboxes should be disabled
  const isFieldDisabled = (fieldId: string): boolean => {
    if (readOnly) return true;

    // If decline is checked: disable enroll + all plan options
    if (isDeclineChecked) {
      if (isEnrollField(fieldId)) return true;
      if (isPlanSelectionField(fieldId)) return true;
    }

    // If enroll is checked: disable decline + all coverage reasons
    if (isEnrollChecked) {
      if (isDeclineField(fieldId)) return true;
      if (isCoverageReasonField(fieldId)) return true;
    }

    // If neither parent is checked: disable all sub-checkboxes
    if (!isDeclineChecked && !isEnrollChecked) {
      if (isCoverageReasonField(fieldId)) return true;
      if (isPlanSelectionField(fieldId)) return true;
    }

    return false;
  };

  // ─── Form Handlers ─────────────────────────────────────────────

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData(prev => {
      const next = { ...prev, [fieldId]: value };

      // ── Election checkbox mutual exclusion ──
      if (isDeclineField(fieldId) && value === true) {
        // User chose to decline → clear enroll + all plan selections
        next['elect_enroll'] = false;
        for (const key of Object.keys(prev)) {
          if (isPlanSelectionField(key)) next[key] = false;
        }
      } else if (isDeclineField(fieldId) && value === false) {
        // User unchecked decline → also clear coverage reasons
        for (const key of Object.keys(prev)) {
          if (isCoverageReasonField(key)) next[key] = false;
        }
      }

      if (isEnrollField(fieldId) && value === true) {
        // User chose to enroll → clear decline + all coverage reasons
        next['elect_decline'] = false;
        for (const key of Object.keys(prev)) {
          if (isCoverageReasonField(key)) next[key] = false;
        }
      } else if (isEnrollField(fieldId) && value === false) {
        // User unchecked enroll → also clear plan selections
        for (const key of Object.keys(prev)) {
          if (isPlanSelectionField(key)) next[key] = false;
        }
      }

      // ── Plan tier single-select: only one plan can be chosen ──
      if (isPlanSelectionField(fieldId) && value === true) {
        for (const key of Object.keys(prev)) {
          if (isPlanSelectionField(key) && key !== fieldId) {
            next[key] = false;
          }
        }
      }

      return next;
    });

    // Clear field error
    setErrors(prev => prev.filter(e => e.field_id !== fieldId));
  };

  // ─── Submit validation ──────────────────────────────────────────

  // Check if enough fields are filled to allow submission
  const canSubmit = (() => {
    // Only enforce election choice if this form has election fields
    const hasElectionFields = allFields.some(f => isDeclineField(f.field_id) || isEnrollField(f.field_id));
    if (hasElectionFields) {
      // Must have chosen decline or enroll
      if (!formData['elect_decline'] && !formData['elect_enroll']) return false;

      // If enrolled, must have selected a plan tier
      if (formData['elect_enroll']) {
        const hasSelectedPlan = Object.keys(formData).some(
          k => isPlanSelectionField(k) && formData[k] === true
        );
        if (!hasSelectedPlan) return false;
      }
    }

    // Must have at least one applicant signature (if form has applicant signature fields)
    // Staff signature fields (rn_evaluator, hr_admin) are excluded — they're filled in Review & Sign mode.
    const applicantSignatureFields = allFields.filter(f => f.type === 'signature' && !isStaffField(f));
    if (applicantSignatureFields.length > 0) {
      const hasSignature = applicantSignatureFields.some(
        f => formData[f.field_id] && typeof formData[f.field_id] === 'string' && (formData[f.field_id] as string).length > 0
      );
      if (!hasSignature) return false;
    }

    return true;
  })();

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const validationErrors = validateForm(definition, formData);
    if (validationErrors.length > 0) {
      setErrors(validationErrors.map(e => ({ field_id: e.field_id, message: e.message })));
      // Navigate to page with first error
      const firstErrorField = validationErrors[0].field_id;
      const pages = fieldsByPage();
      for (const [pageNum, fields] of Object.entries(pages)) {
        if (fields.some(f => f.fieldId === firstErrorField)) {
          setCurrentPage(Number(pageNum));
          break;
        }
      }
      return;
    }

    setIsSubmitting(true);
    try {
      // Include e-signature security metadata in submission data
      const dataWithMeta = { ...formData };
      if (sigMetadata) {
        dataWithMeta['__esign_metadata'] = JSON.stringify(sigMetadata);
      }
      await onSubmit(dataWithMeta);
      setSubmitSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit form');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!onSaveDraft) return;
    setIsSaving(true);
    try {
      await onSaveDraft(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Completion + Missing Fields ─────────────────────────────────

  const completion = calculateFormCompletion(definition, formData);
  const primaryColor = brandColors?.primary || '#0d9488'; // teal-600

  // Build list of missing required fields with their page locations
  const getMissingFields = useCallback(() => {
    const missing: Array<{ fieldId: string; label: string; pageNumber: number }> = [];
    const pages = fieldsByPage();

    for (const section of definition.sections) {
      if ((section as any).hidden_from_applicant) continue;
      for (const field of section.fields) {
        if ((field as any).hidden) continue;
        if (isStaffField(field)) continue; // Staff fields not shown to applicants
        if (!field.required) continue;
        if (field.show_if) {
          const condValue = formData[field.show_if.field];
          if (condValue !== field.show_if.equals) continue;
        }

        const value = formData[field.field_id];
        let isComplete = false;
        switch (field.type) {
          case 'checkbox':
            isComplete = value === true;
            break;
          case 'checkbox_group':
          case 'checkbox_grid':
            isComplete = Array.isArray(value) ? value.some(v => v) : Object.values(value || {}).some(v => v);
            break;
          default:
            isComplete = value !== null && value !== undefined && value !== '';
        }

        if (!isComplete) {
          // Find which page this field is on
          let pageNumber = 1;
          for (const [pageNum, fields] of Object.entries(pages)) {
            if (fields.some(f => f.fieldId === field.field_id)) {
              pageNumber = Number(pageNum);
              break;
            }
          }
          missing.push({ fieldId: field.field_id, label: field.label, pageNumber });
        }
      }
    }
    return missing;
  }, [definition, formData, fieldsByPage]);

  const missingFields = completion < 100 ? getMissingFields() : [];

  // ─── Get fields for current page ──────────────────────────────

  const currentPageFields = fieldsByPage()[currentPage] || [];

  // ─── Render field input ───────────────────────────────────────

  const renderFieldInput = (
    fieldId: string,
    pos: FieldPositionInfo['positions'][0],
    label: string
  ) => {
    const types = fieldTypeMap();
    const fieldType = types[fieldId] || 'text';
    const value = formData[fieldId] || '';
    const hasError = errors.some(e => e.field_id === fieldId);
    const pageHeight = getPageHeight(currentPage, pageSizes) || DEFAULT_PAGE_HEIGHT;

    // ── Staff-role field placeholder (applicant view) ──────────────
    // Fields assigned to rn_evaluator or hr_admin are not editable by applicants.
    // Show a gray dashed placeholder box instead of an interactive input.
    const fieldDef = fieldDefMap[fieldId];
    if (fieldDef && isStaffField(fieldDef)) {
      const topLeftPos = bottomLeftToTopLeft(pos.x, pos.y, pos.width, pos.height, pageHeight);
      const roleLabel = fieldDef.signer_role === 'hr_admin'
        ? 'To be completed by employer'
        : 'Pending RN signature';
      return (
        <div
          key={fieldId}
          style={{
            position: 'absolute',
            left: `${topLeftPos.x * scale}px`,
            top: `${topLeftPos.y * scale}px`,
            width: `${topLeftPos.width * scale}px`,
            height: `${topLeftPos.height * scale}px`,
            zIndex: 10,
            border: '2px dashed #d1d5db',
            borderRadius: '3px',
            backgroundColor: 'rgba(243, 244, 246, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px',
          }}
          title={`${label} — ${roleLabel}`}
        >
          <span style={{
            fontSize: `${Math.max(8, Math.min(11, topLeftPos.height * scale * 0.45))}px`,
            color: '#9ca3af',
            textAlign: 'center',
            lineHeight: '1.2',
            userSelect: 'none',
          }}>
            {roleLabel}
          </span>
        </div>
      );
    }

    // Convert bottom-left → top-left for rendering
    const topLeftPos = bottomLeftToTopLeft(pos.x, pos.y, pos.width, pos.height, pageHeight);

    const style: React.CSSProperties = {
      position: 'absolute',
      left: `${topLeftPos.x * scale}px`,
      top: `${topLeftPos.y * scale}px`,
      width: `${topLeftPos.width * scale}px`,
      height: `${topLeftPos.height * scale}px`,
      zIndex: 10,
    };

    // 2026-03-07: Improved readability — thicker borders, visible blue tint for empty fields, larger font min
    const isEmpty = !value || value === '';
    const inputStyle: React.CSSProperties = {
      width: '100%',
      height: '100%',
      border: hasError ? '2px solid #ef4444' : '2px solid rgba(59, 130, 246, 0.5)',
      borderRadius: '3px',
      backgroundColor: hasError
        ? 'rgba(239, 68, 68, 0.05)'
        : isEmpty
          ? 'rgba(219, 234, 254, 0.7)' // light blue for empty fields — easier to spot
          : 'rgba(255, 255, 255, 0.92)',
      padding: '2px 4px',
      fontSize: `${Math.max(13, Math.min(16, topLeftPos.height * scale * 0.65))}px`,
      outline: 'none',
      color: '#1f2937',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    };

    if (readOnly) {
      inputStyle.backgroundColor = 'transparent';
      inputStyle.border = 'none';
      inputStyle.cursor = 'default';
    }

    // Minimum touch target size for checkboxes (px)
    const minCheckSize = 18;

    switch (fieldType) {
      case 'checkbox': {
        const disabled = isFieldDisabled(fieldId);
        const checkSize = Math.max(minCheckSize, Math.min(topLeftPos.width, topLeftPos.height) * scale);
        return (
          <div key={fieldId} style={{...style, display: 'flex', alignItems: 'center', justifyContent: 'center'}} title={label}>
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => handleFieldChange(fieldId, e.target.checked)}
              disabled={disabled}
              style={{
                width: `${checkSize}px`,
                height: `${checkSize}px`,
                cursor: disabled ? 'not-allowed' : 'pointer',
                accentColor: primaryColor,
                minWidth: `${minCheckSize}px`,
                minHeight: `${minCheckSize}px`,
                opacity: disabled ? 0.35 : 1,
              }}
            />
          </div>
        );
      }

      case 'radio': {
        const disabled = isFieldDisabled(fieldId);
        const radioSize = Math.max(minCheckSize, Math.min(topLeftPos.width, topLeftPos.height) * scale);
        return (
          <div key={fieldId} style={{...style, display: 'flex', alignItems: 'center', justifyContent: 'center'}} title={label}>
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => handleFieldChange(fieldId, e.target.checked)}
              disabled={disabled}
              style={{
                width: `${radioSize}px`,
                height: `${radioSize}px`,
                cursor: disabled ? 'not-allowed' : 'pointer',
                borderRadius: '50%',
                accentColor: primaryColor,
                minWidth: `${minCheckSize}px`,
                minHeight: `${minCheckSize}px`,
                opacity: disabled ? 0.35 : 1,
              }}
            />
          </div>
        );
      }

      case 'signature':
        return (
          <div key={fieldId} style={style} title={label}>
            {value ? (
              <div
                onClick={() => !readOnly && setSignatureField(fieldId)}
                style={{
                  ...inputStyle,
                  cursor: readOnly ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                }}
              >
                <img
                  src={value as string}
                  alt="Signature"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </div>
            ) : (
              <button
                onClick={() => !readOnly && setSignatureField(fieldId)}
                disabled={readOnly}
                style={{
                  ...inputStyle,
                  cursor: readOnly ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  color: '#6b7280',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                }}
              >
                <PenLine style={{ width: '12px', height: '12px' }} />
                <span style={{ fontSize: '10px' }}>Sign</span>
              </button>
            )}
          </div>
        );

      case 'date':
        return (
          <div key={fieldId} style={style} title={label}>
            <input
              type="date"
              value={value as string}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              disabled={readOnly}
              style={inputStyle}
            />
          </div>
        );

      case 'textarea':
        return (
          <div key={fieldId} style={style} title={label}>
            <textarea
              value={value as string}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              disabled={readOnly}
              style={{ ...inputStyle, resize: 'none', overflow: 'hidden' }}
            />
          </div>
        );

      default: // text, email, phone, number
        return (
          <div key={fieldId} style={style} title={label}>
            <input
              type={fieldType === 'email' ? 'email' : fieldType === 'phone' ? 'tel' : fieldType === 'number' ? 'number' : 'text'}
              value={value as string}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
              disabled={readOnly}
              style={inputStyle}
              placeholder=""
            />
          </div>
        );
    }
  };

  // ─── Success Screen ────────────────────────────────────────────

  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border p-8 max-w-md text-center">
          <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: primaryColor }} />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Form Submitted!</h2>
          <p className="text-gray-600">Your responses have been recorded successfully.</p>
        </div>
      </div>
    );
  }

  // ─── Loading Screen ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: primaryColor }} />
          <p className="text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  // ─── Error Screen ──────────────────────────────────────────────

  if (error && !pdfDoc) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Form</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  // ─── Main Render ───────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Progress Bar + Missing Fields Indicator */}
      <div className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2 relative">
              <span className="text-sm font-medium" style={{ color: primaryColor }}>
                {Math.round(completion)}% Complete
              </span>
              {missingFields.length > 0 && (
                <button
                  onClick={() => setShowMissingFields(!showMissingFields)}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full"
                >
                  <Info className="w-3 h-3" />
                  {missingFields.length} missing
                </button>
              )}
              {/* Missing Fields Dropdown */}
              {showMissingFields && missingFields.length > 0 && (
                <div className="absolute top-full right-0 mt-2 w-72 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-[60]">
                  <div className="sticky top-0 bg-white px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">Missing Required Fields</span>
                    <button onClick={() => setShowMissingFields(false)} className="p-0.5 hover:bg-gray-100 rounded">
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                  {missingFields.map((mf) => (
                    <button
                      key={mf.fieldId}
                      onClick={() => {
                        setCurrentPage(mf.pageNumber);
                        setShowMissingFields(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-center justify-between"
                    >
                      <span className="text-gray-700 truncate mr-2">{mf.label}</span>
                      <span className="text-gray-400 flex-shrink-0">Page {mf.pageNumber}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{ width: `${completion}%`, backgroundColor: primaryColor }}
            />
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errors.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 mt-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">
              {errors.length} field{errors.length !== 1 ? 's' : ''} need{errors.length === 1 ? 's' : ''} attention.
              Required fields are highlighted in red.
            </p>
          </div>
        </div>
      )}

      {/* PDF Page + Field Overlays */}
      <div className="mx-auto px-2 py-4 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="inline-block min-w-full" style={{ textAlign: 'center' }}>
          <div className="relative inline-block shadow-lg rounded-lg overflow-visible">
            {/* PDF Canvas */}
            <canvas ref={canvasRef} className="block" />

            {/* Field Input Overlays */}
            <div
              className="absolute top-0 left-0"
              style={{ width: canvasRef.current?.width || 0, height: canvasRef.current?.height || 0 }}
            >
              {currentPageFields.map(({ fieldId, field, pos }) =>
                renderFieldInput(fieldId, pos, field.label)
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Page Navigation + Actions */}
      <div className="sticky bottom-0 z-50 bg-white border-t shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Page Nav */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-600 min-w-[80px] text-center">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Actions */}
            {!readOnly && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  {onSaveDraft && (
                    <button
                      onClick={handleSaveDraft}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Draft
                    </button>
                  )}
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !canSubmit}
                    className="flex items-center gap-1.5 px-6 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Submit
                  </button>
                </div>
                {!canSubmit && (
                  <span className="text-xs text-gray-400">
                    {allFields.some(f => isDeclineField(f.field_id) || isEnrollField(f.field_id))
                      ? 'Complete the election form and sign to submit'
                      : 'Please sign the form to submit'}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Signature Modal */}
      {signatureField && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Sign Here</h3>
            <SignatureCanvas
              value={formData[signatureField] as string || null}
              onChange={(base64: string | null) => {
                handleFieldChange(signatureField!, base64 || '');
              }}
              onSecurityMetadata={(metadata) => setSigMetadata(metadata)}
              readOnly={false}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setSignatureField(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const currentSig = formData[signatureField!] as string;
                  // If this is the first signature and there are other empty signature fields,
                  // offer to auto-fill them all
                  if (currentSig && !firstSignatureRef.current) {
                    firstSignatureRef.current = currentSig;
                    // Only auto-fill applicant signature fields (skip staff-role signatures)
                    const signatureFieldIds = allFields
                      .filter(f => f.type === 'signature' && !isStaffField(f))
                      .map(f => f.field_id);
                    const emptyOthers = signatureFieldIds.filter(
                      fid => fid !== signatureField && !formData[fid]
                    );
                    if (emptyOthers.length > 0) {
                      pendingSignatureFieldRef.current = signatureField;
                      setSignatureField(null);
                      setShowSignaturePrompt(true);
                      return;
                    }
                  }
                  setSignatureField(null);
                }}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: primaryColor }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Auto-Fill Prompt */}
      {showSignaturePrompt && firstSignatureRef.current && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Apply Signature to All Fields?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This form has multiple signature fields. Would you like to apply your signature to all remaining fields automatically?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSignaturePrompt(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                No, I&apos;ll sign each one
              </button>
              <button
                onClick={() => {
                  const sig = firstSignatureRef.current!;
                  // Only auto-fill applicant signature fields (skip staff-role signatures)
                  const signatureFieldIds = allFields
                    .filter(f => f.type === 'signature' && !isStaffField(f))
                    .map(f => f.field_id);
                  // Apply to all empty signature fields
                  for (const fid of signatureFieldIds) {
                    if (fid !== pendingSignatureFieldRef.current && !formData[fid]) {
                      handleFieldChange(fid, sig);
                      // Also store security metadata for each auto-filled signature
                      if (sigMetadata) {
                        handleFieldChange(`_signature_metadata_${fid}`, JSON.stringify({
                          ...sigMetadata,
                          timestamp: new Date().toISOString(),
                          auto_filled_from: pendingSignatureFieldRef.current,
                        }));
                      }
                    }
                  }
                  setShowSignaturePrompt(false);
                }}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: primaryColor }}
              >
                Yes, apply to all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
