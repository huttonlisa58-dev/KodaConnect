/**
 * Form Packet Engine - Core types and deduplication logic for multi-form packets
 * v2: Entity-aware deduplication with confidence scoring
 */

import { FormDefinition, FormSection, FormField } from './form-engine';

/**
 * Entity types - who a field belongs to
 */
export type FieldEntity =
  | 'patient'
  | 'caregiver'
  | 'emergency_contact'
  | 'physician'
  | 'agency'
  | 'insurance'
  | 'shared'
  | 'unknown';

/**
 * A FormPacket represents a multi-form document package (e.g., onboarding packet)
 */
export interface FormPacket {
  packet_id: string;
  company_id: string;
  packet_name: string;
  description?: string;
  master_form_id: string; // The deduplicated form definition
  sub_forms: PacketSubForm[];
  field_mappings: PacketFieldMapping[];
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
}

/**
 * A sub-form is one of the forms/documents within a packet
 */
export interface PacketSubForm {
  sub_form_id: string;
  name: string;
  page_count: number;
  page_numbers: number[]; // which pages this form occupies in the PDF
  analyzed_fields: AnalyzedField[];
}

/**
 * Maps fields from sub-forms to deduplicated master fields
 */
export interface PacketFieldMapping {
  master_field_id: string;
  master_field_label: string;
  canonical_name: string;
  source_subforms: string[]; // sub_form_ids this field came from
  field_positions: FieldPosition[];
}

/**
 * Tracks where a field appears in the packet
 */
export interface FieldPosition {
  sub_form_id: string;
  page_number: number;
  extracted_label: string;
}

/**
 * A sub-form after being analyzed by Claude Vision
 */
export interface AnalyzedSubForm {
  sub_form_id: string;
  name: string;
  page_count: number;
  page_numbers: number[];
  fields: AnalyzedField[];
  boilerplate_sections: string[];
  reference_only: boolean;
}

/**
 * A field extracted from a sub-form (v2: with entity tagging)
 */
export interface AnalyzedField {
  extracted_id: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'date' | 'time' | 'number' | 'textarea' | 'signature' | 'checkbox' | 'checkbox_group' | 'checkbox_grid' | 'radio' | 'select' | 'file_upload';
  required: boolean;
  placeholder?: string;
  help_text?: string;
  options?: { value: string; label: string }[];
  rows?: { row_id: string; label: string }[];
  columns?: { col_id: string; label: string }[];
  page_number: number;
  position?: { x: number; y: number; width: number; height: number };
  entity?: FieldEntity; // v2: who this field belongs to
  /** Hide from applicant (auto-fill on backend) */
  hidden?: boolean;
  /** Auto-fill this field's value from another field */
  auto_fill_from?: string;
  /** Repeating group this field belongs to */
  _group?: string;
  /** Instance index within the repeating group */
  _instance?: number;
  /** Initially hidden — revealed by "Add More" */
  _initially_hidden?: boolean;
  /** Conditional visibility — show this field only when another field has a specific value */
  show_if?: { field: string; equals: any };
  /** Validation rules (e.g., min_selections for checkbox_group) */
  validation?: { min_selections?: number; [key: string]: any };
  /** Semantic type for cross-section auto-fill (e.g., "applicant_full_name", "applicant_ssn") */
  semantic_type?: string;
}

/**
 * Result of deduplication process
 */
export interface DeduplicationResult {
  canonical_fields: CanonicalField[];
  dedup_report: DeduplicationReport;
  is_simple_form: boolean; // v2: whether this was auto-detected as a simple form
}

/**
 * A deduplicated field that represents all similar fields across sub-forms
 */
export interface CanonicalField {
  canonical_id: string;
  canonical_label: string;
  canonical_name: string;
  type: AnalyzedField['type'];
  required: boolean;
  help_text?: string;
  options?: { value: string; label: string }[];
  rows?: { row_id: string; label: string }[];
  columns?: { col_id: string; label: string }[];
  source_fields: SourceFieldReference[];
  section_category: 'identity' | 'health' | 'service_details' | 'agreements_signatures' | 'other';
  entity: FieldEntity; // v2: entity tagging
  merge_confidence: number; // v2: overall confidence of this merge (lowest among source fields)
  needs_review: boolean; // v2: flag for yellow/ambiguous merges
}

/**
 * Reference to the original field in a sub-form
 */
export interface SourceFieldReference {
  sub_form_id: string;
  extracted_field_id: string;
  original_label: string;
  page_number: number;
  match_confidence: number; // 0.0-1.0, how confident we are this is the same field
  match_reason: 'exact_label' | 'alias_match' | 'heuristic_match';
  entity?: FieldEntity; // v2: entity from source
}

/**
 * Detailed report of the deduplication process
 */
export interface DeduplicationReport {
  total_sub_forms: number;
  total_extracted_fields: number;
  canonical_fields_count: number;
  groups: FieldGroupReport[];
  manual_review_needed: FieldConflict[];
}

/**
 * Report on how fields were grouped
 */
export interface FieldGroupReport {
  canonical_id: string;
  canonical_label: string;
  field_count: number;
  variants: FieldVariant[];
}

/**
 * A variant of a field (different label, same meaning)
 */
export interface FieldVariant {
  label: string;
  sub_form_id: string;
  extracted_field_id: string;
  confidence: number;
}

/**
 * Fields that couldn't be reliably deduplicated
 */
export interface FieldConflict {
  field_ids: string[];
  labels: string[];
  reason: string;
  suggested_action: string;
}

/**
 * Common field name aliases for deduplication
 */
const FIELD_ALIASES: Record<string, string[]> = {
  'Name of Client': ['Client Name', 'Print Name', 'Name', 'Full Name', 'Client Full Name', 'Applicant Name', 'Consumer Name'],
  'Date of Birth': ['DOB', 'Birth Date', 'Date of birth', 'D.O.B.', 'Birthdate'],
  'Address': ['Mailing Address', 'Street Address', 'Home Address', 'Residential Address'],
  'Phone Number': ['Phone', 'Telephone', 'Contact Phone', 'Phone #', 'Tel.'],
  'Email Address': ['Email', 'E-mail', 'Email contact', 'Contact Email'],
  'Emergency Contact': ['Emergency Contact Name', 'EC Name', 'Next of Kin'],
  'Emergency Contact Phone': ['EC Phone', 'Emergency Phone', 'Next of Kin Phone'],
  'Social Security Number': ['SSN', 'Social Security #', 'SS#', 'Social Sec. #'],
  'Medicaid Number': ['Medicaid ID', 'Medicaid #', 'MCD #'],
  'Medicare Number': ['Medicare ID', 'Medicare #', 'MCR #'],
  'Insurance Company': ['Primary Insurance', 'Insurance Provider', 'Insurer'],
  'Policy Number': ['Policy #', 'Policy ID', 'Insurance Policy'],
  'Start Date': ['Service Start Date', 'Date of Service', 'Effective Date'],
  'End Date': ['Service End Date', 'Termination Date', 'End of Service'],
  'Signature': ['Sign here', 'Client Signature', 'Staff Signature', 'Signature (Print)'],
  'Date Signed': ['Date', 'Signature Date', 'Date of Signature', 'Signed Date'],
};

/**
 * Detect if this is a simple form (skip sub-form splitting and dedup)
 * Simple = 1 sub-form OR total unique pages <= 3 and total fields <= 25
 */
export function isSimpleForm(subForms: AnalyzedSubForm[]): boolean {
  if (subForms.length <= 1) return true;

  // Check if all sub-forms together are small
  const totalPages = new Set(subForms.flatMap(sf => sf.page_numbers)).size;
  const totalFields = subForms.reduce((sum, sf) => sum + sf.fields.length, 0);

  if (totalPages <= 3 && totalFields <= 25) return true;

  return false;
}

/**
 * Deduplicates fields across multiple sub-forms using label matching, aliases, AND entity awareness
 * v2: Only merges fields that share the same entity (or compatible entities)
 */
export function deduplicateFields(subForms: AnalyzedSubForm[]): DeduplicationResult {
  const fieldGroups: Map<string, CanonicalField> = new Map();
  const conflicts: FieldConflict[] = [];
  const groupReports: FieldGroupReport[] = [];
  const simple = isSimpleForm(subForms);

  // Step 1: Process all fields from all sub-forms
  for (const subForm of subForms) {
    for (const field of subForm.fields) {
      const matchKey = findOrCreateFieldGroup(field, subForm, fieldGroups, conflicts);

      if (!matchKey) {
        // Field couldn't be matched to existing group, create new one
        const newCanonicalId = `fld_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const fieldEntity = field.entity || inferEntity(field.label);

        const canonicalField: CanonicalField = {
          canonical_id: newCanonicalId,
          canonical_label: field.label,
          canonical_name: normalizeFieldName(field.label),
          type: field.type,
          required: field.required,
          help_text: field.help_text,
          options: field.options,
          rows: field.rows,
          columns: field.columns,
          source_fields: [{
            sub_form_id: subForm.sub_form_id,
            extracted_field_id: field.extracted_id,
            original_label: field.label,
            page_number: field.page_number,
            match_confidence: 1.0,
            match_reason: 'exact_label',
            entity: fieldEntity,
          }],
          section_category: categorizeField(field.label),
          entity: fieldEntity,
          merge_confidence: 1.0,
          needs_review: false,
        };
        fieldGroups.set(newCanonicalId, canonicalField);
      }
    }
  }

  // Step 2: Generate group reports and flag review items
  for (const [canonicalId, canonicalField] of fieldGroups) {
    const variants: FieldVariant[] = canonicalField.source_fields.map(sf => ({
      label: sf.original_label,
      sub_form_id: sf.sub_form_id,
      extracted_field_id: sf.extracted_field_id,
      confidence: sf.match_confidence,
    }));

    groupReports.push({
      canonical_id: canonicalId,
      canonical_label: canonicalField.canonical_label,
      field_count: canonicalField.source_fields.length,
      variants,
    });

    // Flag fields that have mixed entities or low-confidence merges
    const entities = new Set(canonicalField.source_fields.map(sf => sf.entity).filter(Boolean));
    const minConfidence = Math.min(...canonicalField.source_fields.map(sf => sf.match_confidence));
    canonicalField.merge_confidence = minConfidence;

    if (entities.size > 1 || minConfidence < 0.85) {
      canonicalField.needs_review = true;
    }
  }

  const deduplicationResult: DeduplicationResult = {
    canonical_fields: Array.from(fieldGroups.values()),
    dedup_report: {
      total_sub_forms: subForms.length,
      total_extracted_fields: subForms.reduce((sum, sf) => sum + sf.fields.length, 0),
      canonical_fields_count: fieldGroups.size,
      groups: groupReports,
      manual_review_needed: conflicts,
    },
    is_simple_form: simple,
  };

  return deduplicationResult;
}

/**
 * Find or create a field group for a field
 * v2: Entity-aware matching — only merge if entities are compatible
 */
function findOrCreateFieldGroup(
  field: AnalyzedField,
  subForm: AnalyzedSubForm,
  fieldGroups: Map<string, CanonicalField>,
  conflicts: FieldConflict[]
): string | null {
  const fieldEntity = field.entity || inferEntity(field.label);

  // Try exact match first (same label + compatible entity)
  for (const [canonicalId, canonicalField] of fieldGroups) {
    if (field.label.toLowerCase().trim() === canonicalField.canonical_label.toLowerCase().trim()) {
      // v2: Check entity compatibility
      if (!areEntitiesCompatible(fieldEntity, canonicalField.entity)) {
        // Same label but different entity — these are NOT the same field
        // (e.g., "Phone Number" for patient vs. caregiver)
        continue;
      }

      // Update with new source if not already present
      const alreadyExists = canonicalField.source_fields.some(
        sf => sf.sub_form_id === subForm.sub_form_id && sf.extracted_field_id === field.extracted_id
      );

      if (!alreadyExists) {
        canonicalField.source_fields.push({
          sub_form_id: subForm.sub_form_id,
          extracted_field_id: field.extracted_id,
          original_label: field.label,
          page_number: field.page_number,
          match_confidence: 1.0,
          match_reason: 'exact_label',
          entity: fieldEntity,
        });
      }
      return canonicalId;
    }
  }

  // Try alias match (same alias group + compatible entity)
  for (const [canonicalId, canonicalField] of fieldGroups) {
    if (!areEntitiesCompatible(fieldEntity, canonicalField.entity)) continue;

    const matchedAlias = getAliasMatch(field.label, canonicalField.canonical_label);
    if (matchedAlias) {
      canonicalField.source_fields.push({
        sub_form_id: subForm.sub_form_id,
        extracted_field_id: field.extracted_id,
        original_label: field.label,
        page_number: field.page_number,
        match_confidence: 0.95,
        match_reason: 'alias_match',
        entity: fieldEntity,
      });
      return canonicalId;
    }
  }

  // Try heuristic match (type + semantic similarity + compatible entity)
  for (const [canonicalId, canonicalField] of fieldGroups) {
    if (!areEntitiesCompatible(fieldEntity, canonicalField.entity)) continue;

    if (field.type === canonicalField.type && shouldGroupHeuristic(field.label, canonicalField.canonical_label)) {
      canonicalField.source_fields.push({
        sub_form_id: subForm.sub_form_id,
        extracted_field_id: field.extracted_id,
        original_label: field.label,
        page_number: field.page_number,
        match_confidence: 0.75,
        match_reason: 'heuristic_match',
        entity: fieldEntity,
      });
      return canonicalId;
    }
  }

  return null;
}

/**
 * Check if two entities are compatible for merging
 * 'shared' and 'unknown' are compatible with anything
 * Same entity is compatible
 * Different specific entities are NOT compatible
 */
function areEntitiesCompatible(entity1: FieldEntity, entity2: FieldEntity): boolean {
  if (entity1 === 'shared' || entity1 === 'unknown') return true;
  if (entity2 === 'shared' || entity2 === 'unknown') return true;
  return entity1 === entity2;
}

/**
 * Infer entity from field label when Claude hasn't tagged it
 */
function inferEntity(label: string): FieldEntity {
  const lower = label.toLowerCase();

  // Patient/Client indicators
  if (/\b(patient|client|consumer|applicant|member|recipient)\b/.test(lower)) return 'patient';
  if (/\b(patient'?s|client'?s|consumer'?s)\b/.test(lower)) return 'patient';

  // Caregiver/Employee indicators
  if (/\b(caregiver|employee|staff|worker|aide|attendant|provider)\b/.test(lower)) return 'caregiver';
  if (/\b(caregiver'?s|employee'?s|staff'?s)\b/.test(lower)) return 'caregiver';

  // Emergency contact
  if (/\bemergency\s*(contact|phone|name|number)\b/.test(lower)) return 'emergency_contact';
  if (/\bnext\s*of\s*kin\b/.test(lower)) return 'emergency_contact';

  // Physician/Doctor
  if (/\b(physician|doctor|dr\.|md|prescriber|pcp)\b/.test(lower)) return 'physician';

  // Agency/Company
  if (/\b(agency|company|organization|employer)\b/.test(lower)) return 'agency';

  // Insurance
  if (/\b(insurance|medicaid|medicare|policy|insurer)\b/.test(lower)) return 'insurance';

  return 'unknown';
}

/**
 * Get human-readable entity label
 */
export function getEntityLabel(entity: FieldEntity): string {
  const labels: Record<FieldEntity, string> = {
    patient: 'Patient / Client',
    caregiver: 'Caregiver / Employee',
    emergency_contact: 'Emergency Contact',
    physician: 'Physician / Doctor',
    agency: 'Agency / Company',
    insurance: 'Insurance',
    shared: 'Shared',
    unknown: 'General',
  };
  return labels[entity] || 'General';
}

/**
 * Get entity sort order (for display grouping)
 */
export function getEntityOrder(entity: FieldEntity): number {
  const order: Record<FieldEntity, number> = {
    patient: 0,
    caregiver: 1,
    emergency_contact: 2,
    physician: 3,
    insurance: 4,
    agency: 5,
    shared: 6,
    unknown: 7,
  };
  return order[entity] ?? 99;
}

/**
 * Check if two field labels match via alias mapping
 */
function getAliasMatch(label1: string, label2: string): boolean {
  const normalized1 = label1.toLowerCase().trim();
  const normalized2 = label2.toLowerCase().trim();

  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    const canonicalNorm = canonical.toLowerCase();
    const aliasesNorm = aliases.map(a => a.toLowerCase());

    if ((canonicalNorm === normalized1 || aliasesNorm.includes(normalized1)) &&
        (canonicalNorm === normalized2 || aliasesNorm.includes(normalized2))) {
      return true;
    }
  }

  return false;
}

/**
 * Heuristic: should these fields be grouped together?
 */
function shouldGroupHeuristic(label1: string, label2: string): boolean {
  const norm1 = label1.toLowerCase().trim();
  const norm2 = label2.toLowerCase().trim();

  // Remove common words
  const removeCommon = (s: string) => s
    .replace(/\b(of|the|a|an)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const clean1 = removeCommon(norm1);
  const clean2 = removeCommon(norm2);

  // Same after removing common words
  if (clean1 === clean2) return true;

  // Levenshtein distance check (very similar)
  const distance = levenshteinDistance(clean1, clean2);
  const maxLength = Math.max(clean1.length, clean2.length);
  return distance < maxLength * 0.3; // Allow up to 30% difference
}

/**
 * Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Normalize field name for canonical representation
 */
function normalizeFieldName(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50);
}

/**
 * Categorize a field into logical form sections
 */
function categorizeField(label: string): 'identity' | 'health' | 'service_details' | 'agreements_signatures' | 'other' {
  const lower = label.toLowerCase();

  // Identity/Personal Information
  if (/name|dob|birth|age|social security|ssn|address|phone|email|contact|emergency/.test(lower)) {
    return 'identity';
  }

  // Health Information
  if (/health|medical|diagnosis|medication|allergy|condition|insurance|medicaid|medicare|doctor|physician|provider/.test(lower)) {
    return 'health';
  }

  // Service Details
  if (/service|start|end|rate|hours|schedule|shift|frequency|location|supervisor/.test(lower)) {
    return 'service_details';
  }

  // Agreements & Signatures
  if (/signature|sign|agree|consent|acknowledgment|date.*sign|waiver|release|policy/.test(lower)) {
    return 'agreements_signatures';
  }

  return 'other';
}

/**
 * Generate a master FormDefinition from deduplicated fields
 */
export function generateMasterFormDefinition(
  dedup: DeduplicationResult,
  packetName: string,
  companyId: string
): FormDefinition {
  const sections: FormSection[] = [
    createIdentitySection(dedup.canonical_fields),
    createHealthSection(dedup.canonical_fields),
    createServiceSection(dedup.canonical_fields),
    createAgreementsSection(dedup.canonical_fields),
    createOtherSection(dedup.canonical_fields),
  ];

  // Remove empty sections
  const nonEmptySections = sections.filter(s => s.fields.length > 0);

  // Add section IDs and order
  nonEmptySections.forEach((section, index) => {
    section.section_id = `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    section.order = index;
  });

  const formId = `form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    form_id: formId,
    form_name: `${packetName} - Master Form`,
    version: '1.0',
    company_id: companyId,
    description: `Master form for packet: ${packetName}`,
    status: 'draft',
    sections: nonEmptySections,
    metadata: {
      packet_name: packetName,
      generated_from_deduplication: true,
      canonical_field_count: dedup.canonical_fields.length,
    },
  };
}

/**
 * Create identity information section
 */
function createIdentitySection(canonicalFields: CanonicalField[]): FormSection {
  const fields = canonicalFields
    .filter(f => f.section_category === 'identity')
    .map((f, index) => createFormField(f, index));

  return {
    section_id: '', // Will be set in generateMasterFormDefinition
    title: 'Your Information',
    description: 'Personal and contact details',
    order: 0,
    fields,
  };
}

/**
 * Create health information section
 */
function createHealthSection(canonicalFields: CanonicalField[]): FormSection {
  const fields = canonicalFields
    .filter(f => f.section_category === 'health')
    .map((f, index) => createFormField(f, index));

  return {
    section_id: '', // Will be set in generateMasterFormDefinition
    title: 'Health Information',
    description: 'Medical history and insurance',
    order: 0,
    fields,
  };
}

/**
 * Create service details section
 */
function createServiceSection(canonicalFields: CanonicalField[]): FormSection {
  const fields = canonicalFields
    .filter(f => f.section_category === 'service_details')
    .map((f, index) => createFormField(f, index));

  return {
    section_id: '', // Will be set in generateMasterFormDefinition
    title: 'Service Details',
    description: 'Service information and schedule',
    order: 0,
    fields,
  };
}

/**
 * Create agreements and signatures section
 */
function createAgreementsSection(canonicalFields: CanonicalField[]): FormSection {
  const fields = canonicalFields
    .filter(f => f.section_category === 'agreements_signatures')
    .map((f, index) => createFormField(f, index));

  return {
    section_id: '', // Will be set in generateMasterFormDefinition
    title: 'Agreements & Signatures',
    description: 'Legal agreements and authorization',
    order: 0,
    fields,
  };
}

/**
 * Create other section for uncategorized fields
 */
function createOtherSection(canonicalFields: CanonicalField[]): FormSection {
  const fields = canonicalFields
    .filter(f => f.section_category === 'other')
    .map((f, index) => createFormField(f, index));

  return {
    section_id: '', // Will be set in generateMasterFormDefinition
    title: 'Additional Information',
    description: 'Other required information',
    order: 0,
    fields,
  };
}

/**
 * Convert a CanonicalField to a FormField
 */
function createFormField(canonical: CanonicalField, order: number): FormField {
  return {
    field_id: canonical.canonical_id,
    label: canonical.canonical_label,
    type: canonical.type,
    required: canonical.required,
    help_text: canonical.help_text,
    options: canonical.options,
    rows: canonical.rows,
    columns: canonical.columns,
    order,
  };
}

/**
 * Create field mappings from deduplication result
 */
export function createFieldMappings(dedup: DeduplicationResult): PacketFieldMapping[] {
  const mappings: PacketFieldMapping[] = [];

  for (const canonical of dedup.canonical_fields) {
    const mapping: PacketFieldMapping = {
      master_field_id: canonical.canonical_id,
      master_field_label: canonical.canonical_label,
      canonical_name: canonical.canonical_name,
      source_subforms: [...new Set(canonical.source_fields.map(sf => sf.sub_form_id))],
      field_positions: canonical.source_fields.map(sf => ({
        sub_form_id: sf.sub_form_id,
        page_number: sf.page_number,
        extracted_label: sf.original_label,
      })),
    };
    mappings.push(mapping);
  }

  return mappings;
}
