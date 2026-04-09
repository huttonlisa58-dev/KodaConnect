'use client';

/**
 * Client-side Session Provider
 * Wraps the office portal and manages session lifecycle
 * Uses Supabase client-side auth and localStorage for user data
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { getSupabase } from '@/lib/supabase';

interface SessionUser {
  id: string;
  company_id: string;
  email: string;
  name: string;
  full_name?: string;
  role: string;
  active: boolean;
  is_active?: boolean;
  is_super_admin?: boolean;
  must_change_password?: boolean;
  phone?: string | null;
  auth_user_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface SessionContextType {
  user: SessionUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Check the current session using Supabase client + localStorage
   */
  const checkSession = useCallback(async () => {
    try {
      const { data: { session }, error } = await getSupabase().auth.getSession();

      if (error || !session) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Get office user data from localStorage
      const storedUser = localStorage.getItem('office_user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        // Normalize: office_users table uses 'role' field, staff table uses 'is_super_admin' boolean.
        // Ensure both are present so all pages can check either property.
        if (parsed.role && parsed.is_super_admin === undefined) {
          parsed.is_super_admin = parsed.role === 'super_admin';
        }
        if (parsed.is_super_admin !== undefined && !parsed.role) {
          parsed.role = parsed.is_super_admin ? 'super_admin' : 'staff';
        }
        setUser(parsed);
      } else {
        // If no localStorage data, fetch from Supabase
        const { data: officeUser } = await getSupabase()
          .from('office_users')
          .select('*')
          .eq('email', session.user.email)
          .eq('active', true)
          .single();

        if (officeUser) {
          // Normalize role/is_super_admin across both schemas
          if (officeUser.role && officeUser.is_super_admin === undefined) {
            officeUser.is_super_admin = officeUser.role === 'super_admin';
          }
          if (officeUser.is_super_admin !== undefined && !officeUser.role) {
            officeUser.role = officeUser.is_super_admin ? 'super_admin' : 'staff';
          }
          setUser(officeUser);
          localStorage.setItem('office_user', JSON.stringify(officeUser));
        } else {
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Failed to check session:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Refresh session
   */
  const refreshSession = useCallback(async () => {
    await checkSession();
  }, [checkSession]);

  /**
   * Logout the user
   */
  const logout = useCallback(async () => {
    try {
      await getSupabase().auth.signOut();
      setUser(null);
      localStorage.removeItem('office_user');

      if (typeof window !== 'undefined') {
        window.location.href = '/office/login';
      }
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  }, []);

  /**
   * Check session on mount
   */
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  /**
   * Listen for Supabase auth state changes
   */
  useEffect(() => {
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          localStorage.removeItem('office_user');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const value: SessionContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout,
    refreshSession,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

/**
 * Hook to use the session context
 */
export function useSession(): SessionContextType {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
}
