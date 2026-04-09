'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Search, Filter, Loader2, Lock, UserPlus } from 'lucide-react'
import { FormSubmission, getStatusColor } from '@/lib/submissions'
import { SubmissionTable } from '@/components/submissions/SubmissionTable'
import { getOfficeUser, type OfficeUser } from '@/lib/auth'
import CreateForClientModal from '@/components/office/CreateForClientModal'

interface SubmissionsResponse {
  submissions: FormSubmission[]
  total: number
  page: number
  pageSize: number
  counts: {
    submitted: number
    finalized: number
    approved?: number
    rejected?: number
  }
}

interface FormData {
  name: string
  metadata?: { workflow?: string; [key: string]: any }
}

type StatusFilter = 'all' | 'submitted' | 'finalized'

/** Build auth headers from the current office user for API calls */
function getAuthHeaders(user: OfficeUser | null): Record<string, string> {
  const headers: Record<string, string> = {}
  if (user?.email) headers['x-user-email'] = user.email
  if (user?.id) headers['x-user-id'] = user.id
  return headers
}

export default function FormSubmissionsPage() {
  const params = useParams()
  const router = useRouter()
  const formId = params.id as string

  const [currentUser, setCurrentUser] = useState<OfficeUser | null>(null)
  const [formName, setFormName] = useState<string>('')
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [counts, setCounts] = useState({ submitted: 0, finalized: 0 })
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForClient, setShowCreateForClient] = useState(false)
  const [isStaffInitiated, setIsStaffInitiated] = useState(false)

  const pageSize = 20

  // Get current user
  useEffect(() => {
    setCurrentUser(getOfficeUser())
  }, [])

  // Fetch form name
  useEffect(() => {
    const fetchFormName = async () => {
      try {
        const res = await fetch(`/api/forms/${formId}`)
        if (!res.ok) throw new Error('Failed to fetch form')
        const data = await res.json()
        // API returns { form: {...} } — extract form object
        const formData = data.form || data
        setFormName(formData.form_name || formData.name || '')
        // Check if this form uses staff-initiated workflow
        if (formData.metadata?.workflow === 'staff_initiated') {
          setIsStaffInitiated(true)
        }
      } catch (err) {
        setError('Failed to load form details')
        console.error(err)
      }
    }

    if (formId) {
      fetchFormName()
    }
  }, [formId])

  // Fetch submissions — wait for currentUser to be loaded before fetching
  useEffect(() => {
    if (!currentUser) return

    const fetchSubmissions = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          status: statusFilter !== 'all' ? statusFilter : '',
          search: searchQuery,
          page: page.toString(),
          pageSize: pageSize.toString(),
        })

        const res = await fetch(`/api/forms/${formId}/submissions?${params}`, {
          headers: getAuthHeaders(currentUser),
        })
        if (!res.ok) throw new Error('Failed to fetch submissions')

        const data: SubmissionsResponse = await res.json()
        setSubmissions(data.submissions)
        // Map counts — backend may return approved/rejected for old data
        setCounts({
          submitted: data.counts.submitted || 0,
          finalized: (data.counts.finalized || 0) + (data.counts.approved || 0),
        })
        setTotal(data.total)
      } catch (err) {
        setError('Failed to load submissions')
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    if (formId) {
      fetchSubmissions()
    }
  }, [formId, statusFilter, searchQuery, page, currentUser])

  const handleRowClick = (submissionId: string) => {
    router.push(`/office/form-manager/${formId}/submissions/${submissionId}`)
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setPage(1)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
            <Link
              href={`/office/form-manager/${formId}`}
              className="flex items-center gap-2 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Form
            </Link>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">
              Submissions for {formName || 'Loading...'}
            </h1>
            {isStaffInitiated && (
              <button
                onClick={() => setShowCreateForClient(true)}
                className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm"
              >
                <UserPlus className="h-4 w-4" />
                Create for Client
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                <p className="text-sm font-medium text-gray-600 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  Finalized
                </p>
                <p className="mt-1 text-3xl font-bold text-teal-600">
                  {counts.finalized}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-teal-100"></div>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex flex-1 gap-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search submissions..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as StatusFilter)
                  setPage(1)
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="all">All Status</option>
                <option value="submitted">Submitted</option>
                <option value="finalized">Finalized</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
            <p className="text-gray-600">
              {searchQuery || statusFilter !== 'all'
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
                showFormName={false}
                isLoading={false}
              />
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Showing {(page - 1) * pageSize + 1} to{' '}
                  {Math.min(page * pageSize, total)} of {total} submissions
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
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
              </div>
            )}
          </>
        )}
      </div>

      {/* Create for Client Modal */}
      {showCreateForClient && (
        <CreateForClientModal
          formId={formId}
          formName={formName}
          onClose={() => setShowCreateForClient(false)}
          onCreated={(submissionId, phone) => {
            // Refresh submissions list after creation
            setPage(1)
          }}
          staffUser={currentUser ? { id: currentUser.id, email: currentUser.email } : null}
        />
      )}
    </div>
  )
}
