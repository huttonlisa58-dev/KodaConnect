'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Copy } from 'lucide-react';
import { AlertCircle } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  category: string;
  body: string;
  variables: string[];
  created_at: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [companyId] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('company_id') || '';
    }
    return '';
  });

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    category: 'general',
    body: '',
  });

  const categories = [
    'general',
    'credential_expiry',
    'form_reminder',
    'onboarding',
    'emergency',
  ];

  const commonVariables = [
    { name: 'name', example: 'John' },
    { name: 'credential', example: 'Nursing License' },
    { name: 'date', example: '2024-12-31' },
    { name: 'form_name', example: 'Annual Review' },
    { name: 'company', example: 'KodaConnect' },
  ];

  useEffect(() => {
    loadTemplates();
  }, [companyId]);

  const loadTemplates = async () => {
    if (!companyId) {
      setError('Company not found');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/messages/templates?company_id=${companyId}`
      );

      if (!response.ok) throw new Error('Failed to load templates');

      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load templates';
      setError(errorMsg);
      console.error('Error loading templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (template?: Template) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        category: template.category,
        body: template.body,
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: '',
        category: 'general',
        body: '',
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTemplate(null);
    setFormData({
      name: '',
      category: 'general',
      body: '',
    });
  };

  const handleSaveTemplate = async () => {
    if (!formData.name.trim() || !formData.body.trim()) {
      setError('Name and message body are required');
      return;
    }

    if (formData.body.length > 1600) {
      setError('Message exceeds 1600 character limit');
      return;
    }

    try {
      const response = await fetch('/api/messages/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          ...formData,
          variables: extractVariables(formData.body),
        }),
      });

      if (!response.ok) throw new Error('Failed to save template');

      await loadTemplates();
      handleCloseModal();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save template';
      setError(errorMsg);
      console.error('Error saving template:', err);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const response = await fetch(`/api/messages/templates/${templateId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete template');

      await loadTemplates();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete template';
      setError(errorMsg);
      console.error('Error deleting template:', err);
    }
  };

  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.slice(2, -2)))];
  };

  const insertVariable = (variable: string) => {
    const newBody =
      formData.body + (formData.body.endsWith(' ') ? '' : ' ') + `{{${variable}}}`;
    setFormData(prev => ({ ...prev, body: newBody }));
  };

  const getVariablesInTemplate = () => {
    return extractVariables(formData.body);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Message Templates</h1>
            <p className="text-sm text-gray-500">Create and manage message templates</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-600 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {templates.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📝</span>
            </div>
            <p className="text-gray-600 font-medium text-lg mb-2">
              No templates yet
            </p>
            <p className="text-gray-500 mb-6">
              Create your first message template to save time sending messages
            </p>
            <button
              onClick={() => handleOpenModal()}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 inline-flex items-center gap-2 font-medium"
            >
              <Plus className="w-4 h-4" />
              Create Template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {templates.map(template => (
              <div
                key={template.id}
                className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {template.name}
                      </h3>
                      <span className="inline-block mt-2 px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700 font-medium">
                        {template.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenModal(template)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>

                  {/* Template body */}
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg mb-3 whitespace-pre-wrap line-clamp-3">
                    {template.body}
                  </p>

                  {/* Variables */}
                  {template.variables && template.variables.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {template.variables.map(variable => (
                        <span
                          key={variable}
                          className="inline-block px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 font-medium"
                        >
                          {variable}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    {new Date(template.created_at).toLocaleDateString()}
                  </p>
                  <button
                    className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingTemplate ? 'Edit Template' : 'Create Template'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Template Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g., Credential Expiry Alert"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, category: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Message body */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Message Body
                  </label>
                  <p className="text-xs text-gray-500">
                    {formData.body.length} / 1600
                  </p>
                </div>
                <textarea
                  value={formData.body}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, body: e.target.value }))
                  }
                  maxLength={1600}
                  rows={6}
                  placeholder="Compose your message. Use {{variable}} to insert variables."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Quick variables */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Quick Insert Variables
                </p>
                <div className="flex flex-wrap gap-2">
                  {commonVariables.map(variable => (
                    <button
                      key={variable.name}
                      onClick={() => insertVariable(variable.name)}
                      className="px-3 py-1 text-xs rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors font-medium"
                      title={`Example: ${variable.example}`}
                    >
                      {variable.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Preview
                </p>
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-300">
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {formData.body || 'Your message preview will appear here'}
                  </p>
                </div>
              </div>

              {/* Detected variables */}
              {getVariablesInTemplate().length > 0 && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs font-medium text-blue-700">
                    Detected Variables:
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {getVariablesInTemplate().map(variable => (
                      <span
                        key={variable}
                        className="inline-block px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 font-medium"
                      >
                        {variable}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t bg-gray-50 flex gap-2 justify-end sticky bottom-0">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!formData.name.trim() || !formData.body.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
