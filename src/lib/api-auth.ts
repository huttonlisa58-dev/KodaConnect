/**
 * Server-side API authentication and authorization utilities
 * Validates requesting user role and access on every protected API call
 */

import { createServerSupabaseClient } from './supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Authenticated user context returned by getAuthenticatedUser()
 * Includes role, assigned companies, and assigned forms
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: 'staff' | 'rn' | 'admin' | 'super_admin';
  company_id: string | null; // Legacy single-company field
  active: boolean;
  assigned_companies: string[]; // From user_company_assignments
  assigned_forms: string[]; // From user_form_assignments
}

/**
 * Extract the authenticated user from the request
 * Reads X-User-Id header (set by client-side auth) and fetches full context
 * Returns null if not authenticated
 */
export async function getAuthenticatedUser(
  request: NextRequest,
  bodyAuth?: { caller_user_id?: string; caller_user_email?: string }
): Promise<AuthenticatedUser | null> {
  try {
    // Check headers first, then fall back to body-provided auth fields
    const userId = request.headers.get('x-user-id') || bodyAuth?.caller_user_id || null;
    const userEmail = request.headers.get('x-user-email') || bodyAuth?.caller_user_email || null;

    if (!userId && !userEmail) {
      return null;
    }

    const supabase = createServerSupabaseClient();

    // Fetch user from office_users
    let query = supabase.from('office_users').select('*');

    if (userId) {
      query = query.eq('id', userId);
    } else if (userEmail) {
      query = query.eq('email', userEmail);
    }

    const { data: user, error: userError } = await query.eq('active', true).single();

    if (userError || !user) {
      return null;
    }

    // Fetch assigned companies
    const { data: companyAssignments } = await supabase
      .from('user_company_assignments')
      .select('company_id')
      .eq('user_id', user.id);

    const assignedCompanies = (companyAssignments || []).map((a: { company_id: string }) => a.company_id);

    // Fetch assigned forms
    const { data: formAssignments } = await supabase
      .from('user_form_assignments')
      .select('form_id')
      .eq('user_id', user.id);

    const assignedForms = (formAssignments || []).map((a: { form_id: string }) => a.form_id);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      company_id: user.company_id,
      active: user.active,
      assigned_companies: assignedCompanies,
      assigned_forms: assignedForms,
    };
  } catch (error) {
    console.error('Error getting authenticated user:', error);
    return null;
  }
}

/**
 * Check if user has the minimum required role
 * Role hierarchy: super_admin > admin > rn > staff
 */
export function hasMinimumRole(
  user: AuthenticatedUser,
  minimumRole: 'staff' | 'rn' | 'admin' | 'super_admin'
): boolean {
  const roleLevel: Record<string, number> = {
    staff: 1,
    rn: 2,
    admin: 3,
    super_admin: 4,
  };

  return (roleLevel[user.role] || 0) >= (roleLevel[minimumRole] || 0);
}

/**
 * Require a minimum role level — returns 403 response if insufficient
 */
export function requireRole(
  user: AuthenticatedUser,
  minimumRole: 'staff' | 'rn' | 'admin' | 'super_admin'
): NextResponse | null {
  if (!hasMinimumRole(user, minimumRole)) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }
  return null; // No error — user has the required role
}

/**
 * Check if user can access a specific company
 * Super admins bypass company checks
 */
export function canAccessCompany(user: AuthenticatedUser, companyId: string): boolean {
  if (user.role === 'super_admin') return true;
  return user.assigned_companies.includes(companyId);
}

/**
 * Require company access — returns 403 response if no access
 */
export function requireCompanyAccess(
  user: AuthenticatedUser,
  companyId: string | null
): NextResponse | null {
  if (!companyId) return null; // No company scoping needed
  if (!canAccessCompany(user, companyId)) {
    return NextResponse.json(
      { error: 'Access denied to this company' },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Check if user can access a specific form
 * Super admins: access all forms
 * Admins: access all forms in their assigned companies
 * Staff: access only their assigned forms
 */
export function canAccessForm(user: AuthenticatedUser, formId: string, formCompanyId?: string | null): boolean {
  if (user.role === 'super_admin') return true;

  if (user.role === 'admin') {
    // Admins see all forms in assigned companies
    if (formCompanyId) {
      return user.assigned_companies.includes(formCompanyId);
    }
    // If no company context, check form assignments as fallback
    return user.assigned_forms.includes(formId) || user.assigned_companies.length > 0;
  }

  // Staff and RN: must be specifically assigned to the form
  return user.assigned_forms.includes(formId);
}

/**
 * Require form access — returns 403 response if no access
 */
export function requireFormAccess(
  user: AuthenticatedUser,
  formId: string,
  formCompanyId?: string | null
): NextResponse | null {
  if (!canAccessForm(user, formId, formCompanyId)) {
    return NextResponse.json(
      { error: 'Access denied to this form' },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Check if user can edit a submission based on role and status
 * Staff: can edit submitted submissions only (not finalized)
 * Admin: can edit any status in assigned companies (including finalized)
 * Super Admin: can always edit
 */
export function canEditSubmission(
  user: AuthenticatedUser,
  submissionStatus: string
): boolean {
  if (user.role === 'super_admin') return true;

  if (user.role === 'admin') {
    // Admin can edit even after finalization
    return true;
  }

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
export function canFinalizeSubmission(user: AuthenticatedUser): boolean {
  return true; // All roles can finalize (access check is separate)
}

/**
 * Check if user can delete a submission
 * All roles can delete submissions they have access to
 */
export function canDeleteSubmission(user: AuthenticatedUser): boolean {
  return true; // All roles can delete (access check is separate)
}

/**
 * Check if user can manage forms (create/edit/archive)
 * Only admin and super_admin
 */
export function canManageForms(user: AuthenticatedUser): boolean {
  return user.role === 'admin' || user.role === 'super_admin';
}

/**
 * Check if user can manage other users
 * Only admin and super_admin
 */
export function canManageUsers(user: AuthenticatedUser): boolean {
  return user.role === 'admin' || user.role === 'super_admin';
}

/**
 * Check if user can create a user with a specific role
 * Admin: can create staff and admin in assigned companies
 * Super Admin: can create any role
 */
export function canCreateUserWithRole(
  user: AuthenticatedUser,
  targetRole: 'staff' | 'rn' | 'admin' | 'super_admin'
): boolean {
  if (user.role === 'super_admin') return true;

  if (user.role === 'admin') {
    // Admins cannot create super_admin users
    return targetRole !== 'super_admin';
  }

  return false;
}

/**
 * Check if user can assign companies to other users
 * Only super_admin
 */
export function canAssignCompanies(user: AuthenticatedUser): boolean {
  return user.role === 'super_admin';
}
