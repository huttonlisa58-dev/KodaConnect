'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { Loader2, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordRequirements = [
    { label: 'At least 8 characters', met: newPassword.length >= 8 },
    { label: 'Contains uppercase letter', met: /[A-Z]/.test(newPassword) },
    { label: 'Contains lowercase letter', met: /[a-z]/.test(newPassword) },
    { label: 'Contains a number', met: /\d/.test(newPassword) },
    { label: 'Passwords match', met: newPassword.length > 0 && newPassword === confirmPassword },
  ];

  const allRequirementsMet = passwordRequirements.every((r) => r.met);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    if (!allRequirementsMet) {
      setError('Please meet all password requirements');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Change password directly using the client-side Supabase SDK
      const { error: updateError } = await getSupabase().auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw new Error(updateError.message || 'Failed to update password');
      }

      // Clear must_change_password flag in database
      const storedUser = localStorage.getItem('office_user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        // Update the flag in the database
        await getSupabase()
          .from('office_users')
          .update({ must_change_password: false })
          .eq('email', user.email);

        user.must_change_password = false;
        localStorage.setItem('office_user', JSON.stringify(user));
      }

      // Sign out and redirect to login so user can sign in with new password
      await getSupabase().auth.signOut();
      router.push('/office/login?message=password_changed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
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

        {/* Change Password Card */}
        <form onSubmit={handleChangePassword} className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-7 h-7 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Change Your Password</h2>
            <p className="text-gray-500 text-sm mt-1">
              You must set a new password before continuing
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Password Requirements */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-gray-600 mb-1">Password Requirements:</p>
              {passwordRequirements.map((req, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle
                    className={`w-4 h-4 ${
                      req.met ? 'text-green-500' : 'text-gray-300'
                    }`}
                  />
                  <span
                    className={`text-xs ${
                      req.met ? 'text-green-700' : 'text-gray-500'
                    }`}
                  >
                    {req.label}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || !allRequirementsMet}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              Set New Password
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          Contact your administrator if you need help
        </p>
      </div>
    </div>
  );
}
