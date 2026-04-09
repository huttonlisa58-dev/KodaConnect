/**
 * CSV/Excel Import Adapter
 * Implements ERPAdapter for manual data upload and parsing
 */

import { BaseERPAdapter } from './adapter';
import {
  CaregiverFilter,
  PatientFilter,
  CaregiverCreateInput,
  CaregiverUpdateInput,
  ERPCaregiver,
  ERPPatient,
  ERPCredential,
  ERPScheduleEntry,
  DateRange,
  CredentialUpdateInput,
  ERPConfig,
  ERPValidationError,
  CSVColumn,
  CSVImportPreview,
  CSVImportResult,
} from './types';
import { normalizeCaregiver, normalizePatient, normalizeCredential } from './normalizer';

/**
 * CSV Import Adapter
 * Handles parsing and importing of CSV/Excel files
 */
export class CSVImportAdapter extends BaseERPAdapter {
  name = 'CSV Import';
  provider: 'csv_import' = 'csv_import';

  private parsedData?: Record<string, unknown>[];
  private columns?: string[];
  private columnMapping?: Record<string, string>; // source column -> target field

  protected async validateConnection(): Promise<void> {
    // CSV import doesn't require external connection
    // Just validate that config is present
    if (!this.config) {
      throw new ERPValidationError('CSV import config is required');
    }
  }

  /**
   * Parse CSV content into structured data
   */
  async parseCSV(
    content: string,
    options?: {
      delimiter?: string;
      hasHeader?: boolean;
      encoding?: string;
    }
  ): Promise<Record<string, unknown>[]> {
    const delimiter = options?.delimiter || ',';
    const hasHeader = options?.hasHeader ?? true;

    // Handle line breaks (both \r\n and \n)
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      throw new ERPValidationError('CSV file is empty');
    }

    let startLine = 0;
    let headers: string[] = [];

    if (hasHeader) {
      headers = this.parseCSVLine(lines[0], delimiter).map((h) => h.trim());
      startLine = 1;

      if (headers.length === 0) {
        throw new ERPValidationError('CSV header is empty');
      }
    } else {
      // Generate default headers if not provided
      const firstRowCols = this.parseCSVLine(lines[0], delimiter);
      headers = firstRowCols.map((_, i) => `Column_${i + 1}`);
    }

    const records: Record<string, unknown>[] = [];

    for (let i = startLine; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i], delimiter);
      const record: Record<string, unknown> = {};

      for (let j = 0; j < headers.length; j++) {
        record[headers[j]] = values[j] || '';
      }

      records.push(record);
    }

    this.parsedData = records;
    this.columns = headers;

    return records;
  }

  /**
   * Parse a single CSV line handling quoted fields
   */
  private parseCSVLine(line: string, delimiter: string = ','): string[] {
    const result: string[] = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          insideQuotes = !insideQuotes;
        }
      } else if (char === delimiter && !insideQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  /**
   * Get preview of parsed data with sample rows
   */
  getPreview(limit: number = 5): CSVImportPreview {
    if (!this.parsedData || !this.columns) {
      throw new ERPValidationError('No data parsed yet. Call parseCSV first.');
    }

    const sampleValues: Record<string, string[]> = {};
    for (const col of this.columns) {
      sampleValues[col] = [];
    }

    for (let i = 0; i < Math.min(limit, this.parsedData.length); i++) {
      const row = this.parsedData[i];
      for (const col of this.columns) {
        const val = row[col] ? String(row[col]) : '';
        if (!sampleValues[col].includes(val) && sampleValues[col].length < 3) {
          sampleValues[col].push(val);
        }
      }
    }

    const csvColumns: CSVColumn[] = this.columns.map((col, idx) => ({
      index: idx,
      header: col,
      sample_values: sampleValues[col],
    }));

    const sampleRows = this.parsedData.slice(0, limit);

    return {
      file_name: this.config?.custom_headers?.['x-file-name'] || 'imported_file.csv',
      total_rows: this.parsedData.length,
      columns: csvColumns,
      sample_rows: sampleRows as Record<string, string>[],
    };
  }

  /**
   * Set column mapping for import
   */
  setColumnMapping(mapping: Record<string, string>): void {
    this.columnMapping = mapping;
  }

  /**
   * Validate and apply column mapping
   */
  private mapRecord(record: Record<string, unknown>): Record<string, unknown> {
    if (!this.columnMapping) {
      return record;
    }

    const mapped: Record<string, unknown> = {};
    for (const [sourceCol, targetField] of Object.entries(this.columnMapping)) {
      if (record[sourceCol] !== undefined) {
        mapped[targetField] = record[sourceCol];
      }
    }

    return mapped;
  }

  /**
   * Validate import data
   */
  async validateImportData(): Promise<{
    valid: number;
    invalid: number;
    errors: Array<{ row_number: number; error: string; data: Record<string, unknown> }>;
  }> {
    if (!this.parsedData) {
      throw new ERPValidationError('No data parsed yet');
    }

    const errors: Array<{ row_number: number; error: string; data: Record<string, unknown> }> = [];
    let validCount = 0;

    for (let i = 0; i < this.parsedData.length; i++) {
      const record = this.mapRecord(this.parsedData[i]);

      try {
        // Try to normalize as caregiver first, then patient
        try {
          normalizeCaregiver('csv_import', record);
          validCount++;
        } catch {
          // Try as patient
          try {
            normalizePatient('csv_import', record);
            validCount++;
          } catch {
            throw new Error('Record does not match caregiver or patient schema');
          }
        }
      } catch (error) {
        errors.push({
          row_number: i + 1,
          error: error instanceof Error ? error.message : 'Unknown validation error',
          data: record,
        });
      }
    }

    return {
      valid: validCount,
      invalid: errors.length,
      errors,
    };
  }

  /**
   * Import parsed and mapped data
   */
  async importData(): Promise<CSVImportResult> {
    if (!this.parsedData) {
      throw new ERPValidationError('No data parsed yet');
    }

    const result: CSVImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
    };

    for (let i = 0; i < this.parsedData.length; i++) {
      const record = this.mapRecord(this.parsedData[i]);

      try {
        // Try to import as caregiver or patient
        let isValid = false;

        try {
          normalizeCaregiver('csv_import', record);
          isValid = true;
        } catch {
          try {
            normalizePatient('csv_import', record);
            isValid = true;
          } catch (err) {
            throw err;
          }
        }

        if (isValid) {
          result.imported++;
        }
      } catch (error) {
        result.errors.push({
          row_number: i + 1,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          data: record as Record<string, string>,
        });
      }
    }

    result.skipped = result.errors.length;

    return result;
  }

  // Implement required abstract methods (not used for CSV import)

  async getCaregivers(_filters?: CaregiverFilter): Promise<ERPCaregiver[]> {
    return [];
  }

  async getCaregiver(_externalId: string): Promise<ERPCaregiver> {
    throw new Error('CSV import does not support direct caregiver lookup');
  }

  async createCaregiver(_data: CaregiverCreateInput): Promise<ERPCaregiver> {
    throw new Error('CSV import does not support direct caregiver creation');
  }

  async updateCaregiver(_externalId: string, _data: CaregiverUpdateInput): Promise<ERPCaregiver> {
    throw new Error('CSV import does not support direct caregiver updates');
  }

  async getPatients(_filters?: PatientFilter): Promise<ERPPatient[]> {
    return [];
  }

  async getPatient(_externalId: string): Promise<ERPPatient> {
    throw new Error('CSV import does not support direct patient lookup');
  }

  async getCredentials(_caregiverId: string): Promise<ERPCredential[]> {
    return [];
  }

  async updateCredential(_credentialId: string, _data: CredentialUpdateInput): Promise<ERPCredential> {
    throw new Error('CSV import does not support credential updates');
  }

  async getSchedule(_caregiverId: string, _dateRange: DateRange): Promise<ERPScheduleEntry[]> {
    return [];
  }
}

/**
 * Helper function to parse Excel files
 * Note: Requires 'xlsx' library to be installed
 * For now, returns a placeholder
 */
export async function parseExcel(
  buffer: ArrayBuffer,
  _options?: {
    sheet?: string;
    hasHeader?: boolean;
  }
): Promise<Record<string, unknown>[]> {
  // This would use the 'xlsx' library in production
  // For now, throw an error suggesting CSV import
  throw new Error(
    'Excel import requires xlsx library. Please convert to CSV first or install xlsx dependency.'
  );
}

/**
 * Helper function to validate and normalize CSV data
 */
export async function validateImportData(
  data: Record<string, unknown>[],
  type: 'caregivers' | 'patients' | 'credentials'
): Promise<{
  valid: number;
  invalid: number;
  errors: Array<{
    row_number: number;
    error: string;
  }>;
}> {
  const errors: Array<{ row_number: number; error: string }> = [];
  let validCount = 0;

  for (let i = 0; i < data.length; i++) {
    try {
      if (type === 'caregivers') {
        normalizeCaregiver('csv_import', data[i]);
      } else if (type === 'patients') {
        normalizePatient('csv_import', data[i]);
      } else if (type === 'credentials') {
        normalizeCredential('csv_import', data[i]);
      }
      validCount++;
    } catch (error) {
      errors.push({
        row_number: i + 1,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      });
    }
  }

  return {
    valid: validCount,
    invalid: errors.length,
    errors,
  };
}

/**
 * Generate column mapping suggestions for CSV import
 */
export function suggestColumnMapping(
  sourceColumns: string[],
  targetType: 'caregivers' | 'patients'
): Record<string, string> {
  const caregiverFields = [
    'first_name',
    'last_name',
    'email',
    'phone',
    'ssn',
    'date_of_birth',
    'address',
    'city',
    'state',
    'zip',
    'license_number',
  ];

  const patientFields = [
    'first_name',
    'last_name',
    'date_of_birth',
    'phone',
    'email',
    'address',
    'city',
    'state',
    'zip',
  ];

  const targetFields = targetType === 'caregivers' ? caregiverFields : patientFields;
  const mapping: Record<string, string> = {};

  for (const sourceCol of sourceColumns) {
    const sourceLower = sourceCol.toLowerCase().replace(/[\s_-]/g, '');

    for (const targetField of targetFields) {
      const targetLower = targetField.toLowerCase().replace(/[\s_-]/g, '');

      if (sourceLower === targetLower) {
        mapping[sourceCol] = targetField;
        break;
      }

      if (sourceLower.includes(targetLower) || targetLower.includes(sourceLower)) {
        mapping[sourceCol] = targetField;
        break;
      }
    }
  }

  return mapping;
}
