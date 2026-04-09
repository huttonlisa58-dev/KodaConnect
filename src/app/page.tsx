'use client';

import Link from 'next/link';
import { FileText, Users, Shield } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            KodaConnect
          </h1>
          <p className="text-xl text-gray-600">
            Document Management Portal for Complete Homecare
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <Link
            href="/office"
            className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow border border-gray-100"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="bg-blue-100 rounded-lg p-3">
                <Shield className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900">
                Office Portal
              </h2>
            </div>
            <p className="text-gray-600">
              Staff access to manage documents, review submissions, and send form links to applicants.
            </p>
          </Link>

          <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100 opacity-75">
            <div className="flex items-center gap-4 mb-4">
              <div className="bg-green-100 rounded-lg p-3">
                <FileText className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900">
                Applicant Forms
              </h2>
            </div>
            <p className="text-gray-600">
              Access your assigned forms via the link sent to your phone. Verify with OTP to continue.
            </p>
            <p className="text-sm text-gray-400 mt-4 italic">
              Use the link texted to you to access your forms
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-500" />
            Getting Started
          </h3>
          <div className="space-y-3 text-gray-600">
            <p>
              <strong>For Office Staff:</strong> Log in to the Office Portal to manage documents and send form links to applicants.
            </p>
            <p>
              <strong>For Applicants:</strong> Wait for a text message with your unique form link. You&apos;ll verify your identity with a one-time code.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
