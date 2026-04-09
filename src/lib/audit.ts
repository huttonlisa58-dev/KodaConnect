/**
 * Audit logging system for compliance and security tracking
 * Logs all significant actions to the audit_log table
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from './supabase';
import { getSessionUser } from './auth-session';

/**
 * Types of actions that can be audited
 */
export type AuditAction =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'download'
  | 'login'
  | 'logout'
  | 'send_message'
  | 'approve'
  | 'reject'
  | 'permission_change';

/**
 * Types of resources that can be audited
 */
export type AuditResourceType =
  | 'submission'
  | 'applicant'
  | 'document'
  | 'staff'
  | 'template'
  | 'auth';

/**
 * Audit log entry parameters
 */
export interface AuditLogParams {
  userId?: string;
  userEmail?: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  status?: 'success' | 'failure';
  errorMessage?: string;
}

/**
 * Audit log entry stored in database
 */
export interface AuditLogEntry extends AuditLogParams {
  id: string;
  created_at: string;
}

/**
 * Extract IP address from request headers
 * Tries multiple header formats for different proxy setups
 */
export function getIpFromRequest(request: NextRequest): string {
  // Try common header formats
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  const clientIp = request.headers.get('cf-connecting-ip'); // Cloudflare
  if (clientIp) {
    return clientIp;
  }

  // Fallback
  return request.headers.get('x-real-ip') || '0.0.0.0';
}

/**
 * Get user agent from request headers
 */
export function getUserAgentFromRequest(request: NextRequest): string {
  return request.headers.get('user-agent') || 'Unknown';
}

/**
 * Log an audit event
 * Can be called from anywhere in the application
 */
export async function logAudit(params: AuditLogParams): Promise<AuditLogEntry | null> {
  try {
    const supabase = createServerSupabaseClient();

    // If userId not provided, try to get from session
    let userId = params.userId;
    let userEmail = params.userEmail;

    if (!userId) {
      const sessionUser = await getSessionUser();
      if (sessionUser) {
        userId = sessionUser.id;
        userEmail = sessionUser.email;
      }
    }

    // Create audit log entry
    const { data, error } = await supabase
      .from('audit_log')
      .insert({
        user_id: userId,
        user_email: userEmail,
        action: params.action,
        resource_type: params.resourceType,
        resource_id: params.resourceId,
        details: params.details,
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
        status: params.status || 'success',
        error_message: params.errorMessage,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating audit log:', error);
      return null;
    }

    return data as AuditLogEntry;
  } catch (error) {
    console.error('Error in logAudit:', error);
    return null;
  }
}

/**
 * Log a login event
 */
export async function logLogin(
  email: string,
  ipAddress?: string,
  userAgent?: string,
  success: boolean = true
): Promise<AuditLogEntry | null> {
  return logAudit({
    userEmail: email,
    action: 'login',
    resourceType: 'auth',
    ipAddress,
    userAgent,
    status: success ? 'success' : 'failure',
  });
}

/**
 * Log a logout event
 */
export async function logLogout(ipAddress?: string, userAgent?: string): Promise<AuditLogEntry | null> {
  return logAudit({
    action: 'logout',
    resourceType: 'auth',
    ipAddress,
    userAgent,
  });
}

/**
 * Log a submission view
 */
export async function logSubmissionView(submissionId: string): Promise<AuditLogEntry | null> {
  return logAudit({
    action: 'view',
    resourceType: 'submission',
    resourceId: submissionId,
  });
}

/**
 * Log a submission update
 */
export async function logSubmissionUpdate(
  submissionId: string,
  changes?: Record<string, unknown>
): Promise<AuditLogEntry | null> {
  return logAudit({
    action: 'update',
    resourceType: 'submission',
    resourceId: submissionId,
    details: { changes },
  });
}

/**
 * Log a submission approval
 */
export async function logSubmissionApproval(
  submissionId: string,
  notes?: string
): Promise<AuditLogEntry | null> {
  return logAudit({
    action: 'approve',
    resourceType: 'submission',
    resourceId: submissionId,
    details: { notes },
  });
}

/**
 * Log a submission rejection
 */
export async function logSubmissionRejection(
  submissionId: string,
  reason?: string
): Promise<AuditLogEntry | null> {
  return logAudit({
    action: 'reject',
    resourceType: 'submission',
    resourceId: submissionId,
    details: { reason },
  });
}

/**
 * Log a PDF download/export
 */
export async function logDocumentExport(
  submissionId: string,
  format: string = 'pdf'
): Promise<AuditLogEntry | null> {
  return logAudit({
    action: 'export',
    resourceType: 'submission',
    resourceId: submissionId,
    details: { format },
  });
}

/**
 * Log an SMS send
 */
export async function logSmsSend(
  recipientPhone: string,
  submissionId?: string
): Promise<AuditLogEntry | null> {
  return logAudit({
    action: 'send_message',
    resourceType: 'submission',
    resourceId: submissionId,
    details: { recipientPhone },
  });
}

/**
 * Log a failed operation
 */
export async function logFailure(
  action: AuditAction,
  resourceType: AuditResourceType,
  error: Error,
  resourceId?: string
): Promise<AuditLogEntry | null> {
  return logAudit({
    action,
    resourceType,
    resourceId,
    status: 'failure',
    errorMessage: error.message,
  });
}

/**
 * Query audit logs with filters
 */
export async function queryAuditLogs(filters: {
  userId?: string;
  action?: AuditAction;
  resourceType?: AuditResourceType;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  try {
    const supabase = createServerSupabaseClient();

    let query = supabase.from('audit_log').select('*');

    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }

    if (filters.action) {
      query = query.eq('action', filters.action);
    }

    if (filters.resourceType) {
      query = query.eq('resource_type', filters.resourceType);
    }

    if (filters.resourceId) {
      query = query.eq('resource_id', filters.resourceId);
    }

    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate.toISOString());
    }

    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate.toISOString());
    }

    query = query.order('created_at', { ascending: false });

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error querying audit logs:', error);
      return [];
    }

    return data as AuditLogEntry[];
  } catch (error) {
    console.error('Error in queryAuditLogs:', error);
    return [];
  }
}
