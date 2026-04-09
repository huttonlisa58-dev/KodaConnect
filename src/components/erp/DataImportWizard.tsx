/**
 * Data Import Wizard Component
 * Multi-step CSV/Excel import wizard with column mapping
 */

'use client';

import { useState, useRef } from 'react';
import { CSVImportPreview, CSVImportResult } from '@/lib/erp/types';

interface DataImportWizardProps {
  importType?: 'caregivers' | 'patients' | 'credentials';
  companyId?: string;
  onImportComplete?: (result: CSVImportResult) => void;
}

type WizardStep = 'upload' | 'mapping' | 'preview' | 'complete';

interface ImportState {
  fileContent?: string;
  fileName?: string;
  preview?: CSVImportPreview;
  columnMapping: Record<string, string>;
  result?: CSVImportResult;
}

export function DataImportWizard({
  importType = 'caregivers',
  companyId,
  onImportComplete,
}: DataImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [state, setState] = useState<ImportState>({
    columnMapping: {},
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      setError(null);

      const content = await file.text();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', importType);

      const response = await fetch('/api/erp/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to parse file');
      }

      const data = await response.json() as { preview: CSVImportPreview };
      setState((prev) => ({
        ...prev,
        fileContent: content,
        fileName: file.name,
        preview: data.preview,
        columnMapping: data.preview.suggested_mapping || {},
      }));

      setStep('mapping');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleColumnMappingChange = (sourceCol: string, targetField: string) => {
    setState((prev) => ({
      ...prev,
      columnMapping: {
        ...prev.columnMapping,
        [sourceCol]: targetField,
      },
    }));
  };

  const handleProceedToPreview = () => {
    if (!state.preview) return;

    // Validate that all required fields are mapped
    const requiredFields = importType === 'caregivers'
      ? ['first_name', 'last_name']
      : importType === 'patients'
        ? ['first_name', 'last_name']
        : ['credential_type', 'credential_name'];

    const mappedFields = Object.values(state.columnMapping);
    const hasMissingRequired = requiredFields.some((field) => !mappedFields.includes(field));

    if (hasMissingRequired) {
      setError(`Please map all required fields: ${requiredFields.join(', ')}`);
      return;
    }

    setStep('preview');
    setError(null);
  };

  const handleConfirmImport = async () => {
    if (!state.fileContent || !state.preview) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/erp/import', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_content: state.fileContent,
          column_mapping: state.columnMapping,
          import_type: importType,
          company_id: companyId,
        }),
      });

      const data = await response.json() as { import_result: CSVImportResult };

      if (!response.ok) {
        throw new Error(data.import_result?.errors?.[0]?.error_message || 'Import failed');
      }

      setState((prev) => ({
        ...prev,
        result: data.import_result,
      }));

      setStep('complete');
      onImportComplete?.(data.import_result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setState({ columnMapping: {} });
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {(['upload', 'mapping', 'preview', 'complete'] as const).map((s, idx) => (
            <div key={s} className="flex items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full font-medium ${
                  step === s || (idx < (['upload', 'mapping', 'preview', 'complete'] as const).indexOf(step))
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                {idx + 1}
              </div>
              {idx < 3 && (
                <div
                  className={`h-1 w-16 mx-2 ${
                    (idx < (['upload', 'mapping', 'preview', 'complete'] as const).indexOf(step))
                      ? 'bg-blue-600'
                      : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-sm text-gray-600">
          <span>Upload</span>
          <span>Map Columns</span>
          <span>Preview</span>
          <span>Complete</span>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 border border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20a4 4 0 004 4h24a4 4 0 004-4V20"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M32 4v12M20 16v12" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-900">Upload CSV/Excel File</h3>
          <p className="mt-1 text-sm text-gray-500">
            Upload a CSV or Excel file with your {importType} data
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            disabled={isLoading}
            className="mt-4 hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isLoading ? 'Processing...' : 'Select File'}
          </button>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === 'mapping' && state.preview && (
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Map CSV Columns</h3>
            <p className="text-sm text-gray-600 mb-4">
              Select which KodaConnect field each CSV column maps to
            </p>

            <div className="grid gap-4">
              {state.preview.columns.slice(0, 10).map((column) => (
                <div key={column.header} className="flex items-center space-x-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">
                      {column.header}
                    </label>
                    <p className="mt-1 text-xs text-gray-500">
                      Sample: {column.sample_values[0] || 'Empty'}
                    </p>
                  </div>
                  <select
                    value={state.columnMapping[column.header] || ''}
                    onChange={(e) => handleColumnMappingChange(column.header, e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">- Skip -</option>
                    {importType === 'caregivers' && (
                      <>
                        <option value="first_name">First Name</option>
                        <option value="last_name">Last Name</option>
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                        <option value="license_number">License Number</option>
                      </>
                    )}
                    {importType === 'patients' && (
                      <>
                        <option value="first_name">First Name</option>
                        <option value="last_name">Last Name</option>
                        <option value="phone">Phone</option>
                        <option value="email">Email</option>
                      </>
                    )}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between space-x-3">
            <button
              onClick={() => setStep('upload')}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleProceedToPreview}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Continue to Preview
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && state.preview && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Preview Data</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {state.preview.columns.slice(0, 5).map((col) => (
                    <th key={col.header} className="px-4 py-2 text-left font-medium text-gray-700">
                      {state.columnMapping[col.header] || col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.preview.sample_rows.slice(0, 3).map((row, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    {state.preview!.columns.slice(0, 5).map((col) => (
                      <td key={col.header} className="px-4 py-2 text-gray-900">
                        {String(row[col.header] || '').substring(0, 50)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            Total rows to import: <strong>{state.preview.total_rows}</strong>
          </p>

          <div className="mt-6 flex justify-between space-x-3">
            <button
              onClick={() => setStep('mapping')}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={isLoading}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-400"
            >
              {isLoading ? 'Importing...' : 'Import Data'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && state.result && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6">
          <div className="flex items-center space-x-3 mb-4">
            <svg className="h-6 w-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <h3 className="text-lg font-medium text-green-900">Import Complete</h3>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-white rounded p-4">
              <p className="text-sm text-gray-600">Imported</p>
              <p className="text-2xl font-bold text-green-600">{state.result.imported}</p>
            </div>
            <div className="bg-white rounded p-4">
              <p className="text-sm text-gray-600">Skipped</p>
              <p className="text-2xl font-bold text-yellow-600">{state.result.skipped}</p>
            </div>
            <div className="bg-white rounded p-4">
              <p className="text-sm text-gray-600">Errors</p>
              <p className="text-2xl font-bold text-red-600">{state.result.errors?.length || 0}</p>
            </div>
          </div>

          {state.result.errors && state.result.errors.length > 0 && (
            <div className="mt-4 bg-white rounded p-4 max-h-40 overflow-y-auto">
              <p className="text-sm font-medium text-gray-700 mb-2">Errors:</p>
              {state.result.errors.slice(0, 5).map((err, idx) => (
                <p key={idx} className="text-xs text-gray-600 mb-1">
                  Row {err.row_number}: {err.error_message}
                </p>
              ))}
            </div>
          )}

          <button
            onClick={handleReset}
            className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Import More Data
          </button>
        </div>
      )}
    </div>
  );
}
