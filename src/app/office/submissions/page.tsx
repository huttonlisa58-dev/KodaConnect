'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { getOfficeUser, canAccessCompany, type OfficeUser } from '@/lib/auth'
import { Search, Filter, Loader2, Download, Calendar, Building2, Users, FileText, ChevronRight } from 'lucide-react'
import { FormSubmission } from '@/lib/submissions'
import { SubmissionTable } from '@/components/submissions/SubmissionTable'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubmissionsResponse {
  submissions: FormSubmission[]
  total: number
  page: number
  pageSize: number
  counts: {
    total: number
    draft: number
    submitted: number
    approved: number
    rejected: number
  }
}

interface FormOption {
  id: string
  name: string
  company_id?: string
}

interface CompanyOption {
  id: string
  name: string
  slug: string
  chw_mode?: boolean
}

type StatusFilter = 'all' | 'draft' | 'submitted' | 'approved' | 'rejected'
type ViewMode = 'individual' | 'grouped'

interface GroupedCaregiver {
  name: string
  phone: string
  email: string | null
  lastUpdated: string
  completedCount: number
  totalForms: number
  formStatuses: Record<string, {
    submission_id: string
    status: string
    form_name: string
    sort_order: number
  }>
  submissionIds: string[]
}

interface GroupedResponse {
  groups: GroupedCaregiver[]
  total: number
  page: number
  pageSize: number
  templates: Array<{ id: string; name: string; company_id: string }>
  activeTemplateId?: string
  templateFormIds?: string[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build auth headers from the current office user for API calls */
function getAuthHeaders(user: OfficeUser | null): Record<string, string> {
  const headers: Record<string, string> = {}
  if (user?.email) headers['x-user-email'] = user.email
  if (user?.id) headers['x-user-id'] = user.id
  return headers
}

// ─── Grouped Submissions Table ───────────────────────────────────────────────

function GroupedSubmissionTable({
  groups,
  onRowClick,
  isLoading,
}: {
  groups: GroupedCaregiver[]
  onRowClick: (group: GroupedCaregiver) => void
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="py-12 text-center">
        <Users className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-4 text-gray-600">No grouped submissions found.</p>
      </div>
    )
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-gray-200 bg-gray-50 text-left">
          <th className="px-6 py-3 text-xs font-medium uppercase text-gray-500">Caregiver</th>
          <th className="px-6 py-3 text-xs font-medium uppercase text-gray-500">Phone</th>
          <th className="px-6 py-3 text-xs font-medium uppercase text-gray-500">Onboarding Status</th>
          <th className="px-6 py-3 text-xs font-medium uppercase text-gray-500">Last Updated</th>
          <th className="px-6 py-3 text-xs font-medium uppercase text-gray-500"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {groups.map((group, idx) => {
          const sortedStatuses = Object.entries(group.formStatuses)
            .sort(([, a], [, b]) => a.sort_order - b.sort_order)

          return (
            <tr
              key={`${group.name}-${group.phone}-${idx}`}
              onClick={() => onRowClick(group)}
              className="cursor-pointer hover:bg-blue-50 transition-colors"
            >
              <td className="px-6 py-4">
                <div className="font-medium text-gray-900">{group.name}</div>
                {group.email && (
                  <div className="text-sm text-gray-500">{group.email}</div>
                )}
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {group.phone || '—'}
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">
                    {group.completedCount} of {group.totalForms}
                  </span>
                  <div className="flex gap-1">
                    {sortedStatuses.map(([formId, fs]) => {
                      let color = 'bg-gray-300' // pending
                      if (fs.status === 'submitted') color = 'bg-yellow-400'
                      if (fs.status === 'approved' || fs.status === 'finalized') color = 'bg-green-500'
                      if (fs.status === 'rejected') color = 'bg-red-400'
                      if (fs.status === 'draft') color = 'bg-blue-300'

                      return (
                        <div
                          key={formId}
                          title={`${fs.form_name}: ${fs.status}`}
                          className={`h-3 w-3 rounded-full ${color}`}
                        />
                      )
                    })}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-500">
                {group.lastUpdated
                  ? new Date(group.lastUpdated).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '—'}
              </td>
              <td className="px-6 py-4 text-right">
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function AllSubmissionsPage() {
  const router = useRouter()

  const [currentUser, setCurrentUser] = useState<OfficeUser | null>(null)
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [allForms, setAllForms] = useState<FormOption[]>([])
  const [filteredForms, setFilteredForms] = useState<FormOption[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [counts, setCounts] = useState({
    total: 0,
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
  })

  // Individual mode filters
  const [companyFilter, setCompanyFilter] = useState('all')
  const [formFilter, setFormFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [chwNameFilter, setChwNameFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true)
  const [isLoadingForms, setIsLoadingForms] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // CHW mode detection based on selected company
  const [isChwCompany, setIsChwCompany] = useState(false)

  // ─── View mode toggle ───
  const [viewMode, setViewMode] = useState<ViewMode>('individual')

  // ─── Grouped mode state ───
  const [groupedData, setGroupedData] = useState<GroupedCaregiver[]>([])
  const [groupedTotal, setGroupedTotal] = useState(0)
  const [groupedPage, setGroupedPage] = useState(1)
  const [isLoadingGrouped, setIsLoadingGrouped] = useState(false)
  const [groupedSearch, setGroupedSearch] = useState('')
  const [groupedCompanyFilter, setGroupedCompanyFilter] = useState('all')
  const [groupedTemplates, setGroupedTemplates] = useState<Array<{ id: string; name: string; company_id: string }>>([])
  const [groupedTemplateFilter, setGroupedTemplateFilter] = useState('all')
  const [activeTemplateId, setActiveTemplateId] = useState<string | undefined>()

  // FIX: Changed from constant to state to support page size dropdown (20, 50, 100, All)
  const [pageSize, setPageSize] = useState(20)

  // FIX: Track previous companyFilter so we only reset formFilter when company actually changes,
  // not when allForms updates (which would silently clear the user's form selection)
  const prevCompanyFilterRef = useRef(companyFilter)

  // Page size options for the dropdown
  const pageSizeOptions = [
    { value: 20, label: '20' },
    { value: 50, label: '50' },
    { value: 100, label: '100' },
    { value: 1000, label: 'All' },
  ]

  // Get current user
  useEffect(() => {
    setCurrentUser(getOfficeUser())
  }, [])

  // Fetch companies list (filtered by user's assigned companies)
  useEffect(() => {
    if (!currentUser) return

    const fetchCompanies = async () => {
      const { data } = await getSupabase()
        .from('companies')
        .select('id, name, slug, chw_mode')
        .eq('active', true)
        .order('name')

      if (data) {
        // Filter to only companies the current user can access
        const accessible = data.filter((c: CompanyOption) => canAccessCompany(currentUser, c.id))
        setCompanies(accessible as CompanyOption[])
      }
    }
    fetchCompanies()
  }, [currentUser])

  // Fetch forms list (with auth headers for company-based filtering)
  useEffect(() => {
    if (!currentUser) return

    const fetchForms = async () => {
      setIsLoadingForms(true)
      try {
        const res = await fetch('/api/forms', {
          headers: getAuthHeaders(currentUser),
        })
        if (!res.ok) throw new Error('Failed to fetch forms')

        const data: { forms: FormOption[] } = await res.json()
        setAllForms(data.forms.map(f => ({
          id: (f as any).form_id || f.id,
          name: (f as any).form_name || f.name,
          company_id: (f as any).company_id,
        })))
      } catch (err) {
        console.error('Failed to load forms', err)
        setError('Failed to load forms list')
      } finally {
        setIsLoadingForms(false)
      }
    }

    fetchForms()
  }, [currentUser])

  // Update filtered forms when company or form list changes
  // FIX: Only reset formFilter when the company ACTUALLY changes, not when allForms updates.
  // Previously, allForms updating (e.g. new form imported) would silently reset formFilter to 'all',
  // causing the bulk download to ignore the user's form selection.
  useEffect(() => {
    if (companyFilter === 'all') {
      setFilteredForms(allForms)
      setIsChwCompany(false)
    } else {
      setFilteredForms(allForms.filter(f => f.company_id === companyFilter))
      const selectedCompany = companies.find(c => c.id === companyFilter)
      setIsChwCompany(selectedCompany?.chw_mode === true)
    }
    // Only reset form filter when the company selection actually changed
    if (companyFilter !== prevCompanyFilterRef.current) {
      setFormFilter('all')
      setPage(1)
      prevCompanyFilterRef.current = companyFilter
    }
  }, [companyFilter, allForms, companies])

  // Fetch submissions (individual mode)
  useEffect(() => {
    if (!currentUser || viewMode !== 'individual') return

    const fetchSubmissions = async () => {
      setIsLoadingSubmissions(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          status: statusFilter !== 'all' ? statusFilter : '',
          formId: formFilter !== 'all' ? formFilter : '',
          companyId: companyFilter !== 'all' ? companyFilter : '',
          search: searchQuery,
          chw_name: chwNameFilter,
          date_from: dateFrom,
          date_to: dateTo,
          page: page.toString(),
          pageSize: pageSize.toString(),
        })

        // Remove empty params
        for (const [key, value] of [...params.entries()]) {
          if (!value) params.delete(key)
        }

        const res = await fetch(`/api/submissions?${params}`, {
          headers: getAuthHeaders(currentUser),
        })
        if (!res.ok) throw new Error('Failed to fetch submissions')

        const data: SubmissionsResponse = await res.json()
        setSubmissions(data.submissions)
        setCounts(data.counts)
        setTotal(data.total)
      } catch (err) {
        setError('Failed to load submissions')
        console.error(err)
      } finally {
        setIsLoadingSubmissions(false)
      }
    }

    fetchSubmissions()
  }, [currentUser, viewMode, companyFilter, formFilter, statusFilter, searchQuery, chwNameFilter, dateFrom, dateTo, page, pageSize])

  // Fetch grouped submissions (grouped mode)
  useEffect(() => {
    if (!currentUser || viewMode !== 'grouped') return

    const fetchGrouped = async () => {
      setIsLoadingGrouped(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          page: groupedPage.toString(),
          pageSize: pageSize.toString(),
        })

        if (groupedCompanyFilter !== 'all') {
          params.set('companyId', groupedCompanyFilter)
        }
        if (groupedTemplateFilter !== 'all') {
          params.set('templateId', groupedTemplateFilter)
        }
        if (groupedSearch) {
          params.set('search', groupedSearch)
        }

        const res = await fetch(`/api/submissions/grouped?${params}`, {
          headers: getAuthHeaders(currentUser),
        })
        if (!res.ok) throw new Error('Failed to fetch grouped submissions')

        const data: GroupedResponse = await res.json()
        setGroupedData(data.groups)
        setGroupedTotal(data.total)
        setGroupedTemplates(data.templates || [])
        setActiveTemplateId(data.activeTemplateId)
      } catch (err) {
        setError('Failed to load grouped submissions')
        console.error(err)
      } finally {
        setIsLoadingGrouped(false)
      }
    }

    fetchGrouped()
  }, [currentUser, viewMode, groupedCompanyFilter, groupedTemplateFilter, groupedSearch, groupedPage, pageSize])

  const handleRowClick = (submissionId: string) => {
    const submission = submissions.find((s) => s.submission_id === submissionId)
    if (submission) {
      router.push(
        `/office/form-manager/${submission.form_id}/submissions/${submissionId}`
      )
    }
  }

  const handleGroupedRowClick = (group: GroupedCaregiver) => {
    const params = new URLSearchParams({ name: group.name, phone: group.phone })
    if (activeTemplateId) {
      params.set('templateId', activeTemplateId)
    }
    router.push(`/office/submissions/caregiver?${params}`)
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setPage(1)
  }

  const handleFormFilterChange = (value: string) => {
    setFormFilter(value)
    setPage(1)
  }

  const handleStatusFilterChange = (value: StatusFilter) => {
    setStatusFilter(value)
    setPage(1)
  }

  // Bulk download handler
  // FIX: Send the currently-displayed submission IDs instead of re-applying filters.
  // This guarantees the download matches exactly what the user sees in the table,
  // avoiding filter state mismatches (e.g. formFilter resetting on allForms update).
  async function handleBulkDownload() {
    if (submissions.length === 0) {
      alert('No submissions to download')
      return
    }
    setIsDownloading(true)
    try {
      const response = await fetch('/api/submissions/bulk-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(currentUser),
        },
        body: JSON.stringify({
          submission_ids: submissions.map(s => s.submission_id),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        const details = errorData.details ? `\n${errorData.details}` : ''
        throw new Error((errorData.error || 'Download failed') + details)
      }

      // Download the ZIP file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `submissions_${new Date().toISOString().split('T')[0]}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download PDFs')
    } finally {
      setIsDownloading(false)
    }
  }

  // Helper: remove a submission from local state and update counts
  function removeSubmissionFromState(submissionId: string) {
    const removed = submissions.find(s => s.submission_id === submissionId)
    setSubmissions(prev => prev.filter(s => s.submission_id !== submissionId))
    setTotal(prev => Math.max(0, prev - 1))
    if (removed) {
      const status = removed.status
      setCounts(prev => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
        submitted: status === 'submitted' ? Math.max(0, prev.submitted - 1) : prev.submitted,
        approved: status === 'approved' ? Math.max(0, prev.approved - 1) : prev.approved,
        rejected: status === 'rejected' ? Math.max(0, prev.rejected - 1) : prev.rejected,
      }))
    }
  }

  // Delete submission handler (super_admin only)
  async function handleDeleteSubmission(submissionId: string) {
    if (!confirm('Are you sure you want to permanently delete this submission? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeaders(currentUser),
        },
      })

      if (!res.ok) {
        // Treat 404 as success — submission already deleted
        if (res.status === 404) {
          removeSubmissionFromState(submissionId)
          return
        }
        const text = await res.text()
        const data = text ? JSON.parse(text) : {}
        throw new Error(data.error || 'Failed to delete submission')
      }

      removeSubmissionFromState(submissionId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete submission')
    }
  }

  const isSuperAdmin = currentUser?.role === 'super_admin'
  const totalPages = Math.ceil(total / pageSize)
  const groupedTotalPages = Math.ceil(groupedTotal / pageSize)

  // Show CHW columns if the selected company is CHW mode, OR if any submission has CHW data
  const hasChwData = isChwCompany || submissions.some((s: any) => s.chw_name)

  // Filter templates by company when a grouped company filter is selected
  const filteredGroupedTemplates = groupedCompanyFilter === 'all'
    ? groupedTemplates
    : groupedTemplates.filter(t => t.company_id === groupedCompanyFilter)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">All Submissions</h1>
              <p className="mt-2 text-gray-600">
                View and manage submissions across all forms
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* View Mode Toggle */}
              <div className="flex rounded-lg border border-gray-300 bg-gray-100 p-1">
                <button
                  onClick={() => { setViewMode('individual'); setError(null); }}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === 'individual'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Individual
                </button>
                <button
                  onClick={() => { setViewMode('grouped'); setError(null); }}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === 'grouped'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Users className="h-4 w-4" />
                  By Caregiver
                </button>
              </div>

              {/* Download button - only in individual mode */}
              {viewMode === 'individual' && (
                <button
                  onClick={handleBulkDownload}
                  disabled={isDownloading || total === 0}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {isDownloading ? 'Generating...' : 'Download PDFs'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* INDIVIDUAL VIEW MODE                                             */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {viewMode === 'individual' && (
          <>
            {/* Stats Cards */}
            <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total</p>
                    <p className="mt-1 text-3xl font-bold text-blue-600">
                      {counts.total}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-100"></div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Draft</p>
                    <p className="mt-1 text-3xl font-bold text-gray-600">
                      {counts.draft}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-gray-100"></div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Submitted</p>
                    <p className="mt-1 text-3xl font-bold text-yellow-600">
                      {counts.submitted}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-yellow-100"></div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Approved</p>
                    <p className="mt-1 text-3xl font-bold text-green-600">
                      {counts.approved}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-green-100"></div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Rejected</p>
                    <p className="mt-1 text-3xl font-bold text-red-600">
                      {counts.rejected}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-red-100"></div>
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
              {/* Row 1: Company + Form + Status + Search */}
              <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                {/* Company Filter */}
                <div className="flex items-center gap-2 shrink-0">
                  <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                  <select
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 max-w-[180px]"
                  >
                    <option value="all">All Companies</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Form Filter */}
                <div className="flex items-center gap-2 shrink-0">
                  <Filter className="h-4 w-4 text-gray-400 shrink-0" />
                  <select
                    value={formFilter}
                    onChange={(e) => handleFormFilterChange(e.target.value)}
                    disabled={isLoadingForms}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 disabled:text-gray-500 max-w-[200px]"
                  >
                    <option value="all">All Forms</option>
                    {filteredForms.map((form) => (
                      <option key={form.id} value={form.id}>
                        {form.name}
                      </option>
                    ))}
                  </select>
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) =>
                    handleStatusFilterChange(e.target.value as StatusFilter)
                  }
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 shrink-0"
                >
                  <option value="all">All Status</option>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>

                <div className="relative w-full md:w-48 lg:w-56 shrink-0">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search name or phone..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              {/* Row 2: Date range + CHW name */}
              <div className="flex flex-col gap-4 md:flex-row md:items-center mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="From date"
                  />
                  <span className="text-gray-400 text-sm">to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="To date"
                  />
                </div>

                {/* Show CHW filter when a CHW company is selected */}
                {isChwCompany && (
                  <div className="relative max-w-xs">
                    <input
                      type="text"
                      placeholder="Filter by CHW name..."
                      value={chwNameFilter}
                      onChange={(e) => { setChwNameFilter(e.target.value); setPage(1); }}
                      className="w-full rounded-lg border border-gray-300 bg-white py-2 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                )}

                {(dateFrom || dateTo || chwNameFilter) && (
                  <button
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                      setChwNameFilter('');
                      setPage(1);
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {/* Error State */}
            {error && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Loading State */}
            {isLoadingSubmissions ? (
              <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : submissions.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
                <p className="text-gray-600">
                  {searchQuery || statusFilter !== 'all' || formFilter !== 'all' || companyFilter !== 'all' || dateFrom || dateTo || chwNameFilter
                    ? 'No submissions match your filters.'
                    : 'No submissions yet.'}
                </p>
              </div>
            ) : (
              <>
                {/* Submissions Table */}
                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                  <SubmissionTable
                    submissions={submissions}
                    onRowClick={handleRowClick}
                    onDelete={isSuperAdmin ? handleDeleteSubmission : undefined}
                    showFormName={true}
                    showChwColumns={hasChwData}
                    isLoading={false}
                    forms={filteredForms}
                  />
                </div>

                {/* Pagination */}
                {total > 0 && (
                  <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                      <p className="text-sm text-gray-600">
                        Showing {(page - 1) * pageSize + 1} to{' '}
                        {Math.min(page * pageSize, total)} of {total} submissions
                      </p>
                      <div className="flex items-center gap-2">
                        <label htmlFor="pageSize" className="text-sm text-gray-500">Show:</label>
                        <select
                          id="pageSize"
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value))
                            setPage(1)
                          }}
                          className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {pageSizeOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {totalPages > 1 && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(
                          (p) => (
                            <button
                              key={p}
                              onClick={() => setPage(p)}
                              className={`rounded px-3 py-2 text-sm font-medium ${
                                page === p
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                              }`}
                            >
                              {p}
                            </button>
                          )
                        )}
                      </div>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* GROUPED (BY CAREGIVER) VIEW MODE                                 */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {viewMode === 'grouped' && (
          <>
            {/* Grouped Filter Bar */}
            <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                {/* Company Filter */}
                <div className="flex items-center gap-2 shrink-0">
                  <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                  <select
                    value={groupedCompanyFilter}
                    onChange={(e) => {
                      setGroupedCompanyFilter(e.target.value)
                      setGroupedTemplateFilter('all')
                      setGroupedPage(1)
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 max-w-[180px]"
                  >
                    <option value="all">All Companies</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Template Filter */}
                {filteredGroupedTemplates.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Filter className="h-4 w-4 text-gray-400 shrink-0" />
                    <select
                      value={groupedTemplateFilter}
                      onChange={(e) => {
                        setGroupedTemplateFilter(e.target.value)
                        setGroupedPage(1)
                      }}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 max-w-[250px]"
                    >
                      <option value="all">All Templates</option>
                      {filteredGroupedTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Search */}
                <div className="relative w-full md:w-48 lg:w-56 shrink-0">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search caregiver..."
                    value={groupedSearch}
                    onChange={(e) => { setGroupedSearch(e.target.value); setGroupedPage(1); }}
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
            </div>

            {/* Error State */}
            {error && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Grouped Table */}
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <GroupedSubmissionTable
                groups={groupedData}
                onRowClick={handleGroupedRowClick}
                isLoading={isLoadingGrouped}
              />
            </div>

            {/* Grouped Pagination */}
            {groupedTotal > 0 && (
              <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <p className="text-sm text-gray-600">
                    Showing {(groupedPage - 1) * pageSize + 1} to{' '}
                    {Math.min(groupedPage * pageSize, groupedTotal)} of {groupedTotal} caregivers
                  </p>
                  <div className="flex items-center gap-2">
                    <label htmlFor="groupedPageSize" className="text-sm text-gray-500">Show:</label>
                    <select
                      id="groupedPageSize"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value))
                        setGroupedPage(1)
                      }}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {pageSizeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {groupedTotalPages > 1 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setGroupedPage((p) => Math.max(1, p - 1))}
                    disabled={groupedPage === 1}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(groupedTotalPages, 7) }, (_, i) => i + 1).map(
                      (p) => (
                        <button
                          key={p}
                          onClick={() => setGroupedPage(p)}
                          className={`rounded px-3 py-2 text-sm font-medium ${
                            groupedPage === p
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  </div>
                  <button
                    onClick={() => setGroupedPage((p) => Math.min(groupedTotalPages, p + 1))}
                    disabled={groupedPage === groupedTotalPages}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
