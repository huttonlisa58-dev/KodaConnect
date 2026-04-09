'use client';

/**
 * ComplianceSnapshot Component
 * Displays compliance metrics with progress bars and expiring credential alerts
 */

import React from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

interface ExpiringCredential {
  id: string;
  caregiver_name: string;
  credential_type: string;
  days_until_expiry: number;
}

interface ComplianceSnapshotProps {
  onboardingPercent: number;
  credentialPercent: number;
  formPercent: number;
  expiringCredentials: ExpiringCredential[];
}

export function ComplianceSnapshot({
  onboardingPercent,
  credentialPercent,
  formPercent,
  expiringCredentials,
}: ComplianceSnapshotProps) {
  const progressBars = [
    { label: 'Onboarding Completion', percent: onboardingPercent, color: 'bg-blue-500' },
    { label: 'Credential Compliance', percent: credentialPercent, color: 'bg-purple-500' },
    { label: 'Form Completion', percent: formPercent, color: 'bg-green-500' },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Compliance Snapshot</h3>

      {/* Progress Bars */}
      <div className="space-y-4 mb-6">
        {progressBars.map((bar, index) => (
          <div key={index}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">{bar.label}</span>
              <span className="text-sm font-semibold text-gray-900">{bar.percent}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${bar.color}`}
                style={{ width: `${Math.min(bar.percent, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium text-gray-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-500" />
            Expiring Credentials
          </h4>
          <Link
            href="/office/caregivers?filter=expiring"
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            View All
          </Link>
        </div>

        <div className="space-y-2">
          {expiringCredentials.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No credentials expiring soon</p>
          ) : (
            expiringCredentials.slice(0, 5).map((credential) => (
              <div
                key={credential.id}
                className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {credential.caregiver_name}
                  </p>
                  <p className="text-xs text-gray-600">
                    {credential.credential_type} - {credential.days_until_expiry} days
                  </p>
                </div>
                <div className="h-2 w-2 rounded-full bg-orange-500" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
