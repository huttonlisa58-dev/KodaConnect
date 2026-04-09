/**
 * CredentialTable Component
 * Displays credential compliance information in a sortable table
 */

'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface CredentialStat {
  credentialType: string;
  total: number;
  current: number;
  expiring: number;
  expired: number;
}

interface CredentialTableProps {
  credentials: CredentialStat[];
}

type SortField = 'name' | 'urgency';

export default function CredentialTable({ credentials }: CredentialTableProps) {
  const [sortBy, setSortBy] = useState<SortField>('urgency');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (credType: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(credType)) {
      newExpanded.delete(credType);
    } else {
      newExpanded.add(credType);
    }
    setExpandedRows(newExpanded);
  };

  const sortedCredentials = [...credentials].sort((a, b) => {
    if (sortBy === 'urgency') {
      // Sort by expired count first, then expiring count
      if (b.expired !== a.expired) return b.expired - a.expired;
      return b.expiring - a.expiring;
    }
    return a.credentialType.localeCompare(b.credentialType);
  });

  const getStatusColor = (current: number, expiring: number, expired: number, total: number) => {
    if (expired > 0) return 'bg-red-50 border-l-red-600';
    if (expiring > 0) return 'bg-yellow-50 border-l-yellow-600';
    if (current === total) return 'bg-green-50 border-l-green-600';
    return 'bg-gray-50 border-l-gray-400';
  };

  const getUrgencyIcon = (expired: number, expiring: number) => {
    if (expired > 0)
      return <AlertCircle className="w-5 h-5 text-red-600" aria-label="Critical: Expired credentials" />;
    if (expiring > 0)
      return <Clock className="w-5 h-5 text-yellow-600" aria-label="Warning: Expiring soon" />;
    return <CheckCircle className="w-5 h-5 text-green-600" aria-label="Status: All current" />;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="text-left py-4 px-4">
              <button
                onClick={() => setSortBy(sortBy === 'name' ? 'urgency' : 'name')}
                className="font-semibold text-gray-900 hover:text-blue-600 transition flex items-center gap-2"
              >
                Credential Type
                {sortBy === 'name' && <span className="text-xs">↑</span>}
              </button>
            </th>
            <th className="text-left py-4 px-4 font-semibold text-gray-900">
              <span className="flex items-center gap-1">Total</span>
            </th>
            <th className="text-left py-4 px-4 font-semibold text-gray-900">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-4 h-4 text-green-600" />
                Current
              </span>
            </th>
            <th className="text-left py-4 px-4 font-semibold text-gray-900">
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-yellow-600" />
                Expiring (30d)
              </span>
            </th>
            <th className="text-left py-4 px-4 font-semibold text-gray-900">
              <span className="flex items-center gap-1">
                <AlertCircle className="w-4 h-4 text-red-600" />
                Expired
              </span>
            </th>
            <th className="text-left py-4 px-4 font-semibold text-gray-900">Status</th>
          </tr>
        </thead>
        <tbody>
          {sortedCredentials.map((cred) => (
            <React.Fragment key={cred.credentialType}>
              <tr
                onClick={() => toggleRow(cred.credentialType)}
                className={`border-b border-gray-100 hover:bg-gray-50 transition cursor-pointer border-l-4 ${getStatusColor(
                  cred.current,
                  cred.expiring,
                  cred.expired,
                  cred.total
                )}`}
              >
                <td className="py-4 px-4">
                  <button className="font-semibold text-gray-900 hover:text-blue-600 transition">
                    {cred.credentialType}
                  </button>
                </td>
                <td className="py-4 px-4 text-gray-600 font-semibold">{cred.total}</td>
                <td className="py-4 px-4">
                  <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full font-semibold">
                    {cred.current}
                  </span>
                </td>
                <td className="py-4 px-4">
                  {cred.expiring > 0 ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full font-semibold">
                      {cred.expiring}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="py-4 px-4">
                  {cred.expired > 0 ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-full font-semibold">
                      {cred.expired}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="py-4 px-4">{getUrgencyIcon(cred.expired, cred.expiring)}</td>
              </tr>

              {/* Expanded row - Affected caregivers */}
              {expandedRows.has(cred.credentialType) && (
                <tr className="bg-gray-50 border-b border-gray-100">
                  <td colSpan={6} className="py-4 px-8">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-900">Affected Caregivers</h4>

                      {cred.expired > 0 && (
                        <div>
                          <p className="text-sm font-semibold text-red-900 mb-2">
                            Expired ({cred.expired})
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                            {/* Mock data - in production, fetch actual caregivers */}
                            {cred.expired === 1 && (
                              <div className="text-sm text-gray-700 p-2 bg-red-50 rounded border border-red-200">
                                John Smith - Expires: Expired on 01/15/2024
                              </div>
                            )}
                          </div>
                          <button className="text-sm font-semibold text-red-600 hover:text-red-700 transition">
                            → Send Reminders ({cred.expired})
                          </button>
                        </div>
                      )}

                      {cred.expiring > 0 && (
                        <div>
                          <p className="text-sm font-semibold text-yellow-900 mb-2">
                            Expiring in 30 Days ({cred.expiring})
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                            {/* Mock data - in production, fetch actual caregivers */}
                            {cred.expiring >= 1 && (
                              <div className="text-sm text-gray-700 p-2 bg-yellow-50 rounded border border-yellow-200">
                                Sarah Johnson - Expires: 02/20/2024
                              </div>
                            )}
                          </div>
                          <button className="text-sm font-semibold text-yellow-600 hover:text-yellow-700 transition">
                            → Send Reminders ({cred.expiring})
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
