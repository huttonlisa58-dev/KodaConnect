'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { FormDefinition } from '@/lib/form-engine';
import { getOfficeUser } from '@/lib/auth';
import {
  Plus,
  Search,
  Edit,
  Eye,
  Archive,
  FileText,
  Upload,
  Trash2,
  ClipboardList,
} from 'lucide-react';
import CreateFormModal from '@/components/forms/CreateFormModal';

interface FormWithStats extends FormDefinition {
  submission_count?: number;
  company_name?: string;
}

export default function FormManagerPage() {
  const [forms, setForms] = useState<FormWithStats[]>([]);
  const [filteredForms, setFilteredForms] = useState<FormWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'archived'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCreateMethod, setSelectedCreateMethod] = useState<'upload' | 'blank' | null>(null);

  useEffect(() => {
    loadForms();
  }, []);

  useEffect(() => {
    filterForms();
  }, [forms, searchTerm, statusFilter]);

  async function loadForms() {
    setLoading(true);
    try {
      const user = getOfficeUser();
      const response = await fetch('/api/forms', {
        headers: {
          ...(user?.email ? { 'x-user-email': user.email } : {}),
          ...(user?.id ? { 'x-user-id': user.id } : {}),
        },
      });
      const data = await response.json();

      if (data.forms) {
        // Load company names for all unique company_ids
        const companyIds = [...new Set(data.forms.map((f: FormDefinition) => f.company_id).filter(Boolean))];
        const companyMap: Record<string, string> = {};
        if (companyIds.length > 0) {
          const { data: companies } = await getSupabase()
            .from('companies')
            .select('id, name')
            .in('id', companyIds as string[]);
          if (companies) {
            for (const c of companies) {
              companyMap[c.id] = c.name;
            }
          }
        }

        // Load submission counts for each form
        const formsWithStats = await Promise.all(
          data.forms.map(async (form: FormDefinition) => {
            const { count, error } = await getSupabase()
              .from('form_submissions')
              .select('*', { count: 'exact', head: true })
              .eq('form_id', form.form_id);

            return {
              ...form,
              submission_count: error ? 0 : count || 0,
              company_name: companyMap[form.company_id] || undefined,
            };
          })
        );

        setForms(formsWithStats);
      }
    } catch (error) {
      console.error('Failed to load forms:', error);
    } finally {
      setLoading(false);
    }
  }

  function filterForms() {
    let filtered = [...forms];

    if (searchTerm) {
      filtered = filtered.filter(
        (form) =>
          form.form_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          form.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          form.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((form) => form.status === statusFilter);
    }

    setFilteredForms(filtered);
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-yellow-100 text-yellow-800',
      published: 'bg-green-100 text-green-800',
      archived: 'bg-gray-100 text-gray-800',
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      draft: 'Draft',
      published: 'Published',
      archived: 'Archived',
    };
    return labels[status as keyof typeof labels] || status;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Form Manager</h1>
            <p className="text-sm text-gray-500">Create and manage dynamic forms</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/office/packet-manager/import"
              className="bg-teal-600 text-white px-6 py-2.5 rounded-lg hover:bg-teal-700 flex items-center gap-2 font-medium transition-colors"
            >
              <Upload className="w-5 h-5" />
              Import from PDF
            </Link>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              Create New Form
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search forms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="text-right text-sm text-gray-500 py-2.5">
            {filteredForms.length} form{filteredForms.length !== 1 ? 's' : ''} found
          </div>
        </div>

        {/* Forms Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading forms...</p>
          </div>
        ) : filteredForms.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 py-12 text-center">
            <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No forms found</h3>
            <p className="text-gray-600 mb-6">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first form to get started'}
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 inline-flex items-center gap-2 font-medium"
              >
                <Plus className="w-5 h-5" />
                Create Form
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div>
              <table className="w-full table-fixed">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="w-[40%] px-4 py-3 text-left text-sm font-semibold text-gray-700">Form Name</th>
                    <th className="w-[20%] px-4 py-3 text-left text-sm font-semibold text-gray-700">Company</th>
                    <th className="w-[8%] px-4 py-3 text-left text-sm font-semibold text-gray-700">Version</th>
                    <th className="w-[10%] px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="w-[10%] px-4 py-3 text-center text-sm font-semibold text-gray-700">Submissions</th>
                    <th className="w-[12%] px-4 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredForms.map((form, index) => (
                    <tr key={form.form_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3">
                        <Link href={`/office/form-manager/${form.form_id}`} className="block hover:text-teal-600 transition-colors">
                          <p className="font-medium text-gray-900 hover:text-teal-600 break-words">{form.form_name}</p>
                          {form.description && (
                            <p className="text-sm text-gray-500 break-words line-clamp-1">{form.description}</p>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 break-words">
                        {form.company_name || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{form.version}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusBadge(form.status)}`}>
                          {getStatusLabel(form.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        <Link
                          href={`/office/form-manager/${form.form_id}/submissions`}
                          className="text-teal-600 hover:text-teal-800 font-medium hover:underline"
                        >
                          {form.submission_count || 0}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/office/form-manager/${form.form_id}/submissions`}
                            className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            title="Submissions"
                          >
                            <ClipboardList className="w-4 h-4" />
                          </Link>
                          <Link
                            href={`/office/form-manager/${form.form_id}/preview`}
                            className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <Link
                            href={`/office/form-manager/${form.form_id}`}
                            className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          {form.status !== 'archived' && (
                            <button
                              onClick={async () => {
                                if (confirm('Archive this form?')) {
                                  await fetch(`/api/forms/${form.form_id}`, { method: 'DELETE' });
                                  loadForms();
                                }
                              }}
                              className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                              title="Archive"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          )}
                          {(form.submission_count || 0) === 0 && (
                            <button
                              onClick={async () => {
                                if (confirm(`Permanently delete "${form.form_name}"? This form has no submissions and will be removed from the list.`)) {
                                  const res = await fetch(`/api/forms/${form.form_id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'delete' }),
                                  });
                                  if (res.ok) {
                                    loadForms();
                                  } else {
                                    const err = await res.json();
                                    alert(err.error || 'Failed to delete form');
                                  }
                                }
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Form Modal */}
      <CreateFormModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setSelectedCreateMethod(null);
        }}
        onFormCreated={() => {
          setShowCreateModal(false);
          setSelectedCreateMethod(null);
          loadForms();
        }}
      />
    </div>
  );
}
