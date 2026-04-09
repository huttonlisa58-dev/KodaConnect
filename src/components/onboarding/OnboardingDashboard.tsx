'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bundle,
  BundlesFilter,
  BundleStatus,
  Company,
  BundlesListResponse,
} from './types';

// Loading skeleton component
function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 bg-gray-200 rounded animate-pulse" />
      ))}
    </div>
  );
}

// Summary card component
function SummaryCard({
  title,
  count,
  icon,
}: {
  title: string;
  count: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{count}</p>
        </div>
        <div className="text-3xl opacity-50">{icon}</div>
      </div>
    </div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: BundleStatus }) {
  const statusConfig = {
    not_started: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      label: 'Not Started',
    },
    in_progress: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      label: 'In Progress',
    },
    pending_review: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      label: 'Pending Review',
    },
    complete: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Complete',
    },
  };

  const config = statusConfig[status];

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

// Progress indicator component
function ProgressIndicator({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {[...Array(Math.min(total, 5))].map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full ${
              i < completed ? 'bg-green-500' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
      <span className="text-sm text-gray-600">
        {completed}/{total} packets
      </span>
    </div>
  );
}

// Actions dropdown component
function ActionsDropdown({ bundle }: { bundle: Bundle }) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const handleView = () => {
    router.push(`/office/onboarding/${bundle.id}`);
    setIsOpen(false);
  };

  const handleReminder = async () => {
    // TODO: Implement send reminder functionality
    console.log('Send reminder for bundle:', bundle.id);
    setIsOpen(false);
  };

  const handleDownload = async () => {
    // TODO: Implement download all PDFs functionality
    console.log('Download all PDFs for bundle:', bundle.id);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
      >
        Actions
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg z-10 border border-gray-200">
          <button
            onClick={handleView}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            View Details
          </button>
          <button
            onClick={handleReminder}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Send Reminder
          </button>
          <button
            onClick={handleDownload}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-200"
          >
            Download All PDFs
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * OnboardingDashboard Component
 * Main HR dashboard for viewing and managing onboarding bundles
 * Displays summary statistics, filters, and a sortable table of bundles
 */
export default function OnboardingDashboard() {
  const router = useRouter();

  // State management
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [totalBundles, setTotalBundles] = useState(0);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Filter state
  const [filters, setFilters] = useState<BundlesFilter>({
    status: 'all',
    page: 1,
    limit: 10,
  });

  // Fetch companies on mount
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch('/api/companies');
        if (!response.ok) throw new Error('Failed to fetch companies');
        const data = await response.json();
        setCompanies(data);
      } catch (err) {
        console.error('Error fetching companies:', err);
      }
    };

    fetchCompanies();
  }, []);

  // Fetch bundles when filters change
  useEffect(() => {
    const fetchBundles = async () => {
      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams();

        if (filters.company_id) query.append('company_id', filters.company_id);
        if (filters.status && filters.status !== 'all') {
          query.append('status', filters.status);
        }
        if (filters.search) query.append('search', filters.search);
        if (filters.date_from) query.append('date_from', filters.date_from);
        if (filters.date_to) query.append('date_to', filters.date_to);

        query.append('page', filters.page.toString());
        query.append('limit', filters.limit.toString());
        query.append('sort_by', sortBy);
        query.append('sort_dir', sortDir);

        const response = await fetch(`/api/onboarding/bundles?${query.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch bundles');

        const data: BundlesListResponse = await response.json();
        setBundles(data.bundles);
        setTotalBundles(data.total);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'An error occurred while fetching bundles'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchBundles();
  }, [filters, sortBy, sortDir]);

  // Calculate summary stats
  const stats = {
    inProgress: bundles.filter((b) => b.status === 'in_progress').length,
    pendingReview: bundles.filter((b) => b.status === 'pending_review').length,
    completedThisMonth: bundles.filter((b) => {
      const created = new Date(b.created_at);
      const now = new Date();
      return (
        b.status === 'complete' &&
        created.getMonth() === now.getMonth() &&
        created.getFullYear() === now.getFullYear()
      );
    }).length,
    totalActive: bundles.length,
  };

  const handleFilterChange = (key: keyof BundlesFilter, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to page 1 when filters change
    }));
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDir('asc');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Onboarding Dashboard
              </h1>
              <p className="text-gray-600 mt-2">
                Manage applicant onboarding bundles and track progress
              </p>
            </div>
            <button
              onClick={() => router.push('/office/onboarding/new')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              + New Onboarding
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <SummaryCard
            title="In Progress"
            count={stats.inProgress}
            icon="🔄"
          />
          <SummaryCard
            title="Pending Review"
            count={stats.pendingReview}
            icon="👀"
          />
          <SummaryCard
            title="Completed This Month"
            count={stats.completedThisMonth}
            icon="✓"
          />
          <SummaryCard title="Total Active" count={stats.totalActive} icon="📋" />
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Company filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company
              </label>
              <select
                value={filters.company_id || ''}
                onChange={(e) =>
                  handleFilterChange('company_id', e.target.value || undefined)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={filters.status || 'all'}
                onChange={(e) =>
                  handleFilterChange('status', e.target.value as BundleStatus | 'all')
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="pending_review">Pending Review</option>
                <option value="complete">Complete</option>
              </select>
            </div>

            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Name
              </label>
              <input
                type="text"
                placeholder="Applicant name..."
                value={filters.search || ''}
                onChange={(e) =>
                  handleFilterChange('search', e.target.value || undefined)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Date from */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                From
              </label>
              <input
                type="date"
                value={filters.date_from || ''}
                onChange={(e) =>
                  handleFilterChange('date_from', e.target.value || undefined)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Date to */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To
              </label>
              <input
                type="date"
                value={filters.date_to || ''}
                onChange={(e) =>
                  handleFilterChange('date_to', e.target.value || undefined)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {/* Bundles table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th
                    onClick={() => handleSort('applicant_name')}
                    className="px-6 py-3 text-left text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-2">
                      Applicant Name
                      {sortBy === 'applicant_name' && (
                        <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('company_name')}
                    className="px-6 py-3 text-left text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-2">
                      Company
                      {sortBy === 'company_name' && (
                        <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('template_name')}
                    className="px-6 py-3 text-left text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-2">
                      Template
                      {sortBy === 'template_name' && (
                        <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                    Progress
                  </th>
                  <th
                    onClick={() => handleSort('created_at')}
                    className="px-6 py-3 text-left text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-2">
                      Created
                      {sortBy === 'created_at' && (
                        <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4">
                      <TableSkeleton />
                    </td>
                  </tr>
                ) : bundles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <p className="text-lg">No onboarding bundles found</p>
                      <p className="text-sm mt-1">
                        Create a new onboarding to get started
                      </p>
                    </td>
                  </tr>
                ) : (
                  bundles.map((bundle) => (
                    <tr
                      key={bundle.id}
                      className="border-b border-gray-200 hover:bg-gray-50"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {bundle.applicant_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {bundle.company_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {bundle.template_name}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <StatusBadge status={bundle.status} />
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <ProgressIndicator
                          completed={bundle.progress.completed_packets}
                          total={bundle.progress.total_packets}
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(bundle.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <ActionsDropdown bundle={bundle} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && bundles.length > 0 && (
            <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {(filters.page - 1) * filters.limit + 1} to{' '}
                {Math.min(filters.page * filters.limit, totalBundles)} of{' '}
                {totalBundles} results
              </p>
              <div className="flex gap-2">
                <button
                  disabled={filters.page === 1}
                  onClick={() => handleFilterChange('page', filters.page - 1)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  disabled={filters.page * filters.limit >= totalBundles}
                  onClick={() => handleFilterChange('page', filters.page + 1)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
