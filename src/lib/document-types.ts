/**
 * Document type definitions for applicant document uploads.
 * Each document type appears as a row in the Document Uploads wizard step.
 * All documents are optional — applicants can upload whatever they have
 * ready and come back later to add more.
 */

export interface DocumentTypeConfig {
  /** Unique key stored in document_uploads.doc_type */
  doc_type: string;
  /** Display label shown to the applicant */
  label: string;
  /** Short description / help text */
  description: string;
  /** Accepted MIME types */
  accept: string;
  /** Maximum number of files allowed for this type */
  maxFiles: number;
  /** Category grouping for UI display */
  category: 'professional' | 'medical' | 'identity' | 'administrative';
  /** Display note (e.g., "Optional") */
  note?: string;
}

export const DOCUMENT_TYPES: DocumentTypeConfig[] = [
  // ── Professional ──────────────────────────────────────────────
  {
    doc_type: 'hha_pca_certificate',
    label: 'HHA/PCA Certificate',
    description: 'Home Health Aide or Personal Care Aide certification',
    accept: 'image/*,application/pdf',
    maxFiles: 1,
    category: 'professional',
  },

  // ── Medical ───────────────────────────────────────────────────
  {
    doc_type: 'physical_exam',
    label: 'Physical Exam Cover',
    description: 'Physical examination report cover page',
    accept: 'image/*,application/pdf',
    maxFiles: 1,
    category: 'medical',
  },
  {
    doc_type: 'rubella_measles_lab',
    label: 'Rubella/Measles Lab Report',
    description: 'Rubella and Measles immunity lab results',
    accept: 'image/*,application/pdf',
    maxFiles: 1,
    category: 'medical',
  },
  {
    doc_type: 'tb_gold',
    label: 'TB Gold',
    description: 'QuantiFERON TB Gold blood test results',
    accept: 'image/*,application/pdf',
    maxFiles: 1,
    category: 'medical',
  },
  {
    doc_type: 'chest_xray',
    label: 'Chest X-ray',
    description: 'Chest X-ray report',
    accept: 'image/*,application/pdf',
    maxFiles: 1,
    category: 'medical',
  },
  {
    doc_type: 'drug_test',
    label: 'Drug Test Report',
    description: 'Drug screening test results',
    accept: 'image/*,application/pdf',
    maxFiles: 1,
    category: 'medical',
  },
  {
    doc_type: 'covid_vaccination',
    label: 'COVID-19 Vaccination Card',
    description: 'COVID-19 vaccination record',
    accept: 'image/*,application/pdf',
    maxFiles: 1,
    category: 'medical',
    note: 'Optional',
  },

  // ── Identity ──────────────────────────────────────────────────
  {
    doc_type: 'social_security_card',
    label: 'Social Security Card',
    description: 'Social Security card (front)',
    accept: 'image/*,application/pdf',
    maxFiles: 1,
    category: 'identity',
  },
  {
    doc_type: 'passport_pr_work_permit',
    label: 'Passport / PR Card / Work Permit',
    description: 'Valid passport, permanent resident card, or work permit',
    accept: 'image/*,application/pdf',
    maxFiles: 2,
    category: 'identity',
  },
  {
    doc_type: 'ny_state_id',
    label: 'NY State ID',
    description: 'New York State identification card or driver\'s license',
    accept: 'image/*,application/pdf',
    maxFiles: 2,
    category: 'identity',
  },
  {
    doc_type: 'proof_of_address',
    label: 'Proof of Address',
    description: 'Utility bill, bank statement, or government mail showing current address',
    accept: 'image/*,application/pdf',
    maxFiles: 1,
    category: 'identity',
  },

  // ── Administrative ────────────────────────────────────────────
  {
    doc_type: 'reference_letters',
    label: 'Reference Letters',
    description: 'Two reference letters from previous employers or supervisors',
    accept: 'image/*,application/pdf',
    maxFiles: 2,
    category: 'administrative',
  },
  {
    doc_type: 'direct_deposit_voided_check',
    label: 'Direct Deposit Authorization / Voided Check',
    description: 'Direct deposit form or voided check for payroll',
    accept: 'image/*,application/pdf',
    maxFiles: 1,
    category: 'administrative',
  },
];

/** Category labels for grouping in the UI */
export const CATEGORY_LABELS: Record<string, string> = {
  professional: 'Professional',
  medical: 'Medical & Health',
  identity: 'Identity & Address',
  administrative: 'Administrative',
};

/** Category display order */
export const CATEGORY_ORDER = ['professional', 'medical', 'identity', 'administrative'];
