'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getOfficeUser } from '@/lib/auth';
import {
  GraduationCap,
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  Save,
} from 'lucide-react';
import Link from 'next/link';

interface QuizSettings {
  auto_grade: boolean;
  passing_score: number;
  sequential_sections: boolean;
  retake_enabled: boolean;
  total_questions: number;
}

interface FormWithQuiz {
  form_id: string;
  form_name: string;
  quiz_settings: QuizSettings;
}

export default function QuizSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<FormWithQuiz[]>([]);
  const [editingFormId, setEditingFormId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<QuizSettings>>({});
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const user = getOfficeUser();
    if (!user || user.role !== 'super_admin') {
      router.push('/office');
      return;
    }
    loadForms();
  }, []);

  async function loadForms() {
    setLoading(true);
    try {
      // Fetch all forms, then filter for ones with auto_grade
      const res = await fetch('/api/forms');
      if (!res.ok) throw new Error('Failed to load forms');
      const data = await res.json();
      const allForms = data.forms || [];

      // Filter for forms that have auto_grade in metadata
      const quizForms: FormWithQuiz[] = [];
      for (const form of allForms) {
        const meta = form.metadata || {};
        if (meta.auto_grade && meta.answer_key) {
          quizForms.push({
            form_id: form.form_id,
            form_name: form.form_name,
            quiz_settings: {
              auto_grade: meta.auto_grade ?? false,
              passing_score: meta.passing_score ?? 70,
              sequential_sections: meta.sequential_sections ?? false,
              retake_enabled: meta.retake_enabled ?? true,
              total_questions: meta.total_questions ?? 0,
            },
          });
        }
      }

      setForms(quizForms);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load forms');
    } finally {
      setLoading(false);
    }
  }

  function startEditing(form: FormWithQuiz) {
    setEditingFormId(form.form_id);
    setEditValues({
      passing_score: form.quiz_settings.passing_score,
      sequential_sections: form.quiz_settings.sequential_sections,
      retake_enabled: form.quiz_settings.retake_enabled,
    });
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function cancelEditing() {
    setEditingFormId(null);
    setEditValues({});
  }

  async function handleSave(formId: string) {
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/forms/${formId}/quiz-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editValues),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save');
      }

      const result = await res.json();

      // Update local state
      setForms((prev) =>
        prev.map((f) =>
          f.form_id === formId
            ? { ...f, quiz_settings: result.quiz_settings }
            : f
        )
      );

      setEditingFormId(null);
      setEditValues({});
      setSuccessMessage('Quiz settings saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-1">
            <Link
              href="/office/settings"
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <GraduationCap className="w-6 h-6" />
              Quiz & Training Settings
            </h1>
          </div>
          <p className="text-sm text-gray-500 ml-8">
            Configure passing scores, retakes, and section gating for training courses
          </p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Status Messages */}
        {successMessage && (
          <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-6 text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-6 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {errorMessage}
          </div>
        )}

        {/* No quiz forms */}
        {forms.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
            <GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-700 mb-2">No Quiz Forms Found</h2>
            <p className="text-sm text-gray-500">
              Import a form package with auto_grade enabled to configure quiz settings here.
            </p>
          </div>
        )}

        {/* Form List */}
        <div className="space-y-4">
          {forms.map((form) => {
            const isEditing = editingFormId === form.form_id;
            const qs = form.quiz_settings;

            return (
              <div key={form.form_id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                {/* Form Header */}
                <div className="px-6 py-4 border-b bg-gray-50">
                  <h3 className="font-semibold text-gray-900">{form.form_name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {qs.total_questions} questions · Form ID: {form.form_id.slice(0, 8)}…
                  </p>
                </div>

                {/* Settings */}
                <div className="px-6 py-4">
                  {!isEditing ? (
                    /* Read-only view */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Passing Score</span>
                        <span className="text-sm font-semibold text-gray-900">{qs.passing_score}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Sequential Sections</span>
                        <span className={`text-sm font-semibold ${qs.sequential_sections ? 'text-green-600' : 'text-gray-400'}`}>
                          {qs.sequential_sections ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Retakes Allowed</span>
                        <span className={`text-sm font-semibold ${qs.retake_enabled ? 'text-green-600' : 'text-red-600'}`}>
                          {qs.retake_enabled ? 'Yes' : 'No'}
                        </span>
                      </div>

                      <div className="pt-3 border-t">
                        <button
                          onClick={() => startEditing(form)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Edit Settings
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Editing view */
                    <div className="space-y-4">
                      {/* Passing Score */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Passing Score (%)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={editValues.passing_score ?? qs.passing_score}
                          onChange={(e) =>
                            setEditValues((prev) => ({
                              ...prev,
                              passing_score: parseInt(e.target.value) || 70,
                            }))
                          }
                          className="w-32 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          Caregivers must achieve this score to pass each quiz
                        </p>
                      </div>

                      {/* Sequential Sections */}
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-gray-700">Sequential Sections</span>
                          <p className="text-xs text-gray-400">
                            Require passing each quiz before advancing to the next section
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            setEditValues((prev) => ({
                              ...prev,
                              sequential_sections: !(prev.sequential_sections ?? qs.sequential_sections),
                            }))
                          }
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            (editValues.sequential_sections ?? qs.sequential_sections)
                              ? 'bg-blue-600'
                              : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                              (editValues.sequential_sections ?? qs.sequential_sections)
                                ? 'translate-x-5'
                                : ''
                            }`}
                          />
                        </button>
                      </div>

                      {/* Retakes */}
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-gray-700">Allow Retakes</span>
                          <p className="text-xs text-gray-400">
                            Let caregivers retake quizzes they fail
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            setEditValues((prev) => ({
                              ...prev,
                              retake_enabled: !(prev.retake_enabled ?? qs.retake_enabled),
                            }))
                          }
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            (editValues.retake_enabled ?? qs.retake_enabled)
                              ? 'bg-blue-600'
                              : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                              (editValues.retake_enabled ?? qs.retake_enabled)
                                ? 'translate-x-5'
                                : ''
                            }`}
                          />
                        </button>
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-3 border-t flex gap-3">
                        <button
                          onClick={() => handleSave(form.form_id)}
                          disabled={saving}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                          {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          Save Changes
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="px-4 py-2 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
