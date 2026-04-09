'use client';

import React, { useState, useEffect } from 'react';
import {
  Template,
  TemplatePacket,
  Company,
  CreateTemplatePayload,
  OnboardingRole,
} from './types';

// Loading spinner
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center">
      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
    </div>
  );
}

// Modal component
function Modal({
  isOpen,
  title,
  onClose,
  children,
}: {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// Render mode badge
function RenderModeBadge({ mode }: { mode: 'generated' | 'replica' }) {
  const config = {
    generated: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Generated' },
    replica: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Replica' },
  };

  const c = config[mode];
  return (
    <span className={`px-2 py-1 rounded text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// Packet picker component for create/edit template
function PacketPicker({
  availablePackets,
  selectedPackets,
  onUpdate,
}: {
  availablePackets: any[];
  selectedPackets: TemplatePacket[];
  onUpdate: (packets: TemplatePacket[]) => void;
}) {
  const handleTogglePacket = (packetId: string) => {
    const isSelected = selectedPackets.some((p) => p.form_packet_id === packetId);

    if (isSelected) {
      onUpdate(
        selectedPackets.filter((p) => p.form_packet_id !== packetId)
      );
    } else {
      const packet = availablePackets.find((p) => p.id === packetId);
      if (packet) {
        const newPacket: TemplatePacket = {
          id: `temp-${Date.now()}`,
          form_packet_id: packetId,
          packet_name: packet.name,
          render_mode: packet.render_mode,
          assigned_to_role: 'applicant',
          sort_order: selectedPackets.length,
          is_required: false,
        };
        onUpdate([...selectedPackets, newPacket]);
      }
    }
  };

  const handleRemoveSelected = (index: number) => {
    const newPackets = selectedPackets.filter((_, i) => i !== index);
    newPackets.forEach((p, i) => (p.sort_order = i));
    onUpdate(newPackets);
  };

  const handleUpdateRole = (
    packetId: string,
    role: OnboardingRole
  ) => {
    onUpdate(
      selectedPackets.map((p) =>
        p.form_packet_id === packetId ? { ...p, assigned_to_role: role } : p
      )
    );
  };

  const handleToggleRequired = (packetId: string) => {
    onUpdate(
      selectedPackets.map((p) =>
        p.form_packet_id === packetId
          ? { ...p, is_required: !p.is_required }
          : p
      )
    );
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newPackets = [...selectedPackets];
    [newPackets[index], newPackets[index - 1]] = [
      newPackets[index - 1],
      newPackets[index],
    ];
    // Update sort orders
    newPackets.forEach((p, i) => (p.sort_order = i));
    onUpdate(newPackets);
  };

  const handleMoveDown = (index: number) => {
    if (index === selectedPackets.length - 1) return;
    const newPackets = [...selectedPackets];
    [newPackets[index], newPackets[index + 1]] = [
      newPackets[index + 1],
      newPackets[index],
    ];
    // Update sort orders
    newPackets.forEach((p, i) => (p.sort_order = i));
    onUpdate(newPackets);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Available Packets
        </h3>
        <div className="space-y-2 mb-6">
          {availablePackets.map((packet) => {
            const isSelected = selectedPackets.some(
              (p) => p.form_packet_id === packet.id
            );
            return (
              <label
                key={packet.id}
                className="flex items-center p-3 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleTogglePacket(packet.id)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <div className="ml-3 flex-1">
                  <p className="font-medium text-gray-900">{packet.name}</p>
                  <RenderModeBadge mode={packet.render_mode} />
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {selectedPackets.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Selected Packets ({selectedPackets.length})
          </h3>
          <div className="space-y-3 border-t pt-4">
            {selectedPackets.map((packet, index) => (
              <div
                key={packet.id}
                className="flex items-start justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">
                      {packet.packet_name}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRemoveSelected(index)}
                      className="text-red-400 hover:text-red-600 text-sm font-bold"
                      title="Remove packet"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <RenderModeBadge mode={packet.render_mode} />
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-end">
                  <select
                    value={packet.assigned_to_role}
                    onChange={(e) =>
                      handleUpdateRole(
                        packet.form_packet_id,
                        e.target.value as OnboardingRole
                      )
                    }
                    className="text-xs px-2 py-1 border border-gray-300 rounded"
                  >
                    <option value="applicant">Applicant</option>
                    <option value="rn_evaluator">RN Evaluator</option>
                    <option value="hr_admin">HR Admin</option>
                  </select>

                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={packet.is_required}
                      onChange={() =>
                        handleToggleRequired(packet.form_packet_id)
                      }
                      className="w-3 h-3 text-blue-600 rounded"
                    />
                    Required
                  </label>

                  <div className="flex gap-1">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="px-2 py-1 text-xs text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === selectedPackets.length - 1}
                      className="px-2 py-1 text-xs text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * TemplateManager Component
 * Allows admins to create and manage onboarding templates
 * Displays templates grouped by company with options to edit and deactivate
 */
export default function TemplateManager() {
  // State management
  const [templates, setTemplates] = useState<Template[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allPackets, setAllPackets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // Form state
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateState, setTemplateState] = useState('NY');
  const [templateDescription, setTemplateDescription] = useState('');
  const [selectedPackets, setSelectedPackets] = useState<TemplatePacket[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Get auth headers from localStorage session (same pattern as other office pages)
  function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    try {
      const stored = localStorage.getItem('office_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.id) {
          headers['x-user-id'] = parsed.id;
          headers['x-office-user-id'] = parsed.id; // Some routes check this variant
        }
        if (parsed.email) headers['x-user-email'] = parsed.email;
        if (parsed.role) headers['x-user-role'] = parsed.role;
      }
    } catch {
      // ignore parse errors
    }
    return headers;
  }

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const authHeaders = getAuthHeaders();

        const [templatesRes, companiesRes, packetsRes] = await Promise.all([
          fetch('/api/onboarding/templates', { headers: authHeaders }),
          fetch('/api/companies/list', { headers: authHeaders }),
          fetch('/api/form-packets', { headers: authHeaders }),
        ]);

        if (!templatesRes.ok || !companiesRes.ok || !packetsRes.ok) {
          const failedEndpoints = [];
          if (!templatesRes.ok) failedEndpoints.push(`templates(${templatesRes.status})`);
          if (!companiesRes.ok) failedEndpoints.push(`companies(${companiesRes.status})`);
          if (!packetsRes.ok) failedEndpoints.push(`packets(${packetsRes.status})`);
          throw new Error(`Failed to fetch: ${failedEndpoints.join(', ')}`);
        }

        const templatesData = await templatesRes.json();
        const companiesData = await companiesRes.json();
        const packetsData = await packetsRes.json();

        setTemplates(Array.isArray(templatesData) ? templatesData : templatesData.templates || []);
        const companiesList = Array.isArray(companiesData) ? companiesData : companiesData.companies || [];
        setCompanies(companiesList);
        setAllPackets(Array.isArray(packetsData) ? packetsData : []);

        // Pre-select first company
        if (companiesList.length > 0) {
          setSelectedCompanyId(companiesList[0].id);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load required data'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Open modal for creating new template
  const handleOpenCreateModal = () => {
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateState('NY');
    setTemplateDescription('');
    setSelectedPackets([]);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open modal for editing template
  // Reconcile stale packet UUIDs: when packets are re-imported, their UUID changes
  // but the template still references the old UUID. Match by packet_name to update.
  const handleOpenEditModal = (template: Template) => {
    setEditingTemplate(template);
    setSelectedCompanyId(template.company_id);
    setTemplateName(template.name);
    setTemplateState(template.state);
    setTemplateDescription(template.description || '');

    // Reconcile selected packet UUIDs with current available packets
    const reconciledPackets = (template.packets || []).map((tp) => {
      // Check if this packet's form_packet_id still exists in available packets
      const directMatch = allPackets.find((ap) => ap.id === tp.form_packet_id);
      if (directMatch) {
        // UUID still valid — update name in case it changed
        return { ...tp, packet_name: directMatch.name, render_mode: directMatch.render_mode };
      }
      // UUID is stale — try to find by packet_name
      const nameMatch = allPackets.find(
        (ap) => ap.name.toLowerCase() === tp.packet_name.toLowerCase()
      );
      if (nameMatch) {
        return { ...tp, form_packet_id: nameMatch.id, packet_name: nameMatch.name, render_mode: nameMatch.render_mode };
      }
      // No match found — keep as-is (user can remove via ×)
      return tp;
    });

    setSelectedPackets(reconciledPackets);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Close modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateState('NY');
    setTemplateDescription('');
    setSelectedPackets([]);
    setFormError(null);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedCompanyId || !templateName.trim() || selectedPackets.length === 0) {
      setFormError('Please fill in all required fields and select at least one packet');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: CreateTemplatePayload = {
        company_id: selectedCompanyId,
        name: templateName.trim(),
        state: templateState,
        description: templateDescription.trim() || undefined,
        packets: selectedPackets.map((p) => ({
          form_packet_id: p.form_packet_id,
          assigned_to_role: p.assigned_to_role,
          is_required: p.is_required,
          sort_order: p.sort_order,
        })),
      };

      const url = editingTemplate
        ? `/api/onboarding/templates/${editingTemplate.id}`
        : '/api/onboarding/templates';

      const method = editingTemplate ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const details = errorData.details ? ` (${errorData.details})` : '';
        throw new Error(
          (errorData.error || errorData.message || 'Failed to save template') + details
        );
      }

      // Refresh templates list
      const templatesRes = await fetch('/api/onboarding/templates', { headers: getAuthHeaders() });
      const templatesData = await templatesRes.json();
      setTemplates(Array.isArray(templatesData) ? templatesData : templatesData.templates || []);

      handleCloseModal();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'An error occurred while saving the template'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle template deactivation
  const handleDeactivate = async (templateId: string) => {
    if (!confirm('Are you sure you want to deactivate this template?')) return;

    try {
      const response = await fetch(
        `/api/onboarding/templates/${templateId}/deactivate`,
        { method: 'POST', headers: getAuthHeaders() }
      );

      if (!response.ok) throw new Error('Failed to deactivate template');

      // Refresh templates list
      const templatesRes = await fetch('/api/onboarding/templates', { headers: getAuthHeaders() });
      const templatesData = await templatesRes.json();
      setTemplates(Array.isArray(templatesData) ? templatesData : templatesData.templates || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to deactivate template'
      );
    }
  };

  // Group templates by company
  const groupedTemplates = companies.map((company) => ({
    company,
    templates: templates.filter((t) => t.company_id === company.id),
  }));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Template Manager
              </h1>
              <p className="text-gray-600 mt-2">
                Create and manage onboarding templates
              </p>
            </div>
            <button
              onClick={handleOpenCreateModal}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              + Create Template
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {/* Templates grouped by company */}
        {groupedTemplates.map(({ company, templates: companyTemplates }) => (
          <div key={company.id} className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {company.name}
            </h2>

            {companyTemplates.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <p className="text-gray-600">No templates yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {companyTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {template.name}
                      </h3>
                      <div className="flex gap-3 mt-2">
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {template.state}
                        </span>
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {template.packet_count} packets
                        </span>
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded ${
                            template.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {template.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenEditModal(template)}
                        className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        Edit
                      </button>
                      {template.is_active && (
                        <button
                          onClick={() => handleDeactivate(template.id)}
                          className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create/Edit Template Modal */}
      <Modal
        isOpen={isModalOpen}
        title={editingTemplate ? 'Edit Template' : 'Create Template'}
        onClose={handleCloseModal}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Form error */}
          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{formError}</p>
            </div>
          )}

          {/* Company selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              disabled={!!editingTemplate}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="">Select a company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Template name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g., Standard RN Onboarding"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* State selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              State <span className="text-red-500">*</span>
            </label>
            <select
              value={templateState}
              onChange={(e) => setTemplateState(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="NY">New York</option>
              <option value="PA">Pennsylvania</option>
              <option value="NJ">New Jersey</option>
              <option value="CT">Connecticut</option>
              <option value="MA">Massachusetts</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="Describe what this template is for..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Packet picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-4">
              Packets <span className="text-red-500">*</span>
            </label>
            <PacketPicker
              availablePackets={allPackets}
              selectedPackets={selectedPackets}
              onUpdate={setSelectedPackets}
            />
          </div>

          {/* Form buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner />
                  Saving...
                </>
              ) : (
                'Save Template'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
