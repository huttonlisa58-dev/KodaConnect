/**
 * ERP Integration Types
 * Defines all types used across the ERP integration layer
 */

// Configuration types
export interface ERPConfig {
  provider: 'axiscare' | 'hhaexchange' | 'csv_import';
  base_url?: string;
  api_key?: string;
  client_id?: string;
  client_secret?: string;
  state_code?: string;
  custom_headers?: Record<string, string>;
}

// Filter types
export interface CaregiverFilter {
  active_only?: boolean;
  search?: string;
  specialty?: string;
  state?: string;
  limit?: number;
  offset?: number;
}

export interface PatientFilter {
  active_only?: boolean;
  search?: string;
  caregiver_id?: string;
  state?: string;
  limit?: number;
  offset?: number;
}

// Data input types
export interface CaregiverCreateInput {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  ssn?: string;
  date_of_birth?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  license_number?: string;
  specializations?: string[];
  is_active?: boolean;
}

export interface CaregiverUpdateInput {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  ssn?: string;
  date_of_birth?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  license_number?: string;
  specializations?: string[];
  is_active?: boolean;
}

export interface PatientCreateInput {
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  is_active?: boolean;
}

export interface CredentialUpdateInput {
  status?: string;
  expiration_date?: string;
  issue_date?: string;
  credential_number?: string;
  issuing_body?: string;
}

// Date range type
export interface DateRange {
  start_date: string; // ISO 8601
  end_date: string;   // ISO 8601
}

// ERP data types (raw from ERP systems)
export interface ERPCaregiver {
  external_id: string;
  source_system: 'axiscare' | 'hhaexchange' | 'csv_import';
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  ssn?: string;
  date_of_birth?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  license_number?: string;
  specializations?: string[];
  is_active: boolean;
  hire_date?: string;
  termination_date?: string;
  raw_data?: Record<string, unknown>; // Store raw ERP response for debugging
  synced_at?: string;
}

export interface ERPPatient {
  external_id: string;
  source_system: 'axiscare' | 'hhaexchange' | 'csv_import';
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  is_active: boolean;
  assigned_caregivers?: string[]; // External IDs
  raw_data?: Record<string, unknown>;
  synced_at?: string;
}

export interface ERPCredential {
  external_id: string;
  source_system: 'axiscare' | 'hhaexchange' | 'csv_import';
  caregiver_external_id: string;
  credential_type: string;
  credential_name: string;
  status: string;
  expiration_date?: string;
  issue_date?: string;
  credential_number?: string;
  issuing_body?: string;
  raw_data?: Record<string, unknown>;
  synced_at?: string;
}

export interface ERPScheduleEntry {
  external_id: string;
  source_system: 'axiscare' | 'hhaexchange' | 'csv_import';
  caregiver_external_id: string;
  patient_external_id?: string;
  start_time: string; // ISO 8601
  end_time: string;   // ISO 8601
  shift_type?: string;
  status?: string;
  raw_data?: Record<string, unknown>;
}

// Normalized types (what we store in KodaConnect)
export interface NormalizedCaregiver {
  external_id: string;
  source_system: 'axiscare' | 'hhaexchange' | 'csv_import';
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  ssn: string | null;
  date_of_birth: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  license_number: string | null;
  specializations: string[];
  is_active: boolean;
  hire_date: string | null;
  termination_date: string | null;
}

export interface NormalizedPatient {
  external_id: string;
  source_system: 'axiscare' | 'hhaexchange' | 'csv_import';
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  is_active: boolean;
}

export interface NormalizedCredential {
  external_id: string;
  source_system: 'axiscare' | 'hhaexchange' | 'csv_import';
  caregiver_external_id: string;
  credential_type: string;
  credential_name: string;
  status: string;
  expiration_date: string | null;
  issue_date: string | null;
  credential_number: string | null;
  issuing_body: string | null;
}

// Sync result types
export interface ERPSyncResult {
  sync_id: string;
  company_id: string;
  provider: string;
  sync_type: 'full' | 'caregivers' | 'patients' | 'credentials' | 'schedule';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  total_records?: number;
  synced_records?: number;
  skipped_records?: number;
  error_records?: number;
  errors?: Array<{
    record_id?: string;
    error_message: string;
  }>;
  raw_response?: Record<string, unknown>;
}

export interface ERPSyncLog {
  id: string;
  company_id: string;
  provider: string;
  sync_type: 'full' | 'caregivers' | 'patients' | 'credentials' | 'schedule';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  total_records: number;
  synced_records: number;
  skipped_records: number;
  error_records: number;
  error_details: Array<{
    record_id?: string;
    error_message: string;
  }>;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// CSV Import types
export interface CSVColumn {
  index: number;
  header: string;
  sample_values: string[];
}

export interface CSVImportPreview {
  file_name: string;
  total_rows: number;
  columns: CSVColumn[];
  sample_rows: Record<string, string>[];
  suggested_mapping?: Record<string, string>; // source column -> target field
}

export interface CSVImportResult {
  imported: number;
  skipped: number;
  errors: Array<{
    row_number: number;
    error_message: string;
    data?: Record<string, string>;
  }>;
}

// Error types
export class ERPError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ERPError';
  }
}

export class ERPAuthError extends ERPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('AUTH_ERROR', message, 401, details);
    this.name = 'ERPAuthError';
  }
}

export class ERPRateLimitError extends ERPError {
  constructor(
    message: string,
    public retryAfter?: number,
    details?: Record<string, unknown>
  ) {
    super('RATE_LIMIT_ERROR', message, 429, details);
    this.name = 'ERPRateLimitError';
  }
}

export class ERPNotFoundError extends ERPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('NOT_FOUND_ERROR', message, 404, details);
    this.name = 'ERPNotFoundError';
  }
}

export class ERPValidationError extends ERPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ERPValidationError';
  }
}
