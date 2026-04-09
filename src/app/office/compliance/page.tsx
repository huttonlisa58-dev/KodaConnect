'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Download,
  Loader2,
  AlertCircle,
  MapPin,
} from 'lucide-react';
import ComplianceGauge from '@/components/compliance/ComplianceGauge';
import CredentialTable from '@/components/compliance/CredentialTable';
import AlertsList from '@/components/compliance/AlertsList';

interface ComplianceData {
  overallScore: number;
  scoreColor: string;
  credentialStats: {
    credentialType: string;
    total: number;
    current: number;
    expiring: number;
    expired: number;
  }[];
  formStats: {
    formName: string;
    totalRequired: number;
    completed: number;
    pending: number;
    overdue: number;
    completionRate: number;
  }[];
  trainingStats: {
    module: string;
    completionRate: number;
    overdueCount: number;
  }[];
  stateStats: {
    state: string;
    complianceScore: number;
    issuesCount: number;
  }[];
  alerts: {
    id: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    affectedPerson?: string;
    actionUrl?: string;
  }[];
}

export default function ComplianceDashboard() {
  const router = useRouter();
  const [complianceData, setComplianceData] = useState<ComplianceData | null>(null);
  const [dateRange, setDateRange] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadComplianceData();
  }, [dateRange]);

  const loadComplianceData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Mock compliance data for demonstration
      const mockData: ComplianceData = {
        overallScore: 87,
        scoreColor: 'text-green-600',
        credentialStats: [
          {
            credentialType: 'RN License',
            total: 12,
            current: 11,
            expiring: 1,
            expired: 0,
          },
          {
            credentialType: 'CPR Certification',
            total: 15,
            current: 13,
            expiring: 2,
            expired: 0,
          },
          {
            credentialType: 'Background Check',
            total: 15,
            current: 14,
            expiring: 0,
            expired: 1,
          },
          {
            credentialType: 'TB Test',
            total: 15,
            current: 12,
            expiring: 2,
            expired: 1,
          },
        ],
        formStats: [
          {
            formName: 'HIPAA Training',
            totalRequired: 15,
            completed: 14,
            pending: 1,
            overdue: 0,
            completionRate: 93,
          },
          {
            formName: 'Patient Intake Form',
            totalRequired: 20,
            completed: 20,
            pending: 0,
            overdue: 0,
            completionRate: 100,
          },
          {
            formName: 'Care Plan Documentation',
            totalRequired: 18,
            completed: 15,
            pending: 3,
            overdue: 1,
            completionRate: 83,
          },
        ],
        trainingStats: [
          {
            module: 'HIPAA Compliance',
            completionRate: 93,
            overdueCount: 1,
          },
          {
            module: 'Patient Safety',
            completionRate: 87,
            overdueCount: 2,
          },
          {
            module: 'Emergency Procedures',
            completionRate: 100,
            overdueCount: 0,
          },
        ],
        stateStats: [
          {
            state: 'New York',
            complianceScore: 92,
            issuesCount: 1,
          },
          {
            state: 'New Jersey',
            complianceScore: 85,
            issuesCount: 3,
          },
          {
            state: 'Connecticut',
            complianceScore: 88,
            issuesCount: 2,
          },
        ],
        alerts: [
          {
            id: '1',
            severity: 'critical',
            title: 'Expired Background Check',
            description: 'Background check expired for John Smith',
            affectedPerson: 'John Smith (Caregiver)',
            actionUrl: '#',
          },
          {
            id: '2',
            severity: 'warning',
            title: 'CPR Certification Expiring Soon',
            description: 'CPR certification expires in 10 days',
            affectedPerson: 'Sarah Johnson (Caregiver)',
            actionUrl: '#',
          },
          {
            id: '3',
            severity: 'warning',
            title: 'Form Overdue',
            description: 'Care plan documentation overdue by 3 days',
            affectedPerson: 'Patient: Michael Chen',
            actionUrl: '#',
          },
          {
            id: '4',
            severity: 'info',
            title: 'Training Deadline',
            description: 'Patient Safety training deadline in 5 days',
            affectedPerson: 'Multiple staff',
            actionUrl: '#',
          },
        ],
      };

      setComplianceData(mockData);
    } catch (err) {
      console.error('Load compliance data error:', err);
      setError('Failed to load compliance data');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = (format: 'pdf' | 'excel') => {
    // TODO: Implement export functionality
    console.log(`Exporting as ${format}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!complianceData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Dashboard</h2>
          <p className="text-gray-600 mb-6">{error || 'Failed to load compliance data'}</p>
          <button
            onClick={loadComplianceData}
            className="block bg-blue-600 text-white font-semibold px-6 py-2 rounded-lg hover:bg-blue-700 transition text-center w-full"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/office"
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition font-semibold mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Office
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-8 h-8 text-blue-600" />
                Compliance Dashboard
              </h1>
              <p className="text-gray-600 mt-1">Monitor regulatory compliance across your organization</p>
            </div>
            <div className="flex gap-2">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Time</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
                <option value="1y">Last Year</option>
              </select>
              <button
                onClick={() => handleExport('pdf')}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                <Download className="w-4 h-4" />
                Export PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Overall Score */}
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Overall Compliance Score</h2>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <ComplianceGauge score={complianceData.overallScore} />
            </div>
            <div className="flex-1 ml-12">
              <div className="space-y-4">
                <p className="text-gray-600">
                  Your organization is maintaining a strong compliance posture. Continue monitoring credentials,
                  training, and form submissions to maintain this score.
                </p>
                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-2xl font-bold text-blue-600">{complianceData.credentialStats.length}</p>
                    <p className="text-sm text-gray-600">Credential Types</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-2xl font-bold text-green-600">{complianceData.formStats.length}</p>
                    <p className="text-sm text-gray-600">Form Types</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <p className="text-2xl font-bold text-purple-600">{complianceData.trainingStats.length}</p>
                    <p className="text-sm text-gray-600">Training Modules</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4">
                    <p className="text-2xl font-bold text-orange-600">{complianceData.stateStats.length}</p>
                    <p className="text-sm text-gray-600">States Served</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {complianceData.alerts.length > 0 && (
          <div className="bg-white rounded-lg shadow p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
              Active Compliance Alerts
            </h2>
            <AlertsList alerts={complianceData.alerts} />
          </div>
        )}

        {/* Credential Compliance */}
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Credential Compliance</h2>
          <CredentialTable credentials={complianceData.credentialStats} />
        </div>

        {/* Form Completion */}
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Form Completion Status</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Form Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Total Required</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Completed</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Pending</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Overdue</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Completion Rate</th>
                </tr>
              </thead>
              <tbody>
                {complianceData.formStats.map((form) => (
                  <tr key={form.formName} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="py-3 px-4 text-gray-900 font-semibold">{form.formName}</td>
                    <td className="py-3 px-4 text-gray-600">{form.totalRequired}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
                        <CheckCircle className="w-4 h-4" />
                        {form.completed}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{form.pending}</td>
                    <td className="py-3 px-4">
                      {form.overdue > 0 && (
                        <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                          <AlertCircle className="w-4 h-4" />
                          {form.overdue}
                        </span>
                      )}
                      {form.overdue === 0 && <span className="text-gray-600">0</span>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              form.completionRate >= 90
                                ? 'bg-green-600'
                                : form.completionRate >= 70
                                ? 'bg-yellow-600'
                                : 'bg-red-600'
                            }`}
                            style={{ width: `${form.completionRate}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-900">{form.completionRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Training Compliance */}
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Training Compliance</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {complianceData.trainingStats.map((training) => (
              <div key={training.module} className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">{training.module}</h3>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Completion Rate</span>
                    <span className="font-bold text-gray-900">{training.completionRate}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        training.completionRate >= 90
                          ? 'bg-green-600'
                          : training.completionRate >= 70
                          ? 'bg-yellow-600'
                          : 'bg-red-600'
                      }`}
                      style={{ width: `${training.completionRate}%` }}
                    />
                  </div>
                </div>
                {training.overdueCount > 0 && (
                  <p className="text-sm text-red-600 mt-3 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {training.overdueCount} overdue
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* State-Specific Compliance */}
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-blue-600" />
            State-Specific Compliance
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {complianceData.stateStats.map((state) => (
              <div key={state.state} className="border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{state.state}</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600">Compliance Score</p>
                    <p className={`text-3xl font-bold ${
                      state.complianceScore >= 90
                        ? 'text-green-600'
                        : state.complianceScore >= 70
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    }`}>
                      {state.complianceScore}%
                    </p>
                  </div>
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-600">Outstanding Issues</p>
                    <p className="text-2xl font-bold text-gray-900">{state.issuesCount}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
