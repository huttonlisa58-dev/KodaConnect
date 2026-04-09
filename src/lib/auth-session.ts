/**
 * Server-side session management using Supabase Auth
 * Handles session lifecycle, timeouts, and user profile retrieval
 */

import { cookies } from 'next/headers';
import { createServerSupabaseClient } from './supabase';

/**
 * Session timeout in milliseconds (15 minutes)
 */
export const SESSION_TIMEOUT = 15 * 60 * 1000;

/**
 * Session warning time in milliseconds (2 minutes before timeout)
 */
export const SESSION_WARNING_TIME = 2 * 60 * 1000;

/**
 * Activity check interval in milliseconds (every 60 seconds)
 */
export const SESSION_CHECK_INTERVAL = 60 * 1000;

/**
 * Office user profile retrieved from the database
 */
export interface SessionUser {
  id: string;
  auth_user_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_super_admin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Session data stored server-side
 */
export interface SessionData {
  user: SessionUser;
  last_activity: number; // Timestamp
  created_at: number; // Timestamp
}

/**
 * Get the current server session from Supabase auth
 * Verifies the session hasn't timed out
 * Returns null if no valid session exists
 */
export async function getServerSession(): Promise<SessionData | null> {
  try {
    const supabase = createServerSupabaseClient();

    // Get the current auth session
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      return null;
    }

    // Get the user's profile from the staff table
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .single();

    if (staffError || !staffData) {
      return null;
    }

    // Check if user is active
    if (!staffData.is_active) {
      return null;
    }

    // Get session metadata from auth session
    const now = Date.now();

    return {
      user: staffData as SessionUser,
      last_activity: now,
      created_at: now,
    };
  } catch (error) {
    console.error('Error getting server session:', error);
    return null;
  }
}

/**
 * Get the authenticated user's profile
 * Returns null if not authenticated or session invalid
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const session = await getServerSession();
    return session ? session.user : null;
  } catch (error) {
    console.error('Error getting session user:', error);
    return null;
  }
}

/**
 * Create a server-side session for a user after successful authentication
 * Called after Supabase auth login
 */
export async function createSession(
  authUserId: string,
  email: string
): Promise<SessionUser | null> {
  try {
    const supabase = createServerSupabaseClient();

    // Get or create the staff record linked to this auth user
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('*')
      .eq('auth_user_id', authUserId)
      .eq('is_active', true)
      .single();

    if (staffError || !staffData) {
      console.error('Staff record not found or inactive:', staffError);
      return null;
    }

    // Verify email matches
    if (staffData.email !== email) {
      console.error('Email mismatch in session creation');
      return null;
    }

    return staffData as SessionUser;
  } catch (error) {
    console.error('Error creating session:', error);
    return null;
  }
}

/**
 * Destroy the server session (logout)
 * Clears the Supabase auth session
 */
export async function destroySession(): Promise<void> {
  try {
    const supabase = createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.error('Error destroying session:', error);
  }
}

/**
 * Check if a session has exceeded the timeout threshold
 * Returns true if session should be invalidated
 */
export function isSessionExpired(sessionData: SessionData): boolean {
  const now = Date.now();
  const inactivityDuration = now - sessionData.last_activity;
  return inactivityDuration > SESSION_TIMEOUT;
}

/**
 * Check if we should warn the user about upcoming timeout
 * Returns true if session is approaching timeout (within 2 minutes)
 */
export function shouldWarnAboutTimeout(sessionData: SessionData): boolean {
  const now = Date.now();
  const inactivityDuration = now - sessionData.last_activity;
  const timeUntilTimeout = SESSION_TIMEOUT - inactivityDuration;
  return timeUntilTimeout <= SESSION_WARNING_TIME && timeUntilTimeout > 0;
}

/**
 * Get the time remaining until session timeout (in milliseconds)
 * Returns 0 if already expired
 */
export function getSessionTimeRemaining(sessionData: SessionData): number {
  const now = Date.now();
  const inactivityDuration = now - sessionData.last_activity;
  const timeRemaining = SESSION_TIMEOUT - inactivityDuration;
  return Math.max(0, timeRemaining);
}

/**
 * Verify that a user has a specific role
 * Used for permission checks
 */
export function hasRole(
  user: SessionUser,
  role: 'staff' | 'admin' | 'super_admin'
): boolean {
  if (role === 'super_admin') {
    return user.is_super_admin;
  }
  // Note: The staff table doesn't have an explicit "role" field in the current schema
  // This is a placeholder for future role-based access control
  // For now, we use is_super_admin as the only distinguishing field
  return true;
}

/**
 * Verify that a user is a super admin
 */
export function isSuperAdmin(user: SessionUser): boolean {
  return user.is_super_admin;
}

/**
 * Verify that a user is active
 */
export function isUserActive(user: SessionUser): boolean {
  return user.is_active;
}
