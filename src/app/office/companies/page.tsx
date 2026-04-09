'use client';

/**
 * Company Management Page — Super Admin Only
 * CRUD operations: create, edit, deactivate/activate, merge companies
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/SessionProvider';
import { BrandedHeader } from '@/components/BrandedHeader';
import { getCompanyInitials, getLogoUrl, getInitialsColor } from '@/lib/logo-utils';
import {
  Plus,
  Pencil,
  Power,
  Merge,
  X,
  AlertTriangle,
  Building2,
  Users,
  FileText,
  MessageSquare,
  Loader2,
  Check,
} from 'lucide-react';

/* ─── Types ─── */

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  active: boolean;
  created_at: string;
  user_count: number;
  form_count: number;
  submission_count: number;
  primary_color: string | null;
  brand_logo_url: string | null;
}

/* ─── Helper: API calls with auth headers ─── */

function authHeaders(user: any): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-office-user-id': user?.id || '',
    'x-user-id': user?.id || '',
    'x-user-email': user?.email || '',
  };
}

/* ─── Main Page ─── */

export default function CompaniesPage() {
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [mergingCompany, setMergingCompany] = useState<Company | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Company | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Support both auth schemas: office_users has role, staff has is_super_admin
  const isSuperAdmin = user?.is_super_admin || user?.role === 'super_admin';

  // Redirect non-super-admins
  useEffect(() => {
    if (!sessionLoading && user && !isSuperAdmin) {
      router.push('/office');
    }
  }, [user, sessionLoading, router, isSuperAdmin]);

  const fetchCompanies = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = showInactive ? '?include_inactive=true' : '';
      const res = await fetch(`/api/companies/manage${params}`, {
        headers: authHeaders(user),
      });
      const data = await res.json();
      if (data.companies) {
        setCompanies(data.companies);
      } else {
        setError(data.error || 'Failed to load companies');
      }
    } catch {
      setError('Failed to load companies');
    } finally {
      setLoading(false);
    }
  }, [user, showInactive]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchCompanies();
    }
  }, [isSuperAdmin, fetchCompanies]);

  // Auto-clear success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  /* ─── Actions ─── */

  const handleCreate = async (name: string, primaryColor: string) => {
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch('/api/companies/manage', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ name, primary_color: primaryColor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCreateDialogOpen(false);
      setSuccessMessage(`"${name}" created successfully`);
      fetchCompanies();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async (id: string, updates: Record<string, any>) => {
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: 'PUT',
        headers: authHeaders(user),
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditingCompany(null);
      setSuccessMessage('Company updated');
      fetchCompanies();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (company: Company) => {
    if (company.active) {
      // If deactivating, show confirm first
      setConfirmDeactivate(company);
      return;
    }
    // Reactivating
    setActionLoading(true);
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PUT',
        headers: authHeaders(user),
        body: JSON.stringify({ active: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccessMessage(`"${company.name}" reactivated`);
      fetchCompanies();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!confirmDeactivate) return;
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch(`/api/companies/${confirmDeactivate.id}`, {
        method: 'DELETE',
        headers: authHeaders(user),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfirmDeactivate(null);
      setSuccessMessage(`"${confirmDeactivate.name}" deactivated`);
      fetchCompanies();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMerge = async (sourceId: string, targetId: string) => {
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch(`/api/companies/${sourceId}/merge`, {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ target_company_id: targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMergingCompany(null);
      setSuccessMessage(data.message || 'Companies merged successfully');
      fetchCompanies();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (sessionLoading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <BrandedHeader title="Company Management" />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Success banner */}
        {successMessage && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <Check className="w-5 h-5" />
            {successMessage}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Companies</h2>
            <p className="text-sm text-gray-500 mt-1">
              {companies.length} compan{companies.length === 1 ? 'y' : 'ies'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              Show inactive
            </label>
            <button
              onClick={() => {
                setActionError('');
                setCreateDialogOpen(true);
              }}
              className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Create Company
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          </div>
        ) : companies.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No companies found</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Company</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Slug</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">
                    <Users className="w-4 h-4 inline" />
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">
                    <FileText className="w-4 h-4 inline" />
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">
                    <MessageSquare className="w-4 h-4 inline" />
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {companies.map((company) => (
                  <CompanyRow
                    key={company.id}
                    company={company}
                    onEdit={() => {
                      setActionError('');
                      setEditingCompany(company);
                    }}
                    onToggleActive={() => handleToggleActive(company)}
                    onMerge={() => {
                      setActionError('');
                      setMergingCompany(company);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Create Dialog */}
      {createDialogOpen && (
        <CreateCompanyDialog
          onClose={() => setCreateDialogOpen(false)}
          onCreate={handleCreate}
          loading={actionLoading}
          error={actionError}
        />
      )}

      {/* Edit Dialog */}
      {editingCompany && (
        <EditCompanyDialog
          company={editingCompany}
          onClose={() => setEditingCompany(null)}
          onSave={handleEdit}
          loading={actionLoading}
          error={actionError}
        />
      )}

      {/* Merge Dialog */}
      {mergingCompany && (
        <MergeCompanyDialog
          source={mergingCompany}
          companies={companies.filter((c) => c.id !== mergingCompany.id && c.active)}
          onClose={() => setMergingCompany(null)}
          onMerge={handleMerge}
          loading={actionLoading}
          error={actionError}
        />
      )}

      {/* Deactivate Confirm */}
      {confirmDeactivate && (
        <ConfirmDialog
          title="Deactivate Company"
          message={`Are you sure you want to deactivate "${confirmDeactivate.name}"? It will be hidden from non-admin views.`}
          confirmLabel="Deactivate"
          onConfirm={handleConfirmDeactivate}
          onCancel={() => setConfirmDeactivate(null)}
          loading={actionLoading}
          error={actionError}
          destructive
        />
      )}
    </div>
  );
}

/* ─── Company Row ─── */

function CompanyRow({
  company,
  onEdit,
  onToggleActive,
  onMerge,
}: {
  company: Company;
  onEdit: () => void;
  onToggleActive: () => void;
  onMerge: () => void;
}) {
  const logoUrl = getLogoUrl(company.brand_logo_url || company.logo_url);
  const initials = getCompanyInitials(company.name);
  const colors = getInitialsColor(company.name);
  const [imgError, setImgError] = useState(false);

  return (
    <tr className={`hover:bg-gray-50 transition-colors ${!company.active ? 'opacity-60' : ''}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {logoUrl && !imgError ? (
            <img
              src={logoUrl}
              alt={company.name}
              className="w-8 h-8 rounded object-contain flex-shrink-0"
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className="w-8 h-8 rounded flex items-center justify-center font-bold text-xs flex-shrink-0"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              {initials}
            </div>
          )}
          <span className="font-medium text-gray-900">{company.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{company.slug}</td>
      <td className="px-4 py-3 text-center">
        {company.active ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Inactive
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-center text-gray-600">{company.user_count}</td>
      <td className="px-4 py-3 text-center text-gray-600">{company.form_count}</td>
      <td className="px-4 py-3 text-center text-gray-600">{company.submission_count}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleActive}
            className={`p-1.5 rounded-lg transition-colors ${
              company.active
                ? 'hover:bg-red-50 text-gray-500 hover:text-red-600'
                : 'hover:bg-green-50 text-gray-500 hover:text-green-600'
            }`}
            title={company.active ? 'Deactivate' : 'Reactivate'}
          >
            <Power className="w-4 h-4" />
          </button>
          {company.active && (
            <button
              onClick={onMerge}
              className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-500 hover:text-blue-600 transition-colors"
              title="Merge into another company"
            >
              <Merge className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ─── Create Company Dialog ─── */

function CreateCompanyDialog({
  onClose,
  onCreate,
  loading,
  error,
}: {
  onClose: () => void;
  onCreate: (name: string, primaryColor: string) => void;
  loading: boolean;
  error: string;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#0F766E');

  return (
    <DialogShell title="Create Company" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Xtreme Care LLC"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Brand Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
            />
            <span className="text-sm text-gray-500 font-mono">{color}</span>
          </div>
        </div>
        {error && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(name, color)}
            disabled={loading || !name.trim()}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

/* ─── Edit Company Dialog ─── */

function EditCompanyDialog({
  company,
  onClose,
  onSave,
  loading,
  error,
}: {
  company: Company;
  onClose: () => void;
  onSave: (id: string, updates: Record<string, any>) => void;
  loading: boolean;
  error: string;
}) {
  const [name, setName] = useState(company.name);
  const [color, setColor] = useState(company.primary_color || '#0F766E');

  return (
    <DialogShell title="Edit Company" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Brand Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
            />
            <span className="text-sm text-gray-500 font-mono">{color}</span>
          </div>
        </div>
        {error && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(company.id, { name, primary_color: color })}
            disabled={loading || !name.trim()}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

/* ─── Merge Company Dialog ─── */

function MergeCompanyDialog({
  source,
  companies,
  onClose,
  onMerge,
  loading,
  error,
}: {
  source: Company;
  companies: Company[];
  onClose: () => void;
  onMerge: (sourceId: string, targetId: string) => void;
  loading: boolean;
  error: string;
}) {
  const [targetId, setTargetId] = useState('');

  return (
    <DialogShell title="Merge Company" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
          <p className="font-medium">This will merge all data from &quot;{source.name}&quot; into the target company:</p>
          <ul className="mt-1 list-disc list-inside text-xs space-y-0.5">
            <li>Users, forms, submissions, caregivers, and conversations will be moved</li>
            <li>&quot;{source.name}&quot; will be deactivated after the merge</li>
            <li>This action cannot be easily undone</li>
          </ul>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Merge into:</label>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="">Select target company...</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.user_count} users, {c.form_count} forms)
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onMerge(source.id, targetId)}
            disabled={loading || !targetId}
            className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Merge Companies
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

/* ─── Confirm Dialog ─── */

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
  error,
  destructive,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  error: string;
  destructive?: boolean;
}) {
  return (
    <DialogShell title={title} onClose={onCancel}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{message}</p>
        {error && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2 ${
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

/* ─── Dialog Shell ─── */

function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
