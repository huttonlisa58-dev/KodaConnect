'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Lock,
} from 'lucide-react';
import {
  FormDefinition,
  FormSection,
  FormSubmissionData,
  validateForm,
  validateField,
  calculateFormCompletion,
  createEmptySubmission,
  isFieldVisible,
  getVisibleFields,
} from '@/lib/form-engine';
import { PDFContentPreview } from './wizard/PDFContentPreview';
import { ReviewStep } from './wizard/ReviewStep';
import { FormStepRenderer } from './wizard/FormStepRenderer';
import { QuizResultModal } from './wizard/QuizResultModal';
import DocumentUploadStep from './wizard/DocumentUploadStep';
import { gradeQuizSection, ExamGradeResult } from '@/lib/exam-grading';

// ─── Types ─────────────────────────────────────────────────────────

interface MobileFormWizardProps {
  definition: FormDefinition;
  initialData?: FormSubmissionData;
  /** Base64-encoded PDF passed directly (if already loaded by parent) */
  pdfBase64?: string;
  onSubmit: (data: FormSubmissionData) => Promise<void>;
  onSaveDraft?: (data: FormSubmissionData, currentStep: number) => Promise<void>;
  readOnly?: boolean;
  brandColors?: { primary?: string; secondary?: string; accent?: string };
  /** Step to resume from (for draft resumption) */
  initialStep?: number;
  /** Existing submission ID (for draft upsert) */
  submissionId?: string;
  /** Applicant ID (for document uploads) */
  applicantId?: string;
  /** Whether to show the document upload step (default: true) */
  showDocumentUpload?: boolean;
  /** Per-form document types from form_definitions.metadata.document_types */
  documentTypes?: import('@/lib/document-types').DocumentTypeConfig[];
  /** Field IDs that should be individually read-only (e.g. staff-pre-filled fields in client view) */
  readOnlyFieldIds?: string[];
  /** When true, content-only sections become wizard steps instead of a separate preview.
   *  Useful for client-facing forms where all sections should flow as one continuous wizard. */
  includeContentSections?: boolean;
}

// ─── Main Component ────────────────────────────────────────────────

export default function MobileFormWizard({
  definition,
  initialData,
  pdfBase64,
  onSubmit,
  onSaveDraft,
  readOnly = false,
  brandColors,
  initialStep = 0,
  submissionId,
  applicantId,
  showDocumentUpload = true,
  documentTypes,
  readOnlyFieldIds,
  includeContentSections = false,
}: MobileFormWizardProps) {
  const primary = brandColors?.primary || '#0f766e';
  const primaryLight = `${primary}08`;
  const primaryMedium = `${primary}15`;

  // Filter sections: exclude hidden_from_applicant, separate content-only from field sections
  const allSections = definition.sections || [];
  const applicantSections = allSections.filter((s) => !(s as any).hidden_from_applicant);

  // ── Training course detection ──
  // Forms with section_group_order (e.g. training courses) interleave content
  // and quiz sections. In this mode, ALL sections become form steps — no
  // separate content preview. FormStepRenderer handles rendering content HTML
  // with proper DOMPurify config that preserves inline styles.
  const formMetadataInit = (definition as any).metadata || {};
  const hasTrainingFlow = !!(
    formMetadataInit.section_group_order?.length > 0 ||
    (definition as any).section_group_order?.length > 0
  );

  const includeAllSections = hasTrainingFlow || includeContentSections;
  const sectionsWithFields = includeAllSections
    ? applicantSections  // Training / client view: ALL sections are form steps (content-only + fields interleaved)
    : applicantSections.filter((s) => s.fields && s.fields.length > 0);
  // Content-only sections (policy text, etc.) shown before form — skipped for training courses and client view
  const contentOnlySections = includeAllSections
    ? []  // Training / client view: no separate content preview
    : applicantSections.filter((s) => !s.fields || s.fields.length === 0);

  // Add document upload step (optional) + review step at the end
  // Training courses skip the review step — submit directly from the last section
  const skipReview = hasTrainingFlow;
  const DOCUMENT_UPLOAD_STEP = showDocumentUpload ? sectionsWithFields.length : -1;  // -1 = disabled
  const REVIEW_STEP = skipReview ? -1 : sectionsWithFields.length + (showDocumentUpload ? 1 : 0);
  const totalSteps = sectionsWithFields.length + (showDocumentUpload ? 1 : 0) + (skipReview ? 0 : 1);

  const [currentStep, setCurrentStep] = useState(initialStep);
  // Merge default_value from field definitions into initialData so pre-fills
  // (e.g. HBV "I have received the vaccine") apply even when OTP data is present.
  const [formData, setFormData] = useState<FormSubmissionData>(() => {
    const base = initialData || createEmptySubmission(definition);
    if (initialData) {
      // Apply default_value for any fields missing from initialData
      for (const section of allSections) {
        if (!section.fields) continue;
        for (const field of section.fields) {
          const dv = (field as any).default_value;
          if (dv !== undefined && (base[field.field_id] === undefined || base[field.field_id] === '' || base[field.field_id] === null)) {
            base[field.field_id] = dv;
          }
        }
      }
    }
    return base;
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showContent, setShowContent] = useState(!hasTrainingFlow && contentOnlySections.length > 0);
  const formRef = useRef<HTMLDivElement>(null);

  // FIX 2026-03-01: Guard against re-firing the one-time auto-fill propagation.
  // If the parent re-renders and creates a new `definition` object reference, autoFillMap
  // recomputes and the useEffect could re-fire, overwriting user edits.
  const hasAutoFillInitialized = useRef(false);

  // "Add More" state: tracks how many instances are visible per repeating group
  const [expandedInstances, setExpandedInstances] = useState<Record<string, number>>({});

  // Collapsible content state: tracks which sections have expanded content
  const [expandedContent, setExpandedContent] = useState<Record<string, boolean>>({});

  // Collapsible checkbox group state (e.g., e-signature consent list)
  const [expandedCheckboxGroups, setExpandedCheckboxGroups] = useState<Record<string, boolean>>({});

  // ── Sequential sections / quiz gating state ───────────────────────
  const formMetadata = formMetadataInit;
  const isSequentialSections = !!(formMetadata.sequential_sections && formMetadata.auto_grade && formMetadata.answer_key);

  // Build section group info (must be declared before unlockedGroups useState)
  const sectionGroupOrder: { key: string; label: string }[] =
    formMetadata.section_group_order || (definition as any).section_group_order || [];

  // Track which section_groups have been unlocked (passed their quiz)
  // The first group is always unlocked. Key = section_group key, value = true if unlocked.
  const [unlockedGroups, setUnlockedGroups] = useState<Record<string, boolean>>(() => {
    if (!isSequentialSections || sectionGroupOrder.length === 0) return {};
    return { [sectionGroupOrder[0].key]: true };
  });

  // Track per-section-group quiz results for display
  const [sectionQuizResults, setSectionQuizResults] = useState<Record<string, ExamGradeResult>>({});

  // Currently showing quiz result modal (null = not showing)
  const [quizResultGroupKey, setQuizResultGroupKey] = useState<string | null>(null);

  // Helper: is a section_group the last step (quiz) in its group?
  const isLastStepInGroup = (stepIndex: number): boolean => {
    if (!isSequentialSections || stepIndex >= sectionsWithFields.length) return false;
    const section = sectionsWithFields[stepIndex] as any;
    const groupKey = section.section_group || '';
    const groupSteps = sectionsWithFields.filter((s: any) => s.section_group === groupKey);
    return groupSteps.indexOf(section) === groupSteps.length - 1;
  };

  // Helper: does a section have quiz fields?
  const sectionHasQuizFields = (section: any): boolean => {
    return section.fields?.some((f: any) => {
      const fid = f.field_id || f.id;
      return /_q\d+/.test(fid);
    }) ?? false;
  };

  // Helper: is a step accessible in sequential mode?
  const isStepAccessible = (stepIndex: number): boolean => {
    if (!isSequentialSections) return true;
    if (stepIndex >= sectionsWithFields.length) return true; // doc upload / review always accessible
    const section = sectionsWithFields[stepIndex] as any;
    const groupKey = section.section_group || '';
    return !!unlockedGroups[groupKey];
  };

  // Pre-fill date and time fields with smart defaults:
  // - Date fields with `default_today` flag (or non-DOB fields): today's date
  // - Time fields with `default_now` flag: current time
  // - DOB fields: leave blank (user must enter)
  useEffect(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const today = `${yyyy}-${mm}-${dd}`;
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${min}`;

    let needsUpdate = false;
    const updates: Record<string, string> = {};

    for (const section of allSections) {
      if (!section.fields) continue;
      for (const field of section.fields) {
        const meta = field as any;
        if (field.type === 'date' && !formData[field.field_id]) {
          // Only default to today if explicitly flagged with default_today: true
          // DOB, appointment dates, etc. should NOT auto-fill
          if (meta.default_today === true) {
            updates[field.field_id] = today;
            needsUpdate = true;
          }
        }
        if (field.type === 'time' && !formData[field.field_id] && meta.default_now) {
          updates[field.field_id] = currentTime;
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      setFormData((prev) => ({ ...prev, ...updates }));
    }
  }, [definition]); // Run once when definition is available

  // Build a reverse lookup: source field ID → list of dependent field IDs
  // This allows instant propagation inside updateField without useEffect timing issues
  const autoFillMap = useMemo(() => {
    const map: Record<string, { fieldId: string; source: string; transform?: string }[]> = {};
    for (const section of allSections) {
      if (!section.fields) continue;
      for (const field of section.fields) {
        const src = (field as any).auto_fill_from;
        if (!src || src === 'app_signature') continue;
        if (!map[src]) map[src] = [];
        const entry: { fieldId: string; source: string; transform?: string } = { fieldId: field.field_id, source: src };
        if ((field as any).transform) entry.transform = (field as any).transform;
        map[src].push(entry);
      }
    }
    // Also map first_name/last_name to fields with auto_fill_from: 'full_name'
    const fullNameDeps: { fieldId: string; source: string }[] = [];
    for (const section of allSections) {
      if (!section.fields) continue;
      for (const field of section.fields) {
        if ((field as any).auto_fill_from === 'full_name') {
          fullNameDeps.push({ fieldId: field.field_id, source: 'full_name' });
        }
      }
    }
    if (fullNameDeps.length > 0) {
      map['first_name'] = [...(map['first_name'] || []), ...fullNameDeps];
      map['last_name'] = [...(map['last_name'] || []), ...fullNameDeps];
    }
    // Map applicant_info name parts → applicant_info__full_name (and its dependents)
    const aiFullNameDeps: { fieldId: string; source: string }[] = [];
    for (const section of allSections) {
      if (!section.fields) continue;
      for (const field of section.fields) {
        if ((field as any).auto_fill_from === 'applicant_info__full_name') {
          aiFullNameDeps.push({ fieldId: field.field_id, source: 'applicant_info__full_name' });
        }
      }
    }
    // Include the hidden applicant_info__full_name field itself as a target
    aiFullNameDeps.push({ fieldId: 'applicant_info__full_name', source: 'applicant_info__full_name' });
    if (aiFullNameDeps.length > 0) {
      map['applicant_info__first_name'] = [...(map['applicant_info__first_name'] || []), ...aiFullNameDeps];
      map['applicant_info__middle_name'] = [...(map['applicant_info__middle_name'] || []), ...aiFullNameDeps];
      map['applicant_info__last_name'] = [...(map['applicant_info__last_name'] || []), ...aiFullNameDeps];
    }
    // Map concatenate_from fields: each source triggers recomposition of the concatenated target
    for (const section of allSections) {
      if (!section.fields) continue;
      for (const field of section.fields) {
        const concatSources: string[] | undefined = (field as any).concatenate_from;
        const concatSep: string = (field as any).concatenate_separator || ', ';
        if (concatSources && Array.isArray(concatSources)) {
          for (const src of concatSources) {
            if (!map[src]) map[src] = [];
            map[src].push({
              fieldId: field.field_id,
              source: src,
              transform: `concatenate:${concatSources.join('|')}:${concatSep}`,
            });
          }
        }
      }
    }
    return map;
  }, [definition]);

  // ── One-time auto-fill propagation for pre-filled data ──────────
  // When the form loads with initialData (e.g. name/phone from OTP), run
  // auto-fill for all source fields that already have values so dependents
  // (like Print Name / signature fields across all forms) get populated.
  useEffect(() => {
    // FIX 2026-03-01: Use ref guard so this only fires once, even if autoFillMap
    // recomputes due to parent re-renders creating a new definition object reference.
    if (hasAutoFillInitialized.current) return;
    if (!initialData || Object.keys(autoFillMap).length === 0) return;
    hasAutoFillInitialized.current = true;

    setFormData((prev) => {
      const next = { ...prev };
      let anyUpdate = false;

      // Propagate first_name / last_name → full_name dependents
      const fn = prev['first_name'] || '';
      const ln = prev['last_name'] || '';
      if (fn || ln) {
        const fullName = [fn, ln].filter(Boolean).join(' ');
        const fnDeps = autoFillMap['first_name'] || [];
        for (const dep of fnDeps) {
          if (dep.source === 'full_name' && fullName && !next[dep.fieldId]) {
            next[dep.fieldId] = fullName;
            anyUpdate = true;
          }
        }
      }

      // Propagate applicant_info name parts → applicant_info__full_name and its dependents
      const aiFn = prev['applicant_info__first_name'] || '';
      const aiMn = prev['applicant_info__middle_name'] || '';
      const aiLn = prev['applicant_info__last_name'] || '';
      if (aiFn || aiLn) {
        const aiFullName = [aiFn, aiMn, aiLn].filter(Boolean).join(' ');
        const aiDeps = autoFillMap['applicant_info__first_name'] || [];
        for (const dep of aiDeps) {
          if (dep.source === 'applicant_info__full_name' && aiFullName && !next[dep.fieldId]) {
            next[dep.fieldId] = aiFullName;
            anyUpdate = true;
          }
        }
      }

      // Propagate all other source fields that have values
      // NOTE: Check next[sourceId] first (for chain propagation), then prev[sourceId]
      for (const sourceId of Object.keys(autoFillMap)) {
        if (sourceId === 'first_name' || sourceId === 'last_name') continue;
        const val = next[sourceId] || prev[sourceId];
        if (!val) continue;
        const strVal = String(val);
        const deps = autoFillMap[sourceId];
        for (const dep of deps) {
          if (dep.source !== 'full_name' && dep.source !== 'applicant_info__full_name' && !next[dep.fieldId]) {
            if (dep.transform === 'last_4') {
              const digits = strVal.replace(/\D/g, '');
              next[dep.fieldId] = digits.slice(-4);
            } else if (dep.transform && dep.transform.startsWith('concatenate:')) {
              const parts = dep.transform.split(':');
              const sources = parts[1].split('|');
              const separator = parts[2] || ', ';
              const composed = sources
                .map(s => next[s] || prev[s] || '')
                .filter(Boolean)
                .join(separator);
              if (composed) {
                next[dep.fieldId] = composed;
                anyUpdate = true;
              }
            } else {
              next[dep.fieldId] = strVal;
            }
            anyUpdate = true;
          }
        }
      }

      return anyUpdate ? next : prev;
    });
  }, [autoFillMap]); // autoFillMap changes once when definition loads

  // Section group progress indicator helpers
  const currentSectionGroupKey = currentStep < sectionsWithFields.length
    ? (sectionsWithFields[currentStep] as any).section_group || ''
    : '';
  const currentGroupLabel = currentStep < sectionsWithFields.length
    ? (sectionsWithFields[currentStep] as any).section_group_label || ''
    : currentStep === DOCUMENT_UPLOAD_STEP ? 'Document Uploads' : 'Review';
  const currentGroupIndex = sectionGroupOrder.findIndex((g) => g.key === currentSectionGroupKey);
  const stepsInCurrentGroup = sectionsWithFields.filter(
    (s) => (s as any).section_group === currentSectionGroupKey
  );
  const stepWithinGroup = stepsInCurrentGroup.indexOf(sectionsWithFields[currentStep]) + 1;

  const completion = calculateFormCompletion(definition, formData);

  // Current section (null if on review step)
  const currentSection =
    currentStep < sectionsWithFields.length ? sectionsWithFields[currentStep] : null;

  function updateField(fieldId: string, value: any) {
    // FIX 2026-03-01: Track which checkbox group to auto-expand outside the state updater.
    // Calling setExpandedCheckboxGroups inside setFormData's callback was a side effect
    // in a state updater — an anti-pattern that could cause issues in React concurrent mode.
    let groupToExpand: string | null = null;

    setFormData((prev) => {
      const next = { ...prev, [fieldId]: value };

      // ── Auto-fill propagation: if this field is a source, fill all dependents ──
      const dependents = autoFillMap[fieldId];
      if (dependents && value) {
        const strValue = String(value);
        // For first_name/last_name, compute full_name composite
        if (fieldId === 'first_name' || fieldId === 'last_name') {
          const fn = fieldId === 'first_name' ? strValue : (next['first_name'] || '');
          const ln = fieldId === 'last_name' ? strValue : (next['last_name'] || '');
          const fullName = [fn, ln].filter(Boolean).join(' ');
          for (const dep of dependents) {
            if (dep.source === 'full_name' && fullName) {
              next[dep.fieldId] = fullName;
            }
          }
        }
        // For applicant_info name parts, compose full_name with middle name
        if (fieldId === 'applicant_info__first_name' || fieldId === 'applicant_info__middle_name' || fieldId === 'applicant_info__last_name') {
          const aiFn = fieldId === 'applicant_info__first_name' ? strValue : (next['applicant_info__first_name'] || '');
          const aiMn = fieldId === 'applicant_info__middle_name' ? strValue : (next['applicant_info__middle_name'] || '');
          const aiLn = fieldId === 'applicant_info__last_name' ? strValue : (next['applicant_info__last_name'] || '');
          const aiFullName = [aiFn, aiMn, aiLn].filter(Boolean).join(' ');
          for (const dep of dependents) {
            if (dep.source === 'applicant_info__full_name' && aiFullName) {
              next[dep.fieldId] = aiFullName;
            }
          }
        }
        // For all other source fields, propagate directly (with optional transforms)
        for (const dep of dependents) {
          if (dep.source !== 'full_name' && dep.source !== 'applicant_info__full_name') {
            if (dep.transform === 'last_4') {
              // Extract last 4 digits (e.g. SSN → last 4)
              const digits = strValue.replace(/\D/g, '');
              next[dep.fieldId] = digits.slice(-4);
            } else if (dep.transform && dep.transform.startsWith('concatenate:')) {
              // Concatenate multiple source fields into one value
              const parts = dep.transform.split(':');
              const sources = parts[1].split('|');
              const separator = parts[2] || ', ';
              const composed = sources
                .map(s => s === fieldId ? strValue : (next[s] || ''))
                .filter(Boolean)
                .join(separator);
              next[dep.fieldId] = composed;
            } else {
              next[dep.fieldId] = strValue;
            }
          }
        }
      }

      // ── Chain propagation: propagate values set by auto-fill to THEIR dependents ──
      // This handles multi-hop chains like applicant_info → hcr_consent → doh102 → i9
      if (dependents && value) {
        const filledIds = dependents.map(d => d.fieldId).filter(id => next[id]);
        for (let depth = 0; depth < 5 && filledIds.length > 0; depth++) {
          const nextBatch: string[] = [];
          for (const filledId of filledIds) {
            const chainDeps = autoFillMap[filledId];
            if (!chainDeps) continue;
            const chainVal = String(next[filledId]);
            for (const cd of chainDeps) {
              if (cd.source !== 'full_name' && cd.source !== 'applicant_info__full_name' && !next[cd.fieldId]) {
                if (cd.transform === 'last_4') {
                  const digits = chainVal.replace(/\D/g, '');
                  next[cd.fieldId] = digits.slice(-4);
                } else if (cd.transform && cd.transform.startsWith('concatenate:')) {
                  const parts = cd.transform.split(':');
                  const sources = parts[1].split('|');
                  const separator = parts[2] || ', ';
                  const composed = sources.map(s => next[s] || '').filter(Boolean).join(separator);
                  if (composed) next[cd.fieldId] = composed;
                } else {
                  next[cd.fieldId] = chainVal;
                }
                nextBatch.push(cd.fieldId);
              }
            }
          }
          filledIds.length = 0;
          filledIds.push(...nextBatch);
        }
      }

      // Select All toggle: if this field has select_all_group, toggle all fields in that group
      const allFields = definition.sections.flatMap((s) => s.fields || []);
      const thisField = allFields.find((f) => f.field_id === fieldId) as any;
      if (thisField?.select_all_group) {
        const groupName = thisField.select_all_group;
        for (const f of allFields) {
          if ((f as any).group === groupName) {
            next[f.field_id] = value;
          }
        }
        // Mark group for expansion (applied after state update)
        if (value) {
          groupToExpand = groupName;
        }
      }

      // If unchecking a group member, also uncheck the Select All
      if (thisField?.group && !value) {
        const selectAllField = allFields.find((f) => (f as any).select_all_group === thisField.group);
        if (selectAllField) {
          next[selectAllField.field_id] = false;
        }
      }

      // If checking a group member, check if all are now checked → auto-check Select All
      if (thisField?.group && value) {
        const groupName = thisField.group;
        const groupFields = allFields.filter((f) => (f as any).group === groupName);
        const allChecked = groupFields.every((f) => f.field_id === fieldId ? true : next[f.field_id]);
        if (allChecked) {
          const selectAllField = allFields.find((f) => (f as any).select_all_group === groupName);
          if (selectAllField) {
            next[selectAllField.field_id] = true;
          }
        }
      }

      return next;
    });

    // Auto-expand the checkbox group when Select All is checked (outside state updater)
    if (groupToExpand) {
      setExpandedCheckboxGroups((prev) => ({ ...prev, [groupToExpand!]: true }));
    }

    // Clear error on change
    if (fieldErrors[fieldId]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  }

  function validateCurrentSection(): boolean {
    if (!currentSection) return true;
    // Only validate non-hidden fields that are currently visible (including Add More filter)
    const sectionVisibleFields = getVisibleFields(currentSection, formData).filter((f) => !(f as any).hidden);
    const errors: Record<string, string> = {};
    let valid = true;

    const repeatingGroups = (currentSection as any)?.repeating_groups || [];
    function getVisibleInstanceCount(groupId: string): number {
      const group = repeatingGroups.find((g: any) => g.group_id === groupId);
      if (!group) return 999;
      return expandedInstances[groupId] ?? group.min_visible;
    }

    for (const field of sectionVisibleFields) {
      // Skip fields hidden by "Add More" — they're not visible to the user
      const fa = field as any;
      if (fa._group && fa._instance !== undefined) {
        const visCount = getVisibleInstanceCount(fa._group);
        if (fa._instance >= visCount) continue;
      }

      const error = validateField(field, formData[field.field_id]);
      if (error) {
        errors[field.field_id] = error;
        valid = false;
      }
    }

    setFieldErrors(errors);
    return valid;
  }

  function handleNext() {
    if (currentStep < sectionsWithFields.length) {
      if (!validateCurrentSection()) {
        formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    // ── Sequential sections: grade quiz inline when leaving the last step of a group ──
    if (isSequentialSections && currentStep < sectionsWithFields.length) {
      const currentSec = sectionsWithFields[currentStep] as any;
      const groupKey = currentSec.section_group || '';

      if (isLastStepInGroup(currentStep) && sectionHasQuizFields(currentSec)) {
        // Grade this section's quiz
        const result = gradeQuizSection(
          groupKey,
          formMetadata,
          definition.sections.map((s: any) => ({
            ...s,
            fields: s.fields?.map((f: any) => ({ ...f, field_id: f.field_id || f.id })),
          })),
          formData
        );

        if (result) {
          // Store the result
          setSectionQuizResults((prev) => ({ ...prev, [groupKey]: result }));

          if (result.passed) {
            // Unlock the next section group
            const currentGroupIdx = sectionGroupOrder.findIndex((g) => g.key === groupKey);
            if (currentGroupIdx >= 0 && currentGroupIdx < sectionGroupOrder.length - 1) {
              const nextGroupKey = sectionGroupOrder[currentGroupIdx + 1].key;
              setUnlockedGroups((prev) => ({ ...prev, [nextGroupKey]: true }));
            }
          }

          // Show the quiz result modal (pass or fail)
          setQuizResultGroupKey(groupKey);
          formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          return; // Don't advance — modal will handle navigation
        }
      }

      // Check if the NEXT step is accessible (in case we're crossing group boundaries)
      const nextStep = currentStep + 1;
      if (nextStep < sectionsWithFields.length && !isStepAccessible(nextStep)) {
        // Can't go forward — section is locked
        return;
      }
    }

    if (currentStep < totalSteps - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

      // Auto-save draft on step transition (fire-and-forget)
      if (onSaveDraft) {
        onSaveDraft(formData, nextStep).catch((err) =>
          console.error('Auto-save failed:', err)
        );
      }
    }
  }

  /** Called when the quiz result modal's "Continue" button is clicked (passed) */
  function handleQuizContinue() {
    setQuizResultGroupKey(null);

    // Training courses: if this was the last quiz, submit the form directly
    if (skipReview && currentStep >= sectionsWithFields.length - 1) {
      handleSubmit();
      return;
    }

    // Advance to next step
    if (currentStep < totalSteps - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      if (onSaveDraft) {
        onSaveDraft(formData, nextStep).catch((err) =>
          console.error('Auto-save failed:', err)
        );
      }
    }
  }

  /** Called when the quiz result modal's "Retake" button is clicked (failed) */
  function handleQuizRetake() {
    const groupKey = quizResultGroupKey;
    setQuizResultGroupKey(null);

    if (!groupKey) return;

    // Clear quiz answers for this section group so the user can retake
    const quizFieldIds: string[] = [];
    for (const section of definition.sections) {
      const sec = section as any;
      if (sec.section_group !== groupKey) continue;
      for (const field of section.fields || []) {
        const fid = (field as any).field_id || (field as any).id;
        if (/_q\d+/.test(fid)) {
          quizFieldIds.push(fid);
        }
      }
    }

    if (quizFieldIds.length > 0) {
      setFormData((prev) => {
        const next = { ...prev };
        for (const fid of quizFieldIds) {
          next[fid] = '';
        }
        return next;
      });
    }

    // Navigate back to the first quiz step in this group
    const groupSteps = sectionsWithFields.filter((s: any) => (s as any).section_group === groupKey);
    const quizStep = groupSteps.find((s: any) => sectionHasQuizFields(s));
    if (quizStep) {
      const stepIndex = sectionsWithFields.indexOf(quizStep);
      if (stepIndex >= 0) {
        setCurrentStep(stepIndex);
        formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (contentOnlySections.length > 0) {
      setShowContent(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function handleSubmit() {
    const errors = validateForm(definition, formData);
    if (errors.length > 0) {
      const errorMap: Record<string, string> = {};
      for (const err of errors) {
        errorMap[err.field_id] = err.message;
      }
      setFieldErrors(errorMap);
      setSubmitError(`Please fix ${errors.length} error(s) before submitting.`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(formData);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveDraft() {
    if (!onSaveDraft) return;
    setSubmitting(true);
    try {
      await onSaveDraft(formData, currentStep);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Quiz Result Modal (shown after inline grading) ──────────────

  if (quizResultGroupKey && sectionQuizResults[quizResultGroupKey]) {
    const quizResult = sectionQuizResults[quizResultGroupKey];
    const groupLabel = sectionGroupOrder.find((g) => g.key === quizResultGroupKey)?.label || 'Quiz';

    // Find the retake tutorial content for this specific section group
    // If there's a section-specific tutorial, use it; otherwise use the global retake_tutorial
    const retakeTutorial = formMetadata.retake_tutorial || [];

    return (
      <QuizResultModal
        result={quizResult}
        sectionLabel={groupLabel}
        retakeTutorial={retakeTutorial}
        retakeEnabled={formMetadata.retake_enabled !== false}
        onContinue={handleQuizContinue}
        onRetake={handleQuizRetake}
        brandColor={primary}
      />
    );
  }

  // ─── Content Preview (policy text) ───────────────────────────────

  if (showContent && (contentOnlySections.length > 0 || pdfBase64)) {
    return (
      <PDFContentPreview
        definition={definition}
        pdfBase64={pdfBase64}
        contentOnlySections={contentOnlySections}
        primary={primary}
        onContinue={() => setShowContent(false)}
      />
    );
  }

  // ─── Document Upload Step ────────────────────────────────────────

  const isDocumentUploadStep = currentStep === DOCUMENT_UPLOAD_STEP;

  if (isDocumentUploadStep) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#f8fafb' }}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white shadow-sm">
          <div className="px-4 py-2">
            <div className="flex items-center justify-between">
              <h1 className="text-sm font-bold text-gray-900 truncate">{definition.form_name}</h1>
              <span className="text-xs font-semibold shrink-0 ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: primaryLight, color: primary }}>
                Document Uploads
              </span>
            </div>
          </div>
          <div className="h-1.5 bg-gray-200">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${((DOCUMENT_UPLOAD_STEP + 1) / totalSteps) * 100}%`,
                backgroundColor: primary,
              }}
            />
          </div>
        </div>

        {/* Document upload content */}
        <div ref={formRef} className="max-w-2xl mx-auto p-4 pb-24">
          <DocumentUploadStep
            submissionId={submissionId || null}
            applicantId={applicantId || null}
            brandColor={primary}
            documentTypes={documentTypes}
          />
        </div>

        {/* Bottom navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t shadow-lg p-4">
          <div className="max-w-2xl mx-auto flex gap-3">
            <button
              onClick={handleBack}
              className="flex-1 border-2 border-gray-200 text-gray-600 py-3.5 rounded-xl hover:bg-gray-50 flex items-center justify-center gap-1 font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={handleNext}
              className="flex-1 text-white py-3.5 rounded-xl font-medium hover:opacity-90 flex items-center justify-center gap-1 shadow-md"
              style={{ backgroundColor: primary }}
            >
              Review
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Review Step ─────────────────────────────────────────────────

  const isReviewStep = !skipReview && REVIEW_STEP >= 0 && currentStep >= REVIEW_STEP;

  if (isReviewStep) {
    return (
      <ReviewStep
        definition={definition}
        sectionsWithFields={sectionsWithFields}
        formData={formData}
        onEdit={setCurrentStep}
        onSubmit={handleSubmit}
        onBack={handleBack}
        onSaveDraft={handleSaveDraft}
        submitting={submitting}
        submitError={submitError}
        completion={completion}
        brandColors={{ primary, primaryLight, primaryMedium }}
      />
    );
  }

  // ─── Form Section Step ───────────────────────────────────────────

  // Helper: expand a group by one more instance
  function expandGroup(groupId: string) {
    const group = (currentSection as any)?.repeating_groups?.find((g: any) => g.group_id === groupId);
    if (!group) return;
    const repeatingGroups = (currentSection as any)?.repeating_groups || [];
    function getVisibleInstanceCount(gId: string): number {
      const g = repeatingGroups.find((gr: any) => gr.group_id === gId);
      if (!g) return 999;
      return expandedInstances[gId] ?? g.min_visible;
    }
    const current = getVisibleInstanceCount(groupId);
    const max = group.instance_keys.length;
    if (current < max) {
      setExpandedInstances((prev) => ({ ...prev, [groupId]: current + 1 }));
    }
  }

  return (
    <div style={{ backgroundColor: '#f8fafb' }}>
      {/* Header with progress percentage */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-bold text-gray-900 truncate">{definition.form_name}</h1>
            <span className="text-xs font-semibold shrink-0 ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: primaryLight, color: primary }}>
              {Math.round(((currentStep + 1) / totalSteps) * 100)}% complete
            </span>
          </div>
          {sectionGroupOrder.length > 0 && currentGroupLabel && (
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              {currentGroupLabel} — Step {stepWithinGroup} of {stepsInCurrentGroup.length}
              {isSequentialSections && currentStep < sectionsWithFields.length && isLastStepInGroup(currentStep) && sectionHasQuizFields(sectionsWithFields[currentStep] as any) && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium ml-1">Quiz</span>
              )}
            </p>
          )}
        </div>
        {/* Progress bar — section group segments */}
        {sectionGroupOrder.length > 0 ? (
          <div className="flex h-1.5 bg-gray-200">
            {sectionGroupOrder.map((group, gIdx) => {
              const groupSteps = sectionsWithFields.filter((s) => (s as any).section_group === group.key);
              const completedSteps = groupSteps.filter((s) => {
                const sIdx = sectionsWithFields.indexOf(s);
                return sIdx < currentStep;
              }).length;
              const isCurrent = group.key === currentSectionGroupKey;
              const isComplete = completedSteps === groupSteps.length;
              const segmentProgress = isCurrent
                ? (stepWithinGroup / groupSteps.length) * 100
                : isComplete ? 100 : 0;
              return (
                <div key={group.key} className="flex-1 relative" style={{ marginRight: gIdx < sectionGroupOrder.length - 1 ? '2px' : '0' }}>
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${segmentProgress}%`,
                      backgroundColor: primary,
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-1.5 bg-gray-200">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${((currentStep + 1) / totalSteps) * 100}%`,
                backgroundColor: primary,
              }}
            />
          </div>
        )}
      </div>

      {/* Form content */}
      <div ref={formRef} className="max-w-2xl mx-auto px-4 pt-3 pb-20">
        {currentSection && (
          <FormStepRenderer
            section={currentSection}
            formData={formData}
            fieldErrors={fieldErrors}
            onChange={updateField}
            onExpandGroup={expandGroup}
            expandedContent={expandedContent}
            onToggleContent={(sectionId, expanded) => setExpandedContent((prev) => ({ ...prev, [sectionId]: expanded }))}
            expandedInstances={expandedInstances}
            expandedCheckboxGroups={expandedCheckboxGroups}
            onToggleCheckboxGroup={(groupId) => setExpandedCheckboxGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))}
            brandColor={primary}
            readOnly={readOnly}
            readOnlyFieldIds={readOnlyFieldIds}
          />
        )}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t shadow-lg p-4">
        <div className="max-w-2xl mx-auto flex gap-3">
          <button
            onClick={handleBack}
            className="flex-1 border-2 border-gray-200 text-gray-600 py-3.5 rounded-xl hover:bg-gray-50 flex items-center justify-center gap-1 font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            {currentStep === 0 && contentOnlySections.length > 0 ? 'View Policy' : 'Back'}
          </button>
          {/* Training courses: show Submit Form on the last step instead of Review */}
          {skipReview && currentStep === sectionsWithFields.length - 1 && !showDocumentUpload ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 text-white py-3.5 rounded-xl font-medium hover:opacity-90 flex items-center justify-center gap-1 shadow-md"
              style={{ backgroundColor: primary }}
            >
              {submitting ? 'Submitting...' : 'Submit Form'}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex-1 text-white py-3.5 rounded-xl font-medium hover:opacity-90 flex items-center justify-center gap-1 shadow-md"
              style={{ backgroundColor: primary }}
            >
              {isSequentialSections && currentStep < sectionsWithFields.length && isLastStepInGroup(currentStep) && sectionHasQuizFields(sectionsWithFields[currentStep] as any)
                ? 'Submit Quiz'
                : currentStep < sectionsWithFields.length - 1
                  ? 'Next'
                  : (showDocumentUpload ? 'Documents' : (skipReview ? 'Submit Form' : 'Review'))
              }
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
