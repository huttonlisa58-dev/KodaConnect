'use client';

import {
  FormDefinition,
  FormSubmissionData,
  validateForm,
  createEmptySubmission,
  calculateFormCompletion,
  getVisibleFields,
  ValidationError,
} from '@/lib/form-engine';
import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Save, Send, Loader } from 'lucide-react';
import DOMPurify from 'dompurify';
import { replaceTemplateVariables } from '@/lib/template-utils';
import FormFieldRenderer from './FormFieldRenderer';

interface DynamicFormProps {
  definition: FormDefinition;
  initialData?: FormSubmissionData;
  onSubmit: (data: FormSubmissionData) => Promise<void>;
  onSaveDraft?: (data: FormSubmissionData) => Promise<void>;
  readOnly?: boolean;
  brandColors?: { primary: string; secondary: string; accent: string };
}

export default function DynamicForm({
  definition,
  initialData,
  onSubmit,
  onSaveDraft,
  readOnly = false,
  brandColors = { primary: '#2563eb', secondary: '#64748b', accent: '#3b82f6' },
}: DynamicFormProps) {
  const [formData, setFormData] = useState<FormSubmissionData>(
    initialData || createEmptySubmission(definition)
  );
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(definition.sections.map((s) => s.section_id))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const completion = calculateFormCompletion(definition, formData);

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
    // Clear error for this field
    setErrors((prev) => prev.filter((e) => e.field_id !== fieldId));
  };

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    const validationErrors = validateForm(definition, formData);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (error) {
      console.error('Form submission error:', error);
      setErrors([
        {
          field_id: '',
          label: 'Submission Error',
          message: 'Failed to submit form. Please try again.',
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!onSaveDraft) return;

    setIsSavingDraft(true);
    try {
      await onSaveDraft(formData);
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (error) {
      console.error('Draft save error:', error);
      setErrors([
        {
          field_id: '',
          label: 'Save Error',
          message: 'Failed to save draft. Please try again.',
        },
      ]);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const errorMap = new Map(errors.map((e) => [e.field_id, e]));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Form Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">{definition.form_name}</h1>
        {definition.description && (
          <p className="text-gray-600">{definition.description}</p>
        )}
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Form Progress</span>
          <span className="text-sm font-semibold" style={{ color: brandColors.primary }}>
            {completion}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{
              width: `${completion}%`,
              backgroundColor: brandColors.primary,
            }}
          />
        </div>
      </div>

      {/* Global Error Message */}
      {errors.length > 0 && errors[0].field_id === '' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-medium">{errors[0].message}</p>
        </div>
      )}

      {/* Success Message */}
      {submitSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 font-medium">
            {definition.status === 'draft' ? 'Draft saved successfully!' : 'Form submitted successfully!'}
          </p>
        </div>
      )}

      {/* Form Sections */}
      <div className="space-y-4">
        {definition.sections.map((section, sectionIndex) => {
          const visibleFields = getVisibleFields(section, formData);
          const isExpanded = expandedSections.has(section.section_id);

          return (
            <div
              key={section.section_id}
              className="border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Section Header */}
              <button
                type="button"
                onClick={() => toggleSection(section.section_id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                style={{
                  backgroundColor: isExpanded ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                  borderBottom: isExpanded ? `2px solid ${brandColors.primary}` : 'none',
                }}
              >
                <div className="text-left">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {sectionIndex + 1}. {section.title}
                  </h2>
                  {section.description && (
                    <p className="text-sm text-gray-600 mt-1">{section.description}</p>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-600 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-600 flex-shrink-0" />
                )}
              </button>

              {/* Section Content */}
              {isExpanded && (
                <div className="px-6 py-4 bg-white space-y-6 border-t border-gray-100">
                  {/* Static document content (policy text, legal language, etc.) */}
                  {section.content && (
                    <div
                      className="form-content prose prose-sm max-w-none text-gray-800 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(
                        replaceTemplateVariables(section.content, formData, section.fields)
                      ) }}
                    />
                  )}

                  {/* Fillable fields */}
                  {visibleFields.length === 0 && !section.content ? (
                    <p className="text-gray-500 text-sm">No fields to display in this section</p>
                  ) : visibleFields.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {visibleFields.map((field) => (
                        <div
                          key={field.field_id}
                          className={
                            field.type === 'textarea' ||
                            field.type === 'signature' ||
                            field.type === 'checkbox_grid' ||
                            field.type === 'file_upload'
                              ? 'md:col-span-2'
                              : ''
                          }
                        >
                          <FormFieldRenderer
                            field={field}
                            value={formData[field.field_id]}
                            onChange={handleFieldChange}
                            error={errorMap.get(field.field_id)?.message}
                            readOnly={readOnly}
                            formData={formData}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Form Actions */}
      {!readOnly && (
        <div className="flex gap-4 pt-6 border-t">
          {onSaveDraft && (
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isSubmitting}
              className="flex-1 px-6 py-3 flex items-center justify-center gap-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingDraft ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save as Draft
                </>
              )}
            </button>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isSavingDraft}
            className="flex-1 px-6 py-3 flex items-center justify-center gap-2 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: isSubmitting || isSavingDraft ? '#ccc' : brandColors.primary,
              cursor: isSubmitting || isSavingDraft ? 'not-allowed' : 'pointer',
            }}
          >
            {isSubmitting ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Form
              </>
            )}
          </button>
        </div>
      )}
    </form>
  );
}
