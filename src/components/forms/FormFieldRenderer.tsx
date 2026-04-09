'use client';

import { FormField, FormSubmissionData, isFieldVisible } from '@/lib/form-engine';
import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import SignatureCanvas from './SignatureCanvas';
import CheckboxGrid from './CheckboxGrid';
import type { SignatureSecurityMetadata } from '@/lib/esignature-security';

interface FormFieldRendererProps {
  field: FormField;
  value: any;
  onChange: (fieldId: string, value: any) => void;
  error?: string;
  readOnly?: boolean;
  formData: FormSubmissionData;
  onSignatureSecurityMetadata?: (fieldId: string, metadata: SignatureSecurityMetadata) => void;
}

export default function FormFieldRenderer({
  field,
  value,
  onChange,
  error,
  readOnly = false,
  formData,
  onSignatureSecurityMetadata,
}: FormFieldRendererProps) {
  const [charCount, setCharCount] = useState((value || '').length);

  // Check if field should be visible
  if (field.show_if && !isFieldVisible(field, formData)) {
    return null;
  }

  const handleChange = (newValue: any) => {
    onChange(field.field_id, newValue);
  };

  const baseInputClasses = `w-full px-4 py-2.5 border rounded-lg transition-colors text-gray-900 placeholder:text-gray-400 ${
    error
      ? 'border-red-500 bg-red-50 focus:ring-red-500'
      : 'border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  } ${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`;

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-900">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Text Input */}
      {field.type === 'text' && (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={readOnly}
          className={baseInputClasses}
        />
      )}

      {/* Email Input */}
      {field.type === 'email' && (
        <input
          type="email"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={readOnly}
          className={baseInputClasses}
        />
      )}

      {/* Phone Input */}
      {field.type === 'phone' && (
        <input
          type="tel"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={field.placeholder || '(123) 456-7890'}
          disabled={readOnly}
          className={baseInputClasses}
        />
      )}

      {/* Date Input — defaults to today if no value set */}
      {field.type === 'date' && (() => {
        // Use local date to avoid UTC offset shifting the day
        const n = new Date();
        const localToday = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
        return (
          <input
            type="date"
            value={value || localToday}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => {
              if (!value) handleChange(localToday);
            }}
            disabled={readOnly}
            className={baseInputClasses}
          />
        );
      })()}

      {/* Number Input */}
      {field.type === 'number' && (
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => handleChange(e.target.value ? Number(e.target.value) : null)}
          placeholder={field.placeholder}
          disabled={readOnly}
          className={baseInputClasses}
          min={field.validation?.min}
          max={field.validation?.max}
        />
      )}

      {/* Textarea */}
      {field.type === 'textarea' && (
        <>
          <textarea
            value={value || ''}
            onChange={(e) => {
              handleChange(e.target.value);
              setCharCount(e.target.value.length);
            }}
            placeholder={field.placeholder}
            disabled={readOnly}
            className={`${baseInputClasses} resize-none h-24`}
            maxLength={field.validation?.max_length}
          />
          <div className="text-xs text-gray-500 text-right">
            {charCount}
            {field.validation?.max_length && `/${field.validation.max_length}`} characters
          </div>
        </>
      )}

      {/* Single Checkbox */}
      {field.type === 'checkbox' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value || false}
            onChange={(e) => handleChange(e.target.checked)}
            disabled={readOnly}
            className="w-4 h-4 border-gray-300 rounded cursor-pointer"
          />
          <span className="text-sm text-gray-800">{field.placeholder || 'Check to confirm'}</span>
        </label>
      )}

      {/* Checkbox Group */}
      {field.type === 'checkbox_group' && field.options && (
        <div className="space-y-2">
          {field.options.map((option) => (
            <label key={option.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(value || []).includes(option.value)}
                onChange={(e) => {
                  const newValue = e.target.checked
                    ? [...(value || []), option.value]
                    : (value || []).filter((v: string) => v !== option.value);
                  handleChange(newValue);
                }}
                disabled={readOnly}
                className="w-4 h-4 border-gray-300 rounded cursor-pointer"
              />
              <span className="text-sm text-gray-800">{option.label}</span>
            </label>
          ))}
        </div>
      )}

      {/* Checkbox Grid */}
      {field.type === 'checkbox_grid' && field.rows && field.columns && (
        <CheckboxGrid
          rows={field.rows}
          columns={field.columns}
          value={value || {}}
          onChange={handleChange}
          readOnly={readOnly}
        />
      )}

      {/* Radio Group */}
      {field.type === 'radio' && field.options && (
        <div className="space-y-2">
          {field.options.map((option) => (
            <label key={option.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={field.field_id}
                value={option.value}
                checked={value === option.value}
                onChange={(e) => handleChange(e.target.value)}
                disabled={readOnly}
                className="w-4 h-4 border-gray-300 cursor-pointer"
              />
              <span className="text-sm text-gray-800">{option.label}</span>
            </label>
          ))}
        </div>
      )}

      {/* Select Dropdown */}
      {field.type === 'select' && field.options && (
        <select
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={readOnly}
          className={baseInputClasses}
        >
          <option value="">Select {field.label}...</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {/* File Upload */}
      {field.type === 'file_upload' && (
        <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          error ? 'border-red-300 bg-red-50' : 'border-gray-300 hover:border-gray-400'
        } ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <input
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleChange(file);
              }
            }}
            disabled={readOnly}
            className="hidden"
            id={`file-${field.field_id}`}
          />
          <label htmlFor={`file-${field.field_id}`} className={readOnly ? '' : 'cursor-pointer'}>
            <div className="text-gray-600">
              {value ? (
                <>
                  <p className="font-medium text-green-600">{(value as File).name}</p>
                  <p className="text-xs text-gray-500">
                    {((value as File).size / 1024).toFixed(1)} KB
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Drag and drop file here</p>
                  <p className="text-xs text-gray-500">or click to browse</p>
                </>
              )}
            </div>
          </label>
        </div>
      )}

      {/* Signature Canvas */}
      {field.type === 'signature' && (
        <SignatureCanvas
          value={value}
          onChange={handleChange}
          readOnly={readOnly}
          onSecurityMetadata={onSignatureSecurityMetadata ? (metadata) => onSignatureSecurityMetadata(field.field_id, metadata) : undefined}
        />
      )}

      {/* Help Text */}
      {field.help_text && (
        <p className="text-xs text-gray-500 mt-1">{field.help_text}</p>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex gap-2 items-start mt-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
