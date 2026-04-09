'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { getOfficeUser, canManageUsers, canAccessCompany, canCreateUserWithRole, getRoleLabel, getRoleColor, type OfficeUser } from '@/lib/auth';
import Link from 'next/link';
import {
  ArrowLeft,
  Users,
  Plus,
  Edit3,
  Trash2,
  Shield,
  Building2,
  Loader2,
  Check,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface Form {
  id: string;
  name: string;
  company_id: string;
}

export default function UserManagementPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<OfficeUser | null>(null);
  const [users, setUsers] = useState<OfficeUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [availableForms, setAvailableForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<OfficeUser | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    role: 'staff' as 'staff' | 'rn' | 'admin' | 'super_admin',
    company_id: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [assignedCompanies, setAssignedCompanies] = useState<string[]>([]);
  const [assignedForms, setAssignedForms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // Map of userId -> company names for display in the table
  const [userCompanyMap, setUserCompanyMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const user = getOfficeUser();
    setCurrentUser(user);

    if (!user || !canManageUsers(user)) {
      router.push('/office');
      return;
    }

    loadDataForUser(user);
  }, []);

  async function loadDataForUser(user: OfficeUser) {
    setLoading(true);

    // Load all users
    const { data: usersData } = await getSupabase()
      .from('office_users')
      .select('*')
      .order('name');

    // Load companies (filtered by user's access)
    const { data: companiesData } = await getSupabase()
      .from('companies')
      .select('id, name, slug')
      .eq('active', true)
      .order('name');

    // Filter companies to only those the current user can access
    const accessibleCompanies = companiesData
      ? companiesData.filter((c: Company) => canAccessCompany(user, c.id))
      : [];
    setCompanies(accessibleCompanies);

    // Load all company assignments in one query
    const { data: allAssignments } = await getSupabase()
      .from('user_company_assignments')
      .select('user_id, company_id');

    // Build userId → [companyId] map for filtering
    const userCompanyIdMap: Record<string, string[]> = {};
    const companyMap: Record<string, string[]> = {};

    if (allAssignments && companiesData) {
      for (const assignment of allAssignments) {
        // Track company IDs per user (for filtering)
        if (!userCompanyIdMap[assignment.user_id]) {
          userCompanyIdMap[assignment.user_id] = [];
        }
        userCompanyIdMap[assignment.user_id].push(assignment.company_id);

        // Track company names per user (for display)
        const companyName = companiesData.find((c: Company) => c.id === assignment.company_id)?.name;
        if (companyName) {
          if (!companyMap[assignment.user_id]) {
            companyMap[assignment.user_id] = [];
          }
          companyMap[assignment.user_id].push(companyName);
        }
      }
    }
    setUserCompanyMap(companyMap);

    // Filter users based on current user's role
    if (usersData) {
      if (user.role === 'super_admin') {
        // Super admins see all users
        setUsers(usersData as OfficeUser[]);
      } else {
        // Admins: hide super_admins, only show users in overlapping companies
        const myCompanyIds = user.assigned_companies || [];
        const filtered = usersData.filter((u: OfficeUser) => {
          // Never show super_admin users to non-super_admins
          if (u.role === 'super_admin') return false;
          // Always show yourself
          if (u.id === user.id) return true;
          // Check if user shares any company with current user
          const theirCompanyIds = userCompanyIdMap[u.id] || [];
          return theirCompanyIds.some((cid: string) => myCompanyIds.includes(cid));
        });
        setUsers(filtered as OfficeUser[]);
      }
    }

    setLoading(false);
  }

  // Keep backward-compatible loadData that uses currentUser state
  async function loadData() {
    if (currentUser) loadDataForUser(currentUser);
  }

  async function fetchUserAssignments(userId: string) {
    try {
      // Fetch company assignments directly from table
      const { data: companyAssignments } = await getSupabase()
        .from('user_company_assignments')
        .select('company_id')
        .eq('user_id', userId);

      if (companyAssignments) {
        const companyIds = companyAssignments.map((a) => a.company_id);
        setAssignedCompanies(companyIds);
        // Also load forms for these companies
        fetchFormsForCompanies(companyIds);
      }

      // Fetch form assignments directly from table
      const { data: formAssignments } = await getSupabase()
        .from('user_form_assignments')
        .select('form_id')
        .eq('user_id', userId);

      if (formAssignments) {
        const formIds = formAssignments.map((a) => a.form_id);
        setAssignedForms(formIds);
      }
    } catch (error) {
      console.error('Error fetching assignments:', error);
    }
  }

  async function fetchFormsForCompanies(companyIds: string[]) {
    if (companyIds.length === 0) {
      setAvailableForms([]);
      return;
    }

    try {
      const { data: formsData } = await getSupabase()
        .from('form_definitions')
        .select('form_id, form_name, company_id')
        .in('company_id', companyIds)
        .eq('status', 'published')
        .order('form_name');

      if (formsData) setAvailableForms(formsData.map(f => ({ id: f.form_id, name: f.form_name, company_id: f.company_id })));
    } catch (error) {
      console.error('Error fetching forms:', error);
    }
  }

  function openAddModal() {
    setEditingUser(null);
    setFormData({
      email: '',
      name: '',
      password: '',
      role: 'staff',
      company_id: '',
    });
    setShowPassword(false);
    setAssignedCompanies([]);
    setAssignedForms([]);
    setAvailableForms([]);
    setShowModal(true);
  }

  async function openEditModal(user: OfficeUser) {
    setEditingUser(user);
    setFormData({
      email: user.email,
      name: user.name,
      password: '',
      role: user.role,
      company_id: user.company_id || '',
    });
    setShowPassword(false);
    setAssignedCompanies([]);
    setAssignedForms([]);
    setAvailableForms([]);

    setShowModal(true);

    // Fetch current assignments
    await fetchUserAssignments(user.id);
  }

  async function handleSave() {
    if (!formData.email.trim() || !formData.name.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    // Require password only for new users
    if (!editingUser && !formData.password.trim()) {
      alert('Please set a temporary password for the new user');
      return;
    }

    if (!editingUser && formData.password.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    setSaving(true);

    try {
      let userId = editingUser?.id;

      if (editingUser) {
        // Update existing user (no password change here — that's in Settings)
        const userData = {
          email: formData.email.toLowerCase(),
          name: formData.name,
          role: formData.role,
          company_id: assignedCompanies.length > 0 ? assignedCompanies[0] : null,
          active: true,
        };

        const { error } = await getSupabase()
          .from('office_users')
          .update(userData)
          .eq('id', editingUser.id);

        if (error) throw error;
      } else {
        // Create new user via API (creates auth user + office_users record)
        const response = await fetch('/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': currentUser?.id || '',
            'x-user-email': currentUser?.email || '',
          },
          body: JSON.stringify({
            email: formData.email.toLowerCase(),
            name: formData.name,
            password: formData.password,
            role: formData.role,
            company_id: assignedCompanies.length > 0 ? assignedCompanies[0] : null,
            caller_user_id: currentUser?.id || '',
            caller_user_email: currentUser?.email || '',
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create user');
        }

        userId = result.id;
      }

      // Save company assignments for admin and staff users
      if (userId && (formData.role === 'admin' || formData.role === 'rn' || formData.role === 'staff')) {
        const assignCompanyRes = await fetch(`/api/users/${userId}/assign-companies`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': currentUser?.id || '',
            'x-user-email': currentUser?.email || '',
          },
          body: JSON.stringify({ company_ids: assignedCompanies }),
        });

        if (!assignCompanyRes.ok) {
          throw new Error('Failed to assign companies');
        }
      }

      // Save form assignments for staff users
      if (userId && (formData.role === 'staff' || formData.role === 'rn')) {
        const assignFormsRes = await fetch(`/api/users/${userId}/assign-forms`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': currentUser?.id || '',
            'x-user-email': currentUser?.email || '',
          },
          body: JSON.stringify({ form_ids: assignedForms }),
        });

        if (!assignFormsRes.ok) {
          throw new Error('Failed to assign forms');
        }
      }

      setShowModal(false);
      await loadData();
    } catch (error) {
      console.error('Save error:', error);
      alert(error instanceof Error ? error.message : 'Failed to save user');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user: OfficeUser) {
    if (!confirm(`Are you sure you want to permanently delete ${user.name}? This cannot be undone.`)) return;

    try {
      const response = await fetch('/api/users', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser?.id || '',
          'x-user-email': currentUser?.email || '',
        },
        body: JSON.stringify({ userId: user.id, email: user.email, caller_user_id: currentUser?.id || '', caller_user_email: currentUser?.email || '' }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to delete user');
      }

      await loadData();
    } catch (error) {
      console.error('Delete error:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete user');
    }
  }

  function getCompanyName(companyId: string | null): string {
    if (!companyId) return 'All Companies';
    const company = companies.find(c => c.id === companyId);
    return company?.name || 'Unknown';
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
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-6 h-6" />
                User Management
              </h1>
              <p className="text-sm text-gray-500">
                Manage office staff access and permissions
              </p>
            </div>
            <button
              onClick={openAddModal}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Users Table */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Name</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Email</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Role</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Companies</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map(user => (
                <tr key={user.id} className={!user.active ? 'bg-gray-50 opacity-60' : ''}>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{user.name}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(userCompanyMap[user.id] && userCompanyMap[user.id].length > 0) ? (
                        userCompanyMap[user.id].map((name, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                            <Building2 className="w-3 h-3" />
                            {name}
                          </span>
                        ))
                      ) : user.role === 'super_admin' ? (
                        <span className="text-gray-500 text-sm">All Companies</span>
                      ) : (
                        <span className="text-gray-400 text-sm">None assigned</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {user.active ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <Check className="w-4 h-4" /> Active
                      </span>
                    ) : (
                      <span className="text-gray-400 flex items-center gap-1">
                        <X className="w-4 h-4" /> Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => handleDelete(user)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No users found. Add your first user to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Role Legend */}
        <div className="mt-6 bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5" />
            Role Permissions
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="border rounded-lg p-4">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor('staff')}`}>
                Staff
              </span>
              <ul className="mt-3 text-sm text-gray-600 space-y-1">
                <li>• View, Edit (until finalized), Finalize submissions</li>
                <li>• Delete submissions for assigned forms</li>
                <li>• Access only assigned forms</li>
              </ul>
            </div>
            <div className="border rounded-lg p-4">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor('admin')}`}>
                Admin
              </span>
              <ul className="mt-3 text-sm text-gray-600 space-y-1">
                <li>• Full CRUD on assigned companies</li>
                <li>• Edit even after finalization</li>
                <li>• Manage users in assigned companies</li>
              </ul>
            </div>
            <div className="border rounded-lg p-4">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor('super_admin')}`}>
                Super Admin
              </span>
              <ul className="mt-3 text-sm text-gray-600 space-y-1">
                <li>• Full access to all companies</li>
                <li>• Full access to all users</li>
                <li>• Full access to all settings</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">
              {editingUser ? 'Edit User' : 'Add New User'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Smith"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@company.com"
                  disabled={!!editingUser}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>

              {/* Password field — only shown when creating a new user */}
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temporary Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Min 6 characters"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 pr-10 text-gray-900 placeholder:text-gray-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    User will be prompted to change this on first login.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'staff' | 'rn' | 'admin' | 'super_admin' })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  <option value="staff">Staff</option>
                  <option value="rn">RN (Registered Nurse)</option>
                  <option value="admin">Admin</option>
                  {currentUser?.role === 'super_admin' && (
                    <option value="super_admin">Super Admin</option>
                  )}
                </select>
              </div>

              {/* Company Assignments Section */}
              {(formData.role === 'admin' || formData.role === 'rn' || formData.role === 'staff') && (
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    <Building2 className="w-4 h-4 inline mr-1" />
                    Company Assignments
                  </label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {companies.length === 0 ? (
                      <p className="text-sm text-gray-500">No companies available</p>
                    ) : (
                      companies.map(company => (
                        <label key={company.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={assignedCompanies.includes(company.id)}
                            onChange={(e) => {
                              const newAssignments = e.target.checked
                                ? [...assignedCompanies, company.id]
                                : assignedCompanies.filter(id => id !== company.id);
                              setAssignedCompanies(newAssignments);
                              // Update forms when companies change
                              fetchFormsForCompanies(newAssignments);
                            }}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-700">{company.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Form Assignments Section */}
              {(formData.role === 'staff' || formData.role === 'rn') && (
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Form Assignments
                  </label>
                  {assignedCompanies.length === 0 ? (
                    <p className="text-sm text-gray-500">Select companies first to assign forms</p>
                  ) : availableForms.length === 0 ? (
                    <p className="text-sm text-gray-500">No forms available for selected companies</p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {availableForms.map(form => (
                        <label key={form.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={assignedForms.includes(form.id)}
                            onChange={(e) => {
                              const newAssignments = e.target.checked
                                ? [...assignedForms, form.id]
                                : assignedForms.filter(id => id !== form.id);
                              setAssignedForms(newAssignments);
                            }}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-700">
                            {form.name}
                            {companies.length > 1 && form.company_id && (
                              <span className="text-gray-400 ml-1">
                                ({companies.find(c => c.id === form.company_id)?.name || ''})
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingUser ? 'Save Changes' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
