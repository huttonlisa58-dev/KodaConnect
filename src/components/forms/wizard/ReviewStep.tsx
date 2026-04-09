'use client';

import {
  Loader2,
  AlertCircle,
  CheckCircle,
  Save,
  Send,
  Check,
  ChevronLeft,
} from 'lucide-react';
import { FormDefinition, FormSection, FormSubmissionData, getVisibleFields } from '@/lib/form-engine';

interface ReviewStepProps {
  definition: FormDefinition;
  sectionsWithFields: FormSection[];
  formData: FormSubmissionData;
  onEdit: (stepIndex: number) => void;
  onSubmit: () => Promise<void>;
  onBack: () => void;
  onSaveDraft?: () => Promise<void>;
  submitting: boolean;
  submitError: string | null;
  completion: number;
  brandColors: {
    primary: string;
    primaryLight: string;
    primaryMedium: string;
  };
}

export function ReviewStep({
  definition,
  sectionsWithFields,
  formData,
  onEdit,
  onSubmit,
  onBack,
  onSaveDraft,
  submitting,
  submitError,
  completion,
  brandColors,
}: ReviewStepProps) {
  const { primary, primaryLight } = brandColors;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f8fafb' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-bold text-gray-900 truncate">{definition.form_name}</h1>
            <span className="text-xs font-medium shrink-0 ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: primaryLight, color: primary }}>
              Review & Submit
            </span>
          </div>
        </div>
        {/* Full progress bar */}
        <div className="h-1" style={{ backgroundColor: primary }} />
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-8">
        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Completion badge */}
        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: primaryLight, border: `1px solid ${primary}20` }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${primary}15` }}
            >
              <CheckCircle className="w-6 h-6" style={{ color: primary }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Almost Done!</h2>
              <p className="text-sm text-gray-500">Review your information below</p>
            </div>
          </div>
          {/* Completion bar */}
          <div className="h-2 bg-white rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${completion}%`, backgroundColor: primary }}
            />
          </div>
          <p className="text-xs mt-1.5 text-right" style={{ color: primary }}>{completion}% complete</p>
        </div>

        {/* Review fields */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {sectionsWithFields.map((section, idx) => {
            const visibleFields = getVisibleFields(section, formData).filter((f) => !(f as any).hidden);
            return (
              <div key={section.section_id} className={idx > 0 ? 'border-t border-gray-100' : ''}>
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50/80">
                  <h3 className="font-semibold text-gray-700 text-sm">{section.title}</h3>
                  <button
                    onClick={() => onEdit(idx)}
                    className="text-xs font-medium hover:underline px-2 py-1 rounded-md"
                    style={{ color: primary, backgroundColor: primaryLight }}
                  >
                    Edit
                  </button>
                </div>
                <div className="px-5 py-3 space-y-2.5">
                  {visibleFields.map((field) => {
                    const val = formData[field.field_id];
                    let displayVal = '';
                    if (field.type === 'signature') {
                      displayVal = val ? 'Signed' : 'Not signed';
                    } else if (field.type === 'checkbox') {
                      displayVal = val ? 'Yes' : 'No';
                    } else if (Array.isArray(val)) {
                      displayVal = val.join(', ') || 'None';
                    } else {
                      displayVal = val?.toString() || '—';
                    }
                    return (
                      <div key={field.field_id} className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">{field.label}</span>
                        <div className="flex items-center gap-1.5">
                          {val && (
                            <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          )}
                          <span className={`font-medium ${val ? 'text-gray-900' : 'text-red-400'}`}>
                            {displayVal}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action buttons */}
        <div className="space-y-3 pt-2 pb-4">
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="w-full text-white py-3.5 rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md text-base"
            style={{ backgroundColor: primary }}
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            Submit Form
          </button>

          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="flex-1 border-2 border-gray-200 text-gray-600 py-3 rounded-xl hover:bg-gray-50 flex items-center justify-center gap-1 font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            {onSaveDraft && (
              <button
                onClick={onSaveDraft}
                disabled={submitting}
                className="flex-1 border-2 border-gray-200 text-gray-600 py-3 rounded-xl hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-1 font-medium"
              >
                <Save className="w-4 h-4" />
                Save Draft
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
