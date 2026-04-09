'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Edit,
  Download,
  Archive,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Eye,
  Trash2,
} from 'lucide-react';

interface SubForm {
  id: string;
  name: string;
  page_range: string;
  field_count: number;
  is_reference_only: boolean;
  field_mappings?: Array<{
    canonical_label: string;
    original_label: string;
    field_type: string;
  }>;
}

interface Packet {
  id: string;
  name: string;
  description?: string;
  company: string;
  status: 'draft' | 'published' | 'archived';
  sub_forms: SubForm[];
  master_form_id?: string;
  created_at: string;
  updated_at: string;
}

export default function PacketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const packetId = params.id as string;

  const [packet, setPacket] = useState<Packet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSubForms, setExpandedSubForms] = useState<Set<string>>(new Set());
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [generatingPDFs, setGeneratingPDFs] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  useEffect(() => {
    // Session check
    const officeUser = localStorage.getItem('officeUser');
    if (!officeUser) {
      router.push('/office/login');
      return;
    }

    loadPacket();
  }, [packetId, router]);

  async function loadPacket() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/packets/${packetId}`);
      if (!response.ok) throw new Error('Failed to load packet');

      const data = await response.json();
      setPacket(data.packet);
      setEditName(data.packet.name);
      setEditDescription(data.packet.description || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load packet');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateMetadata() {
    if (!packet) return;

    try {
      const response = await fetch(`/api/packets/${packetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          description: editDescription,
        }),
      });

      if (!response.ok) throw new Error('Failed to update packet');

      setPacket({ ...packet, name: editName, description: editDescription });
      setShowEditModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update packet');
    }
  }

  async function handleStatusChange(newStatus: 'draft' | 'published' | 'archived') {
    if (!packet) return;

    try {
      const response = await fetch(`/api/packets/${packetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update status');

      setPacket({ ...packet, status: newStatus });
      setShowStatusMenu(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  }

  async function handleGenerateTestPDFs() {
    if (!packet) return;

    setGeneratingPDFs(true);
    try {
      const response = await fetch(`/api/packets/${packetId}/generate-pdfs`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to generate PDFs');

      // Trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${packet.name}-test-pdfs.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDFs');
    } finally {
      setGeneratingPDFs(false);
    }
  }

  async function handleDelete() {
    if (!packet) return;

    try {
      const response = await fetch(`/api/packets/${packetId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete packet');

      router.push('/office/packet-manager');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete packet');
      setShowDeleteConfirm(false);
    }
  }

  const toggleSubFormExpanded = (subFormId: string) => {
    const newExpanded = new Set(expandedSubForms);
    if (newExpanded.has(subFormId)) {
      newExpanded.delete(subFormId);
    } else {
      newExpanded.add(subFormId);
    }
    setExpandedSubForms(newExpanded);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    const colors = {
      draft: 'bg-yellow-100 text-yellow-800',
      published: 'bg-green-100 text-green-800',
      archived: 'bg-gray-100 text-gray-800',
    };
    return colors[status as keyof typeof colors] || colors.draft;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading packet details...</p>
        </div>
      </div>
    );
  }

  if (!packet) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Packet Not Found</h2>
          <Link
            href="/office/packet-manager"
            className="text-teal-600 hover:text-teal-700 font-medium"
          >
            Back to Packets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Link
              href="/office/packet-manager"
              className="flex items-center gap-2 text-teal-600 hover:text-teal-700 font-medium"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Packets
            </Link>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowEditModal(true)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Edit"
              >
                <Edit className="w-5 h-5" />
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowStatusMenu(!showStatusMenu)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${getStatusColor(packet.status)}`}
                >
                  {packet.status.charAt(0).toUpperCase() + packet.status.slice(1)}
                </button>
                {showStatusMenu && (
                  <div className="absolute right-0 mt-2 w-40 bg-white border rounded-lg shadow-lg z-10">
                    {(['draft', 'published', 'archived'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <h1 className="text-3xl font-bold text-gray-900">{packet.name}</h1>
            {packet.description && <p className="text-gray-600 mt-2">{packet.description}</p>}
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
              <span>{packet.company}</span>
              <span>Updated {formatDate(packet.updated_at)}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Statistics */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="text-sm text-gray-500 uppercase tracking-wide mb-2">Sub-forms</div>
            <div className="text-4xl font-bold text-gray-900">{packet.sub_forms.length}</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="text-sm text-gray-500 uppercase tracking-wide mb-2">Total Fields</div>
            <div className="text-4xl font-bold text-gray-900">
              {packet.sub_forms.reduce((sum, sf) => sum + sf.field_count, 0)}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="text-sm text-gray-500 uppercase tracking-wide mb-2">Status</div>
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(packet.status)}`}>
              {packet.status.charAt(0).toUpperCase() + packet.status.slice(1)}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-8">
          {packet.master_form_id && (
            <Link
              href={`/office/form-manager/${packet.master_form_id}`}
              className="bg-teal-50 text-teal-700 px-6 py-2.5 rounded-lg hover:bg-teal-100 font-medium transition-colors flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              View Master Form
            </Link>
          )}
          <button
            onClick={handleGenerateTestPDFs}
            disabled={generatingPDFs}
            className="bg-teal-50 text-teal-700 px-6 py-2.5 rounded-lg hover:bg-teal-100 font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {generatingPDFs ? 'Generating...' : 'Generate Test PDFs'}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="bg-red-50 text-red-700 px-6 py-2.5 rounded-lg hover:bg-red-100 font-medium transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>

        {/* Sub-forms List */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Sub-forms</h2>
          {packet.sub_forms.length === 0 ? (
            <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-8 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No sub-forms in this packet</p>
            </div>
          ) : (
            packet.sub_forms.map((subForm) => (
              <div key={subForm.id} className="bg-white rounded-xl shadow-sm border">
                <button
                  onClick={() => toggleSubFormExpanded(subForm.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900">{subForm.name}</h3>
                        {subForm.is_reference_only && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                            Reference Only
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Pages: {subForm.page_range}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">
                        <span className="font-semibold">{subForm.field_count}</span> fields
                      </div>
                    </div>
                  </div>
                  {expandedSubForms.has(subForm.id) ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {expandedSubForms.has(subForm.id) && subForm.field_mappings && (
                  <div className="border-t px-6 py-4 bg-gray-50">
                    <h4 className="font-semibold text-gray-900 mb-4">Field Mappings</h4>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {subForm.field_mappings.map((mapping, idx) => (
                        <div key={idx} className="bg-white p-3 rounded border">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-gray-900">{mapping.canonical_label}</p>
                              <p className="text-xs text-gray-500">Original: {mapping.original_label}</p>
                            </div>
                            <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded">
                              {mapping.field_type}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full mx-4 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Edit Packet</h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateMetadata}
                className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full mx-4 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Delete Packet?</h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete "{packet.name}"? This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
