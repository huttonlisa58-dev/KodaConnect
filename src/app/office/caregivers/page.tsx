'use client';

/**
 * Caregivers Management Page
 * List and manage all caregivers with filters and pagination
 */

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Search, Plus, Phone, Mail, Eye, MessageSquare, Send } from 'lucide-react';
import { BrandedHeader } from '@/components/BrandedHeader';
import { useSession } from '@/components/SessionProvider';

interface Caregiver {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  status: 'active' | 'onboarding' | 'inactive';
  areas: string[];
  onboarding_progress: number;
  credentials_status: {
    current: number;
    expiring: number;
    expired: number;
  };
  created_at: string;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

function CaregiversPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: sessionLoading } = useSession();

  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationData | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || '');
  const [areaFilter, setAreaFilter] = useState<string>(searchParams.get('area') || '');
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get('search') || '');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (sessionLoading) return;

    if (!user) {
      router.push('/office/login');
      return;
    }

    loadCaregivers();
  }, [statusFilter, areaFilter, searchQuery, currentPage, user, sessionLoading, router]);

  async function loadCaregivers() {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
      });

      if (statusFilter) params.append('status', statusFilter);
      if (areaFilter) params.append('area', areaFilter);
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`/api/caregivers?${params}`);

      if (!response.ok) {
        throw new Error('Failed to load caregivers');
      }

      const data = await response.json();
      setCaregivers(data.data);
      setPagination(data.pagination);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Caregivers error:', err);
    } finally {
      setLoading(false);
    }
  }

  const getProgressColor = (progress: number) => {
    if (progress > 80) return 'bg-green-500';
    if (progress > 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getCredentialStatusColor = (status: any) => {
    if (status.expired > 0) return 'bg-red-100 text-red-800';
    if (status.expiring > 0) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  const getCredentialStatusText = (status: any) => {
    if (status.expired > 0) return `${status.expired} expired`;
    if (status.expiring > 0) return `${status.expiring} expiring`;
    return 'All current';
  };

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading caregivers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <BrandedHeader title="Caregivers" />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Caregivers</h1>
          <button
            onClick={() => router.push('/office/caregivers/add')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Caregiver
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Name, phone, or email"
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="onboarding">Onboarding</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Area
              </label>
              <select
                value={areaFilter}
                onChange={(e) => {
                  setAreaFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Areas</option>
                <option value="nursing">Nursing</option>
                <option value="personal_care">Personal Care</option>
                <option value="companionship">Companionship</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                &nbsp;
              </label>
              <button
                onClick={() => {
                  setStatusFilter('');
                  setAreaFilter('');
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Areas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Onboarding
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Credentials
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {caregivers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No caregivers found
                    </td>
                  </tr>
                ) : (
                  caregivers.map((caregiver) => (
                    <tr
                      key={caregiver.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/office/caregivers/${caregiver.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{caregiver.full_name}</p>
                          <p className="text-xs text-gray-500">{caregiver.status}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="w-4 h-4" />
                            {caregiver.phone}
                          </div>
                          {caregiver.email && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Mail className="w-4 h-4" />
                              {caregiver.email}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {caregiver.areas.map((area) => (
                            <span key={area} className="inline-block text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mr-1">
                              {area}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${getProgressColor(caregiver.onboarding_progress)}`}
                              style={{ width: `${caregiver.onboarding_progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-600">{caregiver.onboarding_progress}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${getCredentialStatusColor(caregiver.credentials_status)}`}>
                          {getCredentialStatusText(caregiver.credentials_status)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => router.push(`/office/caregivers/${caregiver.id}`)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="View Profile"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => router.push(`/office/messages?caregiver=${caregiver.id}`)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Send Message"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => router.push(`/office/forms/send?caregiver=${caregiver.id}`)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Send Form"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="border-t px-6 py-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 rounded-lg ${
                      page === currentPage
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(Math.min(pagination.pages, currentPage + 1))}
                  disabled={currentPage === pagination.pages}
                  className="px-3 py-1 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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

export default function CaregiversPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <CaregiversPageContent />
    </Suspense>
  );
}
