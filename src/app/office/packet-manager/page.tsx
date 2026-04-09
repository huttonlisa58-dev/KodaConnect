'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  FileText,
  Upload,
  Calendar,
  AlertCircle,
  Package,
  Archive,
  Edit,
} from 'lucide-react';

interface Packet {
  id: string;
  name: string;
  description?: string;
  company: string;
  status: 'draft' | 'published' | 'archived';
  sub_form_count: number;
  created_at: string;
  master_form_id?: string;
}

export default function PacketManagerPage() {
  const router = useRouter();
  const [packets, setPackets] = useState<Packet[]>([]);
  const [filteredPackets, setFilteredPackets] = useState<Packet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'archived'>('all');
  const [companies, setCompanies] = useState<string[]>([]);

  useEffect(() => {
    // Session check
    const officeUser = localStorage.getItem('officeUser');
    if (!officeUser) {
      router.push('/office/login');
      return;
    }

    loadPackets();
  }, [router]);

  useEffect(() => {
    filterPackets();
  }, [packets, searchTerm, filterCompany, statusFilter]);

  async function loadPackets() {
    setLoading(true);
    try {
      const response = await fetch('/api/packets');
      if (!response.ok) throw new Error('Failed to load packets');

      const data = await response.json();
      const packetsList = data.packets || [];
      setPackets(packetsList);

      // Extract unique companies
      const uniqueCompanies = [...new Set(packetsList.map((p: Packet) => p.company))].sort();
      setCompanies(uniqueCompanies as string[]);
    } catch (error) {
      console.error('Failed to load packets:', error);
    } finally {
      setLoading(false);
    }
  }

  function filterPackets() {
    let filtered = [...packets];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (packet) =>
          packet.name.toLowerCase().includes(term) ||
          packet.company.toLowerCase().includes(term) ||
          packet.description?.toLowerCase().includes(term)
      );
    }

    if (filterCompany) {
      filtered = filtered.filter((packet) => packet.company === filterCompany);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((packet) => packet.status === statusFilter);
    }

    setFilteredPackets(filtered);
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-yellow-100 text-yellow-800',
      published: 'bg-green-100 text-green-800',
      archived: 'bg-gray-100 text-gray-800',
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      draft: 'Draft',
      published: 'Published',
      archived: 'Archived',
    };
    return labels[status as keyof typeof labels] || status;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Packet Manager</h1>
            <p className="text-sm text-gray-500">Manage form packets and sub-forms</p>
          </div>
          <Link
            href="/office/packet-manager/import"
            className="bg-teal-600 text-white px-6 py-2.5 rounded-lg hover:bg-teal-700 flex items-center gap-2 font-medium transition-colors"
          >
            <Upload className="w-5 h-5" />
            Import PDF Packet
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search packets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div>
            <select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="">All Companies</option>
              {companies.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="text-right text-sm text-gray-500 py-2.5">
            {filteredPackets.length} packet{filteredPackets.length !== 1 ? 's' : ''} found
          </div>
        </div>

        {/* Packets Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading packets...</p>
          </div>
        ) : filteredPackets.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 py-12 text-center">
            <Package className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No packets found</h3>
            <p className="text-gray-600 mb-6">
              {searchTerm || filterCompany || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Get started by importing a PDF packet'}
            </p>
            {!searchTerm && !filterCompany && statusFilter === 'all' && (
              <Link
                href="/office/packet-manager/import"
                className="bg-teal-600 text-white px-6 py-2.5 rounded-lg hover:bg-teal-700 inline-flex items-center gap-2 font-medium"
              >
                <Upload className="w-5 h-5" />
                Import Packet
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPackets.map((packet) => (
              <div
                key={packet.id}
                className="bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  {/* Header with status badge */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{packet.name}</h3>
                      <p className="text-sm text-gray-500">{packet.company}</p>
                    </div>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ml-2 ${getStatusBadge(packet.status)}`}>
                      {getStatusLabel(packet.status)}
                    </span>
                  </div>

                  {/* Description */}
                  {packet.description && (
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{packet.description}</p>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 mb-6 py-4 border-y">
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide">Sub-forms</div>
                      <div className="text-2xl font-bold text-gray-900">{packet.sub_form_count}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide">Created</div>
                      <div className="text-sm text-gray-900 font-medium">{formatDate(packet.created_at)}</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Link
                      href={`/office/packet-manager/${packet.id}`}
                      className="flex-1 bg-teal-50 text-teal-700 px-4 py-2.5 rounded-lg hover:bg-teal-100 font-medium text-center transition-colors flex items-center justify-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      View Details
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
