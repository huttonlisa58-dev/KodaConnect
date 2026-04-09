'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, XCircle } from 'lucide-react';
import { FormDefinition, FormSection, FormField, FormSubmissionData, getVisibleFields } from '@/lib/form-engine';
import FormFieldRenderer from '@/components/forms/FormFieldRenderer';

interface FormDataViewerProps {
  definition: FormDefinition;
  formData: FormSubmissionData;
  editMode?: boolean;
  onChange?: (fieldId: string, value: any) => void;
  editedFields?: Set<string>;
}

function FieldValue({ field, value }: { field: FormField; value: any }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-400">Not provided</span>;
  }

  switch (field.type) {
    case 'signature':
      return (
        <div className="flex flex-col items-start gap-2">
          <img
            src={value}
            alt="Signature"
            className="max-w-xs max-h-24 border-2 border-gray-300 rounded-md p-2 bg-gray-50"
          />
          <span className="text-xs font-medium text-gray-600">Signed</span>
        </div>
      );
    case 'checkbox':
      return value ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
            <CheckCircle2 className="w-4 h-4 mr-1" />
            Checked
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
            <XCircle className="w-4 h-4 mr-1" />
            Not checked
          </span>
        </div>
      );
    case 'radio':
    case 'select':
      const option = field.options?.find((opt) => opt.value === value);
      return <span className="text-gray-900 font-medium">{option?.label || value}</span>;
    case 'checkbox_group':
      if (Array.isArray(value)) {
        return (
          <div className="flex flex-wrap gap-2">
            {value.map((v) => {
              const option = field.options?.find((opt) => opt.value === v);
              return (
                <span
                  key={v}
                  className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 border border-blue-200"
                >
                  {option?.label || v}
                </span>
              );
            })}
          </div>
        );
      }
      return <span className="text-gray-900">{String(value)}</span>;
    case 'checkbox_grid':
      if (typeof value === 'object' && value !== null) {
        return (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <tbody className="divide-y divide-gray-200">
                {Object.entries(value).map(([rowKey, checked]) => {
                  const row = field.rows?.find((r) => r.row_id === rowKey);
                  return (
                    <tr key={rowKey} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm font-medium text-gray-700">
                        {row?.label || rowKey}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {checked ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-gray-300" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }
      return <span className="text-gray-900">{String(value)}</span>;
    case 'textarea':
      return (
        <p className="text-gray-900 whitespace-pre-wrap max-h-32 overflow-y-auto bg-gray-50 p-3 rounded border border-gray-200">
          {String(value)}
        </p>
      );
    case 'file_upload':
      if (typeof value === 'string') {
        return (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline font-medium">
            Download file
          </a>
        );
      }
      return <span className="text-gray-900">{String(value)}</span>;
    default:
      return <span className="text-gray-900">{String(value)}</span>;
  }
}

export function FormDataViewer({
  definition,
  formData,
  editMode = false,
  onChange,
  editedFields,
}: FormDataViewerProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set([definition.sections?.[0]?.section_id])
  );

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const sections = definition.sections || [];

  return (
    <div className="space-y-4">
      {sections.map((section: FormSection) => {
        const visibleFields = getVisibleFields(section, formData);

        // Skip sections with no visible fields
        if (visibleFields.length === 0) {
          return null;
        }

        const isExpanded = expandedSections.has(section.section_id);

        return (
          <div key={section.section_id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => toggleSection(section.section_id)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">{section.title}</h3>
                <p className="text-sm text-gray-600">
                  {visibleFields.length} field{visibleFields.length !== 1 ? 's' : ''}
                </p>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {isExpanded && (
              <div className="border-t border-gray-200 px-6 py-4 space-y-6">
                {visibleFields.map((field: FormField) => {
                  const value = formData[field.field_id];
                  const isEdited = editedFields?.has(field.field_id);
                  const borderClass = isEdited ? 'border-l-4 border-amber-400 pl-4' : '';

                  return (
                    <div key={field.field_id} className={borderClass}>
                      <label className="block text-sm font-medium text-gray-900 mb-2">
                        {field.label}
                        {field.required && <span className="text-red-600 ml-1">*</span>}
                      </label>

                      {editMode && onChange ? (
                        <FormFieldRenderer
                          field={field}
                          value={value}
                          onChange={onChange}
                          formData={formData}
                          readOnly={false}
                        />
                      ) : (
                        <div className="text-gray-700">
                          <FieldValue field={field} value={value} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {sections.filter((s) => getVisibleFields(s, formData).length > 0).length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No form sections available
        </div>
      )}
    </div>
  );
}
