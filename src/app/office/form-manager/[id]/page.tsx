'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FormDefinition, FormSection, FormField, createEmptySubmission } from '@/lib/form-engine';
import {
  Save,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Eye,
  Download,
  Copy,
  ExternalLink,
  Smartphone,
  Loader2,
  FileText,
  Send,
  CheckCircle,
  AlertCircle,
  Upload,
  Zap,
  X,
  Code,
  Grid3X3,
} from 'lucide-react';
import Link from 'next/link';

const FIELD_TYPES = [
  { value: 'text', label: 'Text Input' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'checkbox_group', label: 'Checkbox Group' },
  { value: 'checkbox_grid', label: 'Checkbox Grid' },
  { value: 'radio', label: 'Radio Button' },
  { value: 'select', label: 'Dropdown' },
  { value: 'signature', label: 'Signature' },
  { value: 'file_upload', label: 'File Upload' },
];

export default function FormEditorPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.id as string;

  const [form, setForm] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  // PDF layout adjustment state
  const [hasPacket, setHasPacket] = useState(false);
  const [packetFieldCount, setPacketFieldCount] = useState(0);
  const [layoutInstructions, setLayoutInstructions] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustResult, setAdjustResult] = useState<{ success: boolean; message: string } | null>(null);

  // Test PDF + visual upload state
  const [generatingTestPdf, setGeneratingTestPdf] = useState(false);
  const [uploadedPdf, setUploadedPdf] = useState<File | null>(null);
  const pdfUploadRef = useRef<HTMLInputElement>(null);

  // Direct position editing state
  const [showPositionEditor, setShowPositionEditor] = useState(false);
  const [positionJson, setPositionJson] = useState('');
  const [importingPositions, setImportingPositions] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [generatingGrid, setGeneratingGrid] = useState(false);

  useEffect(() => {
    loadForm();
    loadPacketInfo();
  }, [formId]);

  async function loadForm() {
    setLoading(true);
    try {
      const response = await fetch(`/api/forms/${formId}`);
      if (!response.ok) throw new Error('Failed to load form');
      const data = await response.json();
      setForm(data.form);
      if (data.form.sections.length > 0) {
        setExpandedSectionId(data.form.sections[0].section_id);
      }
    } catch (error) {
      console.error('Failed to load form:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadPacketInfo() {
    try {
      const response = await fetch(`/api/forms/${formId}/adjust-positions`);
      if (response.ok) {
        const data = await response.json();
        setHasPacket(data.has_packet || false);
        setPacketFieldCount(data.field_count || 0);
      }
    } catch (error) {
      console.log('No packet info:', error);
    }
  }

  async function saveForm() {
    if (!form) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/forms/${formId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error('Failed to save form');
      alert('Form saved successfully!');
    } catch (error) {
      console.error('Failed to save form:', error);
      alert('Failed to save form');
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadPdf() {
    if (!form) return;
    setGeneratingPdf(true);
    try {
      const sampleData = createEmptySubmission(form);

      for (const section of form.sections) {
        for (const field of section.fields) {
          if (field.type === 'text' || field.type === 'email' || field.type === 'phone') {
            sampleData[field.field_id] = `Sample ${field.label}`;
          } else if (field.type === 'date') {
            sampleData[field.field_id] = new Date().toISOString().split('T')[0];
          } else if (field.type === 'number') {
            sampleData[field.field_id] = '123';
          } else if (field.type === 'textarea') {
            sampleData[field.field_id] = `Sample text for ${field.label}.`;
          } else if (field.type === 'checkbox') {
            sampleData[field.field_id] = true;
          } else if (field.type === 'checkbox_group' || field.type === 'checkbox_grid') {
            sampleData[field.field_id] = [];
          } else if (field.type === 'radio' || field.type === 'select') {
            sampleData[field.field_id] = '';
          }
        }
      }

      const response = await fetch(`/api/forms/${formId}/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_data: sampleData,
          applicant_name: 'Preview',
        }),
      });

      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${form.form_name.replace(/\s+/g, '_')}_preview.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleAdjustPositions() {
    if (!layoutInstructions.trim()) return;

    setAdjusting(true);
    setAdjustResult(null);

    try {
      let response: Response;

      if (uploadedPdf) {
        const formData = new FormData();
        formData.append('instructions', layoutInstructions);
        formData.append('pdf', uploadedPdf);
        formData.append('mode', 'adjust');

        response = await fetch(`/api/forms/${formId}/adjust-positions`, {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch(`/api/forms/${formId}/adjust-positions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instructions: layoutInstructions }),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        setAdjustResult({ success: false, message: data.error || 'Failed to adjust' });
        return;
      }

      const parts: string[] = [];
      if (data.positions_updated > 0) parts.push(`${data.positions_updated} repositioned`);
      if (data.fields_added > 0) parts.push(`${data.fields_added} added`);
      if (data.fields_deleted > 0) parts.push(`${data.fields_deleted} deleted`);
      if (data.fields_changed > 0) parts.push(`${data.fields_changed} changed`);
      const summary = parts.length > 0 ? parts.join(', ') : 'No changes needed';

      setAdjustResult({
        success: true,
        message: `${summary}. ${data.explanation}`,
      });
      setLayoutInstructions('');
      setUploadedPdf(null);

      if (data.fields_added > 0 || data.fields_deleted > 0 || data.fields_changed > 0) {
        loadForm();
      }
      loadPacketInfo();
    } catch (error) {
      setAdjustResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to adjust',
      });
    } finally {
      setAdjusting(false);
    }
  }

  async function handleGenerateTestPdf() {
    if (!form) return;
    setGeneratingTestPdf(true);

    try {
      const testDataResponse = await fetch(`/api/forms/${formId}/adjust-positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'generate_test_data' }),
      });

      const testDataResult = await testDataResponse.json();
      if (!testDataResponse.ok) throw new Error(testDataResult.error || 'Failed to generate test data');

      const pdfResponse = await fetch(`/api/forms/${formId}/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_data: testDataResult.test_data,
          applicant_name: 'TEST LAYOUT PREVIEW',
        }),
      });

      if (!pdfResponse.ok) throw new Error('Failed to generate PDF');

      const blob = await pdfResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${form.form_name.replace(/\s+/g, '_')}_TEST_LAYOUT.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate test PDF:', error);
      alert('Failed to generate test PDF. ' + (error instanceof Error ? error.message : ''));
    } finally {
      setGeneratingTestPdf(false);
    }
  }

  // ==================== NEW: Export / Import / Grid functions ====================

  async function handleExportPositions() {
    try {
      const response = await fetch(`/api/forms/${formId}/adjust-positions?raw=true`);
      if (!response.ok) throw new Error('Failed to export');
      const data = await response.json();

      // Format the JSON nicely
      const jsonStr = JSON.stringify(data.position_map, null, 2);

      // Show in the editor
      setPositionJson(jsonStr);
      setShowPositionEditor(true);
      setImportResult(null);

      // Also download as a file
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `position_map_${formId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to export positions: ' + (error instanceof Error ? error.message : ''));
    }
  }

  async function handleImportPositions() {
    if (!positionJson.trim()) return;

    setImportingPositions(true);
    setImportResult(null);

    try {
      // Validate JSON first
      let parsed;
      try {
        parsed = JSON.parse(positionJson);
      } catch (e) {
        setImportResult({ success: false, message: 'Invalid JSON. Please check the format.' });
        return;
      }

      const response = await fetch(`/api/forms/${formId}/adjust-positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'import_positions',
          position_map: parsed,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setImportResult({ success: false, message: data.error || 'Failed to import' });
        return;
      }

      setImportResult({ success: true, message: data.message });
      loadPacketInfo();
    } catch (error) {
      setImportResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to import',
      });
    } finally {
      setImportingPositions(false);
    }
  }

  async function handleGenerateGridPdf() {
    setGeneratingGrid(true);
    try {
      const response = await fetch(`/api/forms/${formId}/adjust-positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'generate_grid_pdf' }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate grid PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `grid_overlay_${formId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to generate grid PDF: ' + (error instanceof Error ? error.message : ''));
    } finally {
      setGeneratingGrid(false);
    }
  }

  // ==================== Standard form editor functions ====================

  function copyFormLink() {
    const link = `${window.location.origin}/apply/${formId}`;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function addSection() {
    if (!form) return;
    const newSection: FormSection = {
      section_id: `section_${Date.now()}`,
      title: 'New Section',
      order: form.sections.length,
      fields: [],
    };
    setForm({
      ...form,
      sections: [...form.sections, newSection],
    });
  }

  function deleteSection(sectionId: string) {
    if (!form) return;
    setForm({
      ...form,
      sections: form.sections.filter((s) => s.section_id !== sectionId),
    });
  }

  function updateSection(sectionId: string, updates: Partial<FormSection>) {
    if (!form) return;
    setForm({
      ...form,
      sections: form.sections.map((s) =>
        s.section_id === sectionId ? { ...s, ...updates } : s
      ),
    });
  }

  function addField(sectionId: string) {
    if (!form) return;
    const section = form.sections.find((s) => s.section_id === sectionId);
    if (!section) return;

    const newField: FormField = {
      field_id: `field_${Date.now()}`,
      label: 'New Field',
      type: 'text',
      required: false,
      order: section.fields.length,
    };

    setForm({
      ...form,
      sections: form.sections.map((s) =>
        s.section_id === sectionId
          ? { ...s, fields: [...s.fields, newField] }
          : s
      ),
    });
  }

  function deleteField(sectionId: string, fieldId: string) {
    if (!form) return;
    setForm({
      ...form,
      sections: form.sections.map((s) =>
        s.section_id === sectionId
          ? { ...s, fields: s.fields.filter((f) => f.field_id !== fieldId) }
          : s
      ),
    });
  }

  function updateField(sectionId: string, fieldId: string, updates: Partial<FormField>) {
    if (!form) return;
    setForm({
      ...form,
      sections: form.sections.map((s) =>
        s.section_id === sectionId
          ? {
              ...s,
              fields: s.fields.map((f) =>
                f.field_id === fieldId ? { ...f, ...updates } : f
              ),
            }
          : s
      ),
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Form not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{form.form_name}</h1>
            <p className="text-sm text-gray-500">v{form.version}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/office/form-manager/${formId}/preview`}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Preview
            </Link>
            <button
              onClick={handleDownloadPdf}
              disabled={generatingPdf}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {generatingPdf ? 'Generating...' : 'Download PDF'}
            </button>
            <button
              onClick={saveForm}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Form'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Panel - Form Editor */}
          <div className="lg:col-span-2 space-y-6">
            {/* Form Metadata */}
            <div className="bg-white rounded-lg border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Form Settings</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Form Name</label>
                <input
                  type="text"
                  value={form.form_name}
                  onChange={(e) => setForm({ ...form, form_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={form.description || ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Version</label>
                  <input
                    type="text"
                    value={form.version}
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Form Sections</h2>
                <button
                  onClick={addSection}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Section
                </button>
              </div>

              {form.sections.length === 0 ? (
                <div className="bg-gray-50 border-2 border-dashed rounded-lg p-8 text-center">
                  <p className="text-gray-500 mb-4">No sections yet</p>
                  <button
                    onClick={addSection}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create First Section
                  </button>
                </div>
              ) : (
                form.sections.map((section) => (
                  <div key={section.section_id} className="bg-white rounded-lg border overflow-hidden">
                    {/* Section Header */}
                    <button
                      onClick={() =>
                        setExpandedSectionId(
                          expandedSectionId === section.section_id ? null : section.section_id
                        )
                      }
                      className="w-full p-4 flex items-center justify-between hover:bg-gray-50 border-b"
                    >
                      <div className="text-left flex-1">
                        <input
                          type="text"
                          value={section.title}
                          onChange={(e) =>
                            updateSection(section.section_id, { title: e.target.value })
                          }
                          className="font-semibold text-gray-900 bg-transparent border-0 focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
                          onClick={(e) => e.stopPropagation()}
                        />
                        {section.description && (
                          <p className="text-xs text-gray-400 ml-2">{section.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {section.fields.length} field{section.fields.length !== 1 ? 's' : ''}
                          {section.content ? ' + legal text' : ''}
                        </span>
                        {expandedSectionId === section.section_id ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {/* Section Content */}
                    {expandedSectionId === section.section_id && (
                      <div className="p-4 space-y-4 bg-gray-50">
                        {section.content && (
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-600 block">
                              Document Content (Legal Text)
                            </label>
                            <textarea
                              value={section.content}
                              onChange={(e) =>
                                updateSection(section.section_id, { content: e.target.value })
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white font-mono leading-relaxed"
                              rows={Math.min(12, (section.content.match(/\n/g) || []).length + 3)}
                            />
                            <p className="text-xs text-gray-400">
                              This text is displayed to the applicant before the fields below.
                            </p>
                          </div>
                        )}

                        {!section.content && (
                          <button
                            onClick={() => updateSection(section.section_id, { content: '' })}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                          >
                            + Add document content to this section
                          </button>
                        )}

                        <div className="space-y-2">
                          {section.fields.map((field) => (
                            <div
                              key={field.field_id}
                              className="bg-white p-4 rounded-lg border space-y-3"
                            >
                              <div className="flex items-start gap-2">
                                <GripVertical className="w-4 h-4 text-gray-400 mt-1" />
                                <div className="flex-1">
                                  <input
                                    type="text"
                                    value={field.label}
                                    onChange={(e) =>
                                      updateField(section.section_id, field.field_id, {
                                        label: e.target.value,
                                      })
                                    }
                                    placeholder="Field label"
                                    className="w-full font-medium text-gray-900 bg-gray-50 border border-gray-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <button
                                  onClick={() => deleteField(section.section_id, field.field_id)}
                                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs font-medium text-gray-600 block mb-1">
                                    Field Type
                                  </label>
                                  <select
                                    value={field.type}
                                    onChange={(e) =>
                                      updateField(section.section_id, field.field_id, {
                                        type: e.target.value as any,
                                      })
                                    }
                                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                                  >
                                    {FIELD_TYPES.map((type) => (
                                      <option key={type.value} value={type.value}>
                                        {type.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-gray-600 block mb-1">
                                    Required
                                  </label>
                                  <input
                                    type="checkbox"
                                    checked={field.required}
                                    onChange={(e) =>
                                      updateField(section.section_id, field.field_id, {
                                        required: e.target.checked,
                                      })
                                    }
                                    className="w-4 h-4 border-gray-300 rounded"
                                  />
                                </div>
                              </div>

                              <input
                                type="text"
                                value={field.placeholder || ''}
                                onChange={(e) =>
                                  updateField(section.section_id, field.field_id, {
                                    placeholder: e.target.value,
                                  })
                                }
                                placeholder="Placeholder text"
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={() => addField(section.section_id)}
                          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-600 hover:text-blue-600 text-sm font-medium transition-colors"
                        >
                          <Plus className="w-4 h-4 inline mr-2" />
                          Add Field
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Panel - Preview & Layout Adjustment */}
          <div className="lg:col-span-1 sticky top-24 h-fit space-y-6">
            {/* Form Preview Card */}
            <div className="bg-white rounded-lg border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Form Preview</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-600">Sections:</span>
                  <p className="font-semibold text-gray-900">{form.sections.length}</p>
                </div>
                <div>
                  <span className="text-gray-600">Total Fields:</span>
                  <p className="font-semibold text-gray-900">
                    {form.sections.reduce((sum, s) => sum + s.fields.length, 0)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Content Sections:</span>
                  <p className="font-semibold text-gray-900">
                    {form.sections.filter((s) => s.content).length}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Status:</span>
                  <p className="font-semibold text-gray-900 capitalize">{form.status}</p>
                </div>
                <div className="pt-4 border-t space-y-2">
                  <Link
                    href={`/office/form-manager/${formId}/preview`}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center block font-medium transition-colors"
                  >
                    Full Preview
                  </Link>
                  <button
                    onClick={handleDownloadPdf}
                    disabled={generatingPdf}
                    className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-center block font-medium transition-colors mt-2 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {generatingPdf ? 'Generating...' : 'Download PDF'}
                  </button>
                </div>

                {/* Applicant Link */}
                <div className="pt-4 border-t space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    Applicant Link
                  </h3>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={typeof window !== 'undefined' ? `${window.location.origin}/apply/${formId}` : `/apply/${formId}`}
                      readOnly
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs bg-gray-50 text-gray-700"
                    />
                    <button
                      onClick={copyFormLink}
                      className={`px-2 py-1.5 border border-gray-300 rounded transition-colors ${
                        linkCopied
                          ? 'bg-green-100 border-green-300'
                          : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                      title="Copy link"
                    >
                      <Copy className={`w-3.5 h-3.5 ${linkCopied ? 'text-green-600' : 'text-gray-600'}`} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">
                    {linkCopied ? 'Copied!' : 'Share this link with applicants to fill out the form.'}
                  </p>
                  <Link
                    href={`/apply/${formId}`}
                    target="_blank"
                    className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-center block font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Applicant View
                  </Link>
                </div>
              </div>
            </div>

            {/* PDF Layout & Field Management Card */}
            {hasPacket && (
              <div className="bg-white rounded-lg border p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-600" />
                  <h2 className="text-lg font-semibold text-gray-900">PDF Layout & Fields</h2>
                </div>

                <p className="text-sm text-gray-600">
                  {packetFieldCount} positioned field{packetFieldCount !== 1 ? 's' : ''} on the PDF template.
                </p>

                {/* Step 1: Generate Test PDF */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Step 1: Generate Test PDF</p>
                  <p className="text-xs text-gray-500">
                    Downloads a PDF where each field shows its own label name.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleGenerateTestPdf}
                      disabled={generatingTestPdf}
                      className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                    >
                      {generatingTestPdf ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          Labeled Test PDF
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleGenerateGridPdf}
                      disabled={generatingGrid}
                      title="Download PDF with coordinate grid overlay"
                      className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                    >
                      {generatingGrid ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Grid3X3 className="w-4 h-4" />
                      )}
                      Grid PDF
                    </button>
                  </div>
                </div>

                {/* Step 2: AI-powered text instructions */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Step 2: Describe Changes (AI)</p>

                  <textarea
                    value={layoutInstructions}
                    onChange={(e) => setLayoutInstructions(e.target.value)}
                    placeholder={`Examples:\n- Move "Full Name" down slightly on page 1\n- Add a "Date of Birth" field below "Full Name"\n- Delete the duplicate "Phone" field in section 3`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 h-28 resize-none"
                  />

                  {/* Optional: Upload rendered PDF */}
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept=".pdf"
                      ref={pdfUploadRef}
                      onChange={(e) => setUploadedPdf(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    {uploadedPdf ? (
                      <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm">
                        <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        <span className="flex-1 text-indigo-800 truncate">{uploadedPdf.name}</span>
                        <button
                          onClick={() => { setUploadedPdf(null); if (pdfUploadRef.current) pdfUploadRef.current.value = ''; }}
                          className="p-1 text-indigo-400 hover:text-indigo-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => pdfUploadRef.current?.click()}
                        className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-400 hover:text-indigo-600 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Upload Test PDF for Visual Fix
                      </button>
                    )}
                  </div>

                  <button
                    onClick={handleAdjustPositions}
                    disabled={adjusting || !layoutInstructions.trim()}
                    className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  >
                    {adjusting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {uploadedPdf ? 'Analyzing PDF & Adjusting...' : 'Adjusting...'}
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Apply Changes (AI)
                      </>
                    )}
                  </button>

                  {adjustResult && (
                    <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
                      adjustResult.success
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                    }`}>
                      {adjustResult.success ? (
                        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      )}
                      <p className={adjustResult.success ? 'text-green-800' : 'text-red-800'}>
                        {adjustResult.message}
                      </p>
                    </div>
                  )}

                  {adjustResult?.success && (
                    <button
                      onClick={handleGenerateTestPdf}
                      disabled={generatingTestPdf}
                      className="w-full px-4 py-2 border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50 font-medium transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      {generatingTestPdf ? 'Generating...' : 'Re-generate Test PDF to Verify'}
                    </button>
                  )}
                </div>

                {/* Step 3: Direct Position Editing (Export/Import) */}
                <div className="border-t pt-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Step 3: Direct Editing (No AI)</p>
                  <p className="text-xs text-gray-500">
                    Export the position coordinates as JSON, edit them (or paste into a Claude chat for help), then import back.
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={handleExportPositions}
                      className="flex-1 px-3 py-2 border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 font-medium transition-colors text-sm flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Export JSON
                    </button>
                    <button
                      onClick={() => { setShowPositionEditor(!showPositionEditor); setImportResult(null); }}
                      className={`flex-1 px-3 py-2 border rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2 ${
                        showPositionEditor
                          ? 'border-orange-500 text-orange-800 bg-orange-50'
                          : 'border-orange-300 text-orange-700 hover:bg-orange-50'
                      }`}
                    >
                      <Code className="w-4 h-4" />
                      {showPositionEditor ? 'Hide Editor' : 'Import JSON'}
                    </button>
                  </div>

                  {showPositionEditor && (
                    <div className="space-y-2">
                      <textarea
                        value={positionJson}
                        onChange={(e) => setPositionJson(e.target.value)}
                        placeholder='Paste the edited position_map JSON here...'
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-orange-500 h-48 resize-y"
                        spellCheck={false}
                      />
                      <p className="text-xs text-gray-400">
                        Coordinates: origin at bottom-left. x: 0-612 (left to right), y: 0-792 (bottom to top). Pages are 0-indexed.
                      </p>
                      <button
                        onClick={handleImportPositions}
                        disabled={importingPositions || !positionJson.trim()}
                        className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                      >
                        {importingPositions ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            Save Imported Positions
                          </>
                        )}
                      </button>

                      {importResult && (
                        <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
                          importResult.success
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-red-50 border border-red-200'
                        }`}>
                          {importResult.success ? (
                            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                          )}
                          <p className={importResult.success ? 'text-green-800' : 'text-red-800'}>
                            {importResult.message}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-400">
                  Workflow: Generate test PDF + grid PDF → use grid to read coordinates → export JSON → edit coordinates → import → re-test.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
