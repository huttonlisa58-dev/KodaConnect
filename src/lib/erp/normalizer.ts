/**
 * Data Normalization Layer
 * Maps ERP-specific field names to KodaConnect standardized schema
 */

import {
  NormalizedCaregiver,
  NormalizedPatient,
  NormalizedCredential,
  ERPValidationError,
} from './types';

/**
 * Field mapping definitions for each ERP provider
 */
const AXISCARE_CAREGIVER_MAP: Record<string, string> = {
  EmployeeID: 'external_id',
  FirstName: 'first_name',
  LastName: 'last_name',
  Email: 'email',
  PhoneNumber: 'phone',
  SSN: 'ssn',
  DateOfBirth: 'date_of_birth',
  Address: 'address',
  City: 'city',
  State: 'state',
  ZipCode: 'zip',
  LicenseNumber: 'license_number',
  IsActive: 'is_active',
  HireDate: 'hire_date',
  TerminationDate: 'termination_date',
};

const HHAEXCHANGE_CAREGIVER_MAP: Record<string, string> = {
  CaregiverId: 'external_id',
  CaregiverFirstName: 'first_name',
  CaregiverLastName: 'last_name',
  CaregiverEmail: 'email',
  CaregiverPhone: 'phone',
  CaregiverSSN: 'ssn',
  CaregiverDOB: 'date_of_birth',
  CaregiverAddress: 'address',
  CaregiverCity: 'city',
  CaregiverState: 'state',
  CaregiverZip: 'zip',
  LicenseNo: 'license_number',
  Status: 'is_active',
  StartDate: 'hire_date',
  EndDate: 'termination_date',
};

/**
 * Normalize phone numbers to standardized format
 */
function normalizePhone(phone: string | undefined | null): string | null {
  if (!phone) return null;

  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 10) return null;

  const last4 = cleaned.slice(-4);
  const last10 = cleaned.slice(-10);
  return last10;
}

/**
 * Normalize dates to ISO 8601 format
 */
function normalizeDate(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

/**
 * Parse boolean values from various formats
 */
function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'active', 'y'].includes(value.toLowerCase());
  }
  if (typeof value === 'number') return value !== 0;
  return false;
}

/**
 * Normalize a caregiver record from any source
 */
export function normalizeCaregiver(
  source: 'axiscare' | 'hhaexchange' | 'csv_import',
  rawData: Record<string, unknown>,
  specializations?: string[]
): NormalizedCaregiver {
  const map = source === 'axiscare' ? AXISCARE_CAREGIVER_MAP : HHAEXCHANGE_CAREGIVER_MAP;

  // Extract values using source-specific mapping
  const getField = (key: string, defaultValue: unknown = null): unknown => {
    for (const [sourceKey, targetKey] of Object.entries(map)) {
      if (targetKey === key && rawData[sourceKey] !== undefined) {
        return rawData[sourceKey];
      }
    }
    return rawData[key] ?? defaultValue;
  };

  // Get ID field (required)
  const externalId =
    source === 'axiscare'
      ? (getField('external_id') as string)
      : (getField('external_id') as string);

  if (!externalId) {
    throw new ERPValidationError('Missing required field: external_id', {
      source,
      data: rawData,
    });
  }

  const normalized: NormalizedCaregiver = {
    external_id: String(externalId),
    source_system: source,
    first_name: String(getField('first_name') || '').trim(),
    last_name: String(getField('last_name') || '').trim(),
    email: String(getField('email') || '').trim() || null,
    phone: normalizePhone(getField('phone') as string),
    ssn: getField('ssn') ? String(getField('ssn')).replace(/\D/g, '') : null,
    date_of_birth: normalizeDate(getField('date_of_birth') as string),
    address: String(getField('address') || '').trim() || null,
    city: String(getField('city') || '').trim() || null,
    state: String(getField('state') || '').trim() || null,
    zip: String(getField('zip') || '').trim() || null,
    license_number: String(getField('license_number') || '').trim() || null,
    specializations: specializations || [],
    is_active: parseBoolean(getField('is_active', true)),
    hire_date: normalizeDate(getField('hire_date') as string),
    termination_date: normalizeDate(getField('termination_date') as string),
  };

  // Validate required fields
  if (!normalized.first_name || !normalized.last_name) {
    throw new ERPValidationError('Missing required fields: first_name and/or last_name', {
      source,
      data: rawData,
    });
  }

  return normalized;
}

/**
 * Normalize a patient record from any source
 */
export function normalizePatient(
  source: 'axiscare' | 'hhaexchange' | 'csv_import',
  rawData: Record<string, unknown>
): NormalizedPatient {
  const getField = (key: string, defaultValue: unknown = null): unknown => {
    return rawData[key] ?? defaultValue;
  };

  const externalId = getField('external_id') || getField('patient_id') || getField('id');
  if (!externalId) {
    throw new ERPValidationError('Missing required field: external_id', {
      source,
      data: rawData,
    });
  }

  const normalized: NormalizedPatient = {
    external_id: String(externalId),
    source_system: source,
    first_name: String(getField('first_name') || '').trim(),
    last_name: String(getField('last_name') || '').trim(),
    date_of_birth: normalizeDate(getField('date_of_birth') as string),
    phone: normalizePhone(getField('phone') as string),
    email: String(getField('email') || '').trim() || null,
    address: String(getField('address') || '').trim() || null,
    city: String(getField('city') || '').trim() || null,
    state: String(getField('state') || '').trim() || null,
    zip: String(getField('zip') || '').trim() || null,
    is_active: parseBoolean(getField('is_active', true)),
  };

  // Validate required fields
  if (!normalized.first_name || !normalized.last_name) {
    throw new ERPValidationError('Missing required fields: first_name and/or last_name', {
      source,
      data: rawData,
    });
  }

  return normalized;
}

/**
 * Normalize a credential record from any source
 */
export function normalizeCredential(
  source: 'axiscare' | 'hhaexchange' | 'csv_import',
  rawData: Record<string, unknown>
): NormalizedCredential {
  const getField = (key: string, defaultValue: unknown = null): unknown => {
    return rawData[key] ?? defaultValue;
  };

  const externalId = getField('external_id') || getField('credential_id') || getField('id');
  const caregiverExternalId =
    getField('caregiver_external_id') || getField('caregiver_id') || getField('employee_id');

  if (!externalId || !caregiverExternalId) {
    throw new ERPValidationError(
      'Missing required fields: external_id and/or caregiver_external_id',
      { source, data: rawData }
    );
  }

  const normalized: NormalizedCredential = {
    external_id: String(externalId),
    source_system: source,
    caregiver_external_id: String(caregiverExternalId),
    credential_type: String(getField('credential_type') || getField('type') || 'Unknown'),
    credential_name: String(getField('credential_name') || getField('name') || 'Unknown'),
    status: String(getField('status') || 'Active'),
    expiration_date: normalizeDate(getField('expiration_date') as string),
    issue_date: normalizeDate(getField('issue_date') as string),
    credential_number: String(getField('credential_number') || '').trim() || null,
    issuing_body: String(getField('issuing_body') || '').trim() || null,
  };

  return normalized;
}

/**
 * Flatten a nested object to dot-notation keys
 * Used for CSV import to detect nested data structures
 */
export function flattenObject(obj: Record<string, unknown>, prefix: string = ''): Record<string, string> {
  const flattened: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      flattened[newKey] = '';
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value as Record<string, unknown>, newKey));
    } else if (Array.isArray(value)) {
      flattened[newKey] = Array.isArray(value) ? value.join('; ') : String(value);
    } else {
      flattened[newKey] = String(value);
    }
  }

  return flattened;
}

/**
 * Suggest column mapping for CSV import
 * Returns a mapping of source columns to target fields
 */
export function suggestColumnMapping(
  sourceColumns: string[],
  targetFields: string[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const targetFieldLower = targetFields.map((f) => f.toLowerCase());

  for (const sourceCol of sourceColumns) {
    const sourceLower = sourceCol.toLowerCase();
    let bestMatch = '';
    let bestScore = 0;

    for (const targetField of targetFields) {
      const targetLower = targetField.toLowerCase();
      let score = 0;

      // Exact match
      if (sourceLower === targetLower) {
        score = 100;
      }
      // Contains match
      else if (sourceLower.includes(targetLower) || targetLower.includes(sourceLower)) {
        score = 80;
      }
      // Similar length and some common chars
      else if (
        Math.abs(sourceLower.length - targetLower.length) <= 3 &&
        sourceLower.split('').filter((c) => targetLower.includes(c)).length > 3
      ) {
        score = 50;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = targetField;
      }
    }

    if (bestScore > 40) {
      mapping[sourceCol] = bestMatch;
    }
  }

  return mapping;
}
