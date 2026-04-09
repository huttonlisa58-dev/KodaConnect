'use client';

/**
 * KodaConnect Dashboard — Real Data
 * Shows live stats from: companies, office_users, form_definitions, form_packets, form_submissions
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Building2,
  Users,
  FileText,
  MessageSquare,
  Settings,
  FileCheck,
  AlertCircle,
  MoreHorizontal,
  LogIn,
  Plus,
  Download,
} from 'lucide-react';
import { BrandedHeader } from '@/components/BrandedHeader';
import { useSession } from '@/components/SessionProvider';

interface DashboardData {
  companies: { total: number; active: number };
  users: {
    total: number;
    active: number;
    by_role: { super_admin: number; admin: number; staff: number };
  };
  forms: { total: number; published: number; draft: number; archived: number };
  packets: { total: number; published: number };
  submissions: {
    total: number;
    this_month: number;
    by_status: Record<string, number>;
  };
  company_breakdown: Array<{
    id: string;
    name: string;
    form_count: number;
    user_count: number;
  }>;
  recent_forms: Array<{
    id: string;
    name: string;
    status: string;
    company_id: string;
    updated_at: string;
  }>;
  recent_submissions: Array<{
    id: string;
    form_id: string;
    status: string;
    created_at: string;
    submitted_at: string | null;
  }>;
  recent_activity: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: string;
  }>;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      router.push('/office/login');
      return;
    }
    loadStats();
  }, [user, sessionLoading, router]);

  async function loadStats() {
    try {
      setLoading(true);
      setError(null);
      // Send user identity so the API can scope stats by role/company
      const headers: Record<string, string> = {};
      if (user?.email) headers['x-user-email'] = user.email;
      if (user?.id) headers['x-user-id'] = user.id;
      const response = await fetch('/api/dashboard/stats', { headers });
      if (!response.ok) throw new Error('Failed to load dashboard stats');
      const data = await response.json();
      // Defensive: ensure response has expected shape (guards against old API still serving)
      if (!data.companies || !data.users || !data.forms) {
        throw new Error('Dashboard API returned unexpected format. Please redeploy all files and try again.');
      }
      setStats(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const isSuperAdmin = user?.is_super_admin || user?.role === 'super_admin';

  return (
    <div className="min-h-screen bg-gray-50">
      <BrandedHeader title="Dashboard" />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome + Refresh */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Welcome back, {user?.name || user?.full_name || 'Admin'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {isSuperAdmin ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : 'Staff'} &middot; {isSuperAdmin ? "Here's what's happening across KodaConnect" : "Here's what's happening in your companies"}
            </p>
          </div>
          <button
            onClick={loadStats}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {stats && (
          <>
            {/* ─── Stat Cards Row ──────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
              <StatCard
                icon={<Building2 className="w-5 h-5" />}
                label="Companies"
                value={stats.companies.active}
                sub={`${stats.companies.total} total`}
                color="teal"
                onClick={() => router.push('/office/companies')}
              />
              <StatCard
                icon={<Users className="w-5 h-5" />}
                label="Office Users"
                value={stats.users.active}
                sub={`${stats.users.total} total`}
                color="blue"
                onClick={() => router.push('/office/users')}
              />
              <StatCard
                icon={<FileText className="w-5 h-5" />}
                label="Form Definitions"
                value={stats.forms.total}
                sub={`${stats.forms.published} published`}
                color="green"
                onClick={() => router.push('/office/form-manager')}
              />
              <StatCard
                icon={<FileCheck className="w-5 h-5" />}
                label="Form Packets"
                value={stats.packets.total}
                sub={`${stats.packets.published} published`}
                color="purple"
              />
              <StatCard
                icon={<MessageSquare className="w-5 h-5" />}
                label="Submissions"
                value={stats.submissions.total}
                sub={`${stats.submissions.this_month} this month`}
                color="orange"
              />
            </div>

            {/* ─── Main Content Grid ───────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

              {/* Forms Overview (left 2 cols) */}
              <div className="lg:col-span-2 space-y-6">

                {/* Form Status Breakdown */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Form Definitions Overview</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <StatusPill
                      icon={<FileCheck className="w-4 h-4 text-green-600" />}
                      label="Published"
                      count={stats.forms.published}
                      bg="bg-green-50"
                      text="text-green-700"
                    />
                    <StatusPill
                      icon={<FileText className="w-4 h-4 text-yellow-600" />}
                      label="Draft"
                      count={stats.forms.draft}
                      bg="bg-yellow-50"
                      text="text-yellow-700"
                    />
                    <StatusPill
                      icon={<MoreHorizontal className="w-4 h-4 text-gray-500" />}
                      label="Archived"
                      count={stats.forms.archived}
                      bg="bg-gray-50"
                      text="text-gray-600"
                    />
                  </div>
                </div>

                {/* Submission Status Breakdown */}
                {stats.submissions.total > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Submissions by Status</h3>
                    <div className="space-y-3">
                      {Object.entries(stats.submissions.by_status).map(([status, count]) => {
                        const total = stats.submissions.total;
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                          <div key={status}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-700 capitalize">
                                {status.replace(/_/g, ' ')}
                              </span>
                              <span className="text-sm text-gray-500">
                                {count} ({pct}%)
                              </span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div
                                className="h-2 rounded-full bg-teal-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Company Breakdown Table */}
                {stats.company_breakdown.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Companies Overview</h3>
                      <button
                        onClick={() => router.push('/office/companies')}
                        className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1"
                      >
                        Manage &rarr;
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left py-2 pr-4 font-medium text-gray-500">Company</th>
                            <th className="text-center py-2 px-4 font-medium text-gray-500">Forms</th>
                            <th className="text-center py-2 pl-4 font-medium text-gray-500">Users</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.company_breakdown.map((c) => (
                            <tr key={c.id} className="border-b border-gray-50">
                              <td className="py-2.5 pr-4 font-medium text-gray-900">{c.name}</td>
                              <td className="py-2.5 px-4 text-center text-gray-600">{c.form_count}</td>
                              <td className="py-2.5 pl-4 text-center text-gray-600">{c.user_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Sidebar */}
              <div className="space-y-6">

                {/* Quick Actions */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                  <div className="space-y-2">
                    <QuickAction
                      label="Form Manager"
                      desc="Manage & import forms"
                      onClick={() => router.push('/office/form-manager')}
                      color="bg-teal-50 text-teal-700 hover:bg-teal-100"
                    />
                    {isSuperAdmin && (
                      <QuickAction
                        label="Companies"
                        desc="Add & manage companies"
                        onClick={() => router.push('/office/companies')}
                        color="bg-blue-50 text-blue-700 hover:bg-blue-100"
                      />
                    )}
                    <QuickAction
                      label="Users"
                      desc="Manage office users"
                      onClick={() => router.push('/office/users')}
                      color="bg-purple-50 text-purple-700 hover:bg-purple-100"
                    />
                    <QuickAction
                      label="Messages"
                      desc="Send SMS to caregivers"
                      onClick={() => router.push('/office/messages')}
                      color="bg-orange-50 text-orange-700 hover:bg-orange-100"
                    />
                  </div>
                </div>

                {/* Recently Updated Forms */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Recently Updated Forms</h3>
                  {stats.recent_forms.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">No forms yet</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.recent_forms.map((form) => (
                        <div key={form.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                          <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">{form.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                form.status === 'published'
                                  ? 'bg-green-100 text-green-700'
                                  : form.status === 'draft'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {form.status}
                              </span>
                              <span className="text-xs text-gray-400">
                                {formatRelativeTime(form.updated_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Activity */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
                  {stats.recent_activity.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">No activity recorded yet</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.recent_activity.map((activity, i) => (
                        <div key={activity.id + '-' + i} className="flex items-start gap-3">
                          <div className="mt-1">
                            <LogIn className="w-3.5 h-3.5 text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-700">{activity.description}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatRelativeTime(activity.timestamp)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Sub Components ──────────────────────────────────────────────── */

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  color: 'teal' | 'blue' | 'green' | 'purple' | 'orange';
  onClick?: () => void;
}) {
  const colorMap = {
    teal: 'bg-teal-100 text-teal-600',
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600',
  };

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border p-5 ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      } transition-shadow`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`rounded-lg p-2 ${colorMap[color]}`}>{icon}</div>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function StatusPill({
  icon,
  label,
  count,
  bg,
  text,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  bg: string;
  text: string;
}) {
  return (
    <div className={`${bg} rounded-lg p-4 text-center`}>
      <div className="flex items-center justify-center gap-2 mb-2">
        {icon}
        <span className={`text-sm font-medium ${text}`}>{label}</span>
      </div>
      <p className={`text-2xl font-bold ${text}`}>{count}</p>
    </div>
  );
}

function QuickAction({
  label,
  desc,
  onClick,
  color,
}: {
  label: string;
  desc: string;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${color}`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="block text-xs opacity-75 mt-0.5">{desc}</span>
    </button>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
