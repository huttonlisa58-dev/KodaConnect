// Office user authentication utilities

export interface OfficeUser {
  id: string;
  email: string;
  name: string;
  role: 'staff' | 'rn' | 'admin' | 'super_admin';
  company_id: string | null;
  active: boolean;
  created_at: string;
  assigned_companies?: string[];
  assigned_forms?: string[];
}

export function getOfficeUser(): OfficeUser | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem('office_user');
  if (!stored) return null;

  try {
    return JSON.parse(stored) as OfficeUser;
  } catch {
    return null;
  }
}

export function setOfficeUser(user: OfficeUser): void {
  localStorage.setItem('office_user', JSON.stringify(user));
}

export function clearOfficeUser(): void {
  localStorage.removeItem('office_user');
}

/**
 * Check if user can edit a submission based on role and status
 * Staff: can edit submitted only (not finalized)
 * Admin: can edit any status in assigned companies (including finalized)
 * Super Admin: can always edit
 */
export function canEdit(user: OfficeUser | null, submissionStatus: string): boolean {
  if (!user) return false;

  // Super admins can always edit
  if (user.role === 'super_admin') return true;

  // Admins can edit even after finalization (within their companies)
  if (user.role === 'admin') return true;

  // Staff and RN cannot edit finalized submissions
  if (user.role === 'staff' || user.role === 'rn') {
    return submissionStatus !== 'finalized';
  }

  return false;
}

/**
 * Check if user can finalize a submission
 * All roles can finalize submissions they have access to
 */
export function canFinalize(user: OfficeUser | null): boolean {
  if (!user) return false;
  return true; // All roles can finalize
}

/**
 * Check if user can delete a submission
 * All roles can delete submissions they have access to
 */
export function canDelete(user: OfficeUser | null): boolean {
  if (!user) return false;
  return true; // All roles can delete
}

/**
 * Check if user can edit after finalization
 * Only admin and super_admin
 */
export function canEditAfterFinalization(user: OfficeUser | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'super_admin';
}

/**
 * Check if user can manage forms (create/edit/archive)
 * Only admin and super_admin
 */
export function canManageForms(user: OfficeUser | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'super_admin';
}

export function canManageUsers(user: OfficeUser | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'super_admin';
}

/**
 * Check if user can access a specific company
 * Super admins access all companies
 * Others check assigned_companies array (with fallback to company_id)
 */
export function canAccessCompany(user: OfficeUser | null, companyId: string | null): boolean {
  if (!user) return false;

  // Super admins can access all companies
  if (user.role === 'super_admin') return true;

  // Unassigned items accessible to all
  if (!companyId) return true;

  // Check multi-company assignments first
  if (user.assigned_companies && user.assigned_companies.length > 0) {
    return user.assigned_companies.includes(companyId);
  }

  // Fallback to legacy single company_id
  return user.company_id === companyId;
}

/**
 * Check if user can access a specific form
 * Super admins: all forms
 * Admins: all forms in assigned companies
 * Staff: only assigned forms
 */
export function canAccessForm(user: OfficeUser | null, formId: string): boolean {
  if (!user) return false;

  // Super admins access all forms
  if (user.role === 'super_admin') return true;

  // Admins access all forms in their companies (handled at company level)
  if (user.role === 'admin') return true;

  // Staff and RN must be assigned to the form
  if (user.assigned_forms && user.assigned_forms.length > 0) {
    return user.assigned_forms.includes(formId);
  }

  // If no assignments loaded, allow access (will be enforced server-side)
  return true;
}

/**
 * Check if user can assign companies to other users
 * Only super_admin
 */
export function canAssignCompanies(user: OfficeUser | null): boolean {
  if (!user) return false;
  return user.role === 'super_admin';
}

/**
 * Check if user can create a user with a specific role
 */
export function canCreateUserWithRole(
  user: OfficeUser | null,
  targetRole: 'staff' | 'rn' | 'admin' | 'super_admin'
): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'admin') return targetRole !== 'super_admin';
  return false;
}

export function getRoleLabel(role: string): string {
  switch (role) {
    case 'super_admin': return 'Super Admin';
    case 'admin': return 'Admin';
    case 'rn': return 'RN';
    case 'staff': return 'Staff';
    default: return role;
  }
}

export function getRoleColor(role: string): string {
  switch (role) {
    case 'super_admin': return 'bg-purple-100 text-purple-800';
    case 'admin': return 'bg-blue-100 text-blue-800';
    case 'rn': return 'bg-teal-100 text-teal-800';
    case 'staff': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Get the signer_role values that a given user role can sign via Review & Sign.
 * staff → none; rn → rn_evaluator; admin/super_admin → hr_admin + rn_evaluator
 */
export function getSignableRoles(userRole: string): Array<'rn_evaluator' | 'hr_admin'> {
  switch (userRole) {
    case 'rn': return ['rn_evaluator'];
    case 'admin':
    case 'super_admin': return ['hr_admin', 'rn_evaluator'];
    default: return [];
  }
}
