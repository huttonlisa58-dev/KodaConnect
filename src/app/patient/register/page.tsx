'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, ChevronRight, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

type RegisterStep = 'form' | 'otp' | 'success';

interface RegistrationData {
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  relationship: string;
  insurance: string;
  otp: string;
}

export default function PatientRegister() {
  const router = useRouter();
  const [step, setStep] = useState<RegisterStep>('form');
  const [formData, setFormData] = useState<RegistrationData>({
    fullName: '',
    phone: '',
    email: '',
    dateOfBirth: '',
    relationship: 'self',
    insurance: '',
    otp: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Send OTP
      const response = await fetch('/api/patient/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formData.phone }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to send verification code');
        return;
      }

      setSuccessMessage('Verification code sent to your phone!');
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/patient/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formData.fullName,
          phone: formData.phone,
          email: formData.email || null,
          dateOfBirth: formData.dateOfBirth,
          relationship: formData.relationship,
          insurance: formData.insurance || null,
          otp: formData.otp,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      // Store session token
      localStorage.setItem('patient_token', data.token);
      localStorage.setItem('patient_id', data.patient_id);

      setSuccessMessage('Account created successfully!');
      setStep('success');

      // Redirect after showing success message
      setTimeout(() => {
        router.push('/patient/dashboard');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const calculateMaxDate = () => {
    const today = new Date();
    today.setFullYear(today.getFullYear() - 18);
    return today.toISOString().split('T')[0];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Heart className="w-8 h-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900">KodaConnect</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Create Your Account</h1>
          <p className="text-gray-600 mt-2">Join your care team on KodaConnect</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
          {error && (
            <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">Error</p>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="flex gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-green-700 font-semibold">{successMessage}</p>
            </div>
          )}

          {/* Registration Form Step */}
          {step === 'form' && (
            <form onSubmit={handleFormSubmit} className="space-y-5">
              {/* Full Name */}
              <div>
                <label htmlFor="fullName" className="block text-sm font-semibold text-gray-900 mb-2">
                  Full Name *
                </label>
                <input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={loading}
                />
              </div>

              {/* Phone Number */}
              <div>
                <label htmlFor="phone" className="block text-sm font-semibold text-gray-900 mb-2">
                  Phone Number *
                </label>
                <input
                  id="phone"
                  type="tel"
                  placeholder="(123) 456-7890"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={loading}
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-900 mb-2">
                  Email (Optional)
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                />
              </div>

              {/* Date of Birth */}
              <div>
                <label htmlFor="dob" className="block text-sm font-semibold text-gray-900 mb-2">
                  Date of Birth *
                </label>
                <input
                  id="dob"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  max={calculateMaxDate()}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">Must be 18+ years old</p>
              </div>

              {/* Relationship */}
              <div>
                <label htmlFor="relationship" className="block text-sm font-semibold text-gray-900 mb-2">
                  Relationship *
                </label>
                <select
                  id="relationship"
                  value={formData.relationship}
                  onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={loading}
                >
                  <option value="self">Self (Patient)</option>
                  <option value="spouse">Spouse</option>
                  <option value="child">Child</option>
                  <option value="parent">Parent</option>
                  <option value="guardian">Guardian</option>
                  <option value="other">Other Family Member</option>
                </select>
              </div>

              {/* Insurance */}
              <div>
                <label htmlFor="insurance" className="block text-sm font-semibold text-gray-900 mb-2">
                  Primary Insurance (Optional)
                </label>
                <input
                  id="insurance"
                  type="text"
                  placeholder="e.g., Medicare, Blue Cross"
                  value={formData.insurance}
                  onChange={(e) => setFormData({ ...formData, insurance: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !formData.fullName || !formData.phone || !formData.dateOfBirth}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending verification code...
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* OTP Step */}
          {step === 'otp' && (
            <form onSubmit={handleOTPSubmit} className="space-y-4">
              <div>
                <label htmlFor="otp" className="block text-sm font-semibold text-gray-900 mb-2">
                  Verification Code
                </label>
                <input
                  id="otp"
                  type="text"
                  placeholder="000000"
                  value={formData.otp}
                  onChange={(e) => setFormData({ ...formData, otp: e.target.value.replace(/\D/g, '') })}
                  maxLength={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-3xl tracking-widest text-center font-mono"
                  required
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">Enter the 6-digit code sent to {formData.phone}</p>
              </div>

              <button
                type="submit"
                disabled={loading || formData.otp.length !== 6}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    Create Account
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('form');
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="w-full text-blue-600 font-semibold py-2 hover:text-blue-700 transition"
              >
                Back
              </button>
            </form>
          )}

          {/* Success Step */}
          {step === 'success' && (
            <div className="text-center space-y-4">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
              <div>
                <h2 className="text-xl font-bold text-gray-900">Welcome, {formData.fullName}!</h2>
                <p className="text-gray-600">Your account is ready. Redirecting to dashboard...</p>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-600">Already have an account?</span>
            </div>
          </div>

          {/* Login Link */}
          <Link
            href="/patient/login"
            className="block w-full text-center py-3 border-2 border-blue-600 text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition"
          >
            Sign In
          </Link>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-sm mt-6">
          Protected by HIPAA-compliant security
        </p>
      </div>
    </div>
  );
}
