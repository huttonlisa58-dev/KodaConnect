'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { Loader2, LogIn, FileCheck, AlertCircle } from 'lucide-react';
import { Suspense } from 'react';

function OfficeLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const message = searchParams.get('message');
    if (message === 'password_changed') {
      setSuccessMessage('Password changed successfully. Please sign in with your new password.');
    }
  }, [searchParams]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[Login] Attempting sign in for:', email.toLowerCase());

      // Sign in with Supabase Auth
      const { data, error: authError } = await getSupabase().auth.signInWithPassword({
        email: email.toLowerCase(),
        password,
      });

      if (authError) {
        console.error('[Login] Auth error:', authError.message);
        throw new Error('Invalid email or password');
      }

      console.log('[Login] Auth succeeded, checking office_users table...');

      // Verify user exists in office_users table
      const { data: user, error: userError } = await getSupabase()
        .from('office_users')
        .select('*')
        .eq('email', email.toLowerCase())
        .eq('active', true)
        .single();

      if (userError || !user) {
        console.error('[Login] office_users query failed:', userError?.message || 'User not found');
        // Sign out since they're not an authorized office user
        await getSupabase().auth.signOut();
        throw new Error('You are not authorized to access the office portal');
      }

      console.log('[Login] Office user found:', user.name, 'Role:', user.role);

      // Fetch company assignments for role-based filtering
      const { data: companyAssignments } = await getSupabase()
        .from('user_company_assignments')
        .select('company_id')
        .eq('user_id', user.id);

      user.assigned_companies = companyAssignments?.map((a: { company_id: string }) => a.company_id) || [];
      console.log('[Login] Assigned companies:', user.assigned_companies.length);

      // Fetch form assignments for staff-level filtering
      if (user.role === 'staff') {
        const { data: formAssignments } = await getSupabase()
          .from('user_form_assignments')
          .select('form_id')
          .eq('user_id', user.id);

        user.assigned_forms = formAssignments?.map((a: { form_id: string }) => a.form_id) || [];
      }

      // Store enriched user info for session
      localStorage.setItem('office_user', JSON.stringify(user));

      // Check if user needs to change password (first login)
      if (user.must_change_password) {
        console.log('[Login] Redirecting to change-password...');
        router.push('/office/change-password');
      } else {
        console.log('[Login] Redirecting to dashboard...');
        // Use window.location for a full page navigation to avoid SPA routing issues
        window.location.href = '/office/dashboard';
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      console.error('[Login] Error:', errorMessage);
      setError(errorMessage);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-xl">K</span>
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-bold text-white">KodaConnect</h1>
              <p className="text-sm text-slate-400">by Bright Koda</p>
            </div>
          </div>
        </div>

        {/* Login Card */}
        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileCheck className="w-7 h-7 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Office Portal Login</h2>
            <p className="text-gray-500 text-sm mt-1">
              Sign in to access the office portal
            </p>
          </div>

          {successMessage && (
            <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm flex items-center gap-2">
              <FileCheck className="w-4 h-4 flex-shrink-0" />
              {successMessage}
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder:text-gray-400"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-16 text-gray-900 placeholder:text-gray-400"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          Contact your administrator if you need access
        </p>
      </div>
    </div>
  );
}

export default function OfficeLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800" />}>
      <OfficeLoginForm />
    </Suspense>
  );
}
