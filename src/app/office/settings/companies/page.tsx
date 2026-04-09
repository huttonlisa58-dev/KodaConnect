'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  Plus,
  Edit2,
  Power,
  Loader2,
  AlertCircle,
  CheckCircle,
  Palette,
  X,
} from 'lucide-react'
import { getOfficeUser, type OfficeUser } from '@/lib/auth'

interface Company {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  accent_color: string
  active: boolean
  created_at: string
  updated_at: string
}

interface FormData {
  name: string
  slug: string
  primary_color: string
  logo_url: string
}

export default function CompaniesPage() {
  const router = useRouter()
  const [user, setUser] = useState<OfficeUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<Company[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    slug: '',
    primary_color: '#0d9488',
    logo_url: '',
  })
  const [formLoading, setFormLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)

  // Auth check
  useEffect(() => {
    async function checkAuth() {
      try {
        const officeUser = await getOfficeUser()
        if (!officeUser) {
          router.push('/office/login')
          return
        }
        setUser(officeUser)
        await fetchCompanies(officeUser.id)
      } catch (err) {
        console.error('Auth check failed:', err)
        router.push('/office/login')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  const fetchCompanies = async (userId: string) => {
    try {
      setError(null)
      const response = await fetch('/api/companies/manage', {
        headers: {
          'x-office-user-id': userId,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch companies')
      }

      const data = await response.json()
      setCompanies(data.companies || [])
    } catch (err) {
      console.error('Error fetching companies:', err)
      setError('Failed to load companies')
    }
  }

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: generateSlug(name),
    })
  }

  const handleOpenModal = (company?: Company) => {
    if (company) {
      setEditingCompanyId(company.id)
      setFormData({
        name: company.name,
        slug: company.slug,
        primary_color: company.primary_color,
        logo_url: company.logo_url || '',
      })
    } else {
      setEditingCompanyId(null)
      setFormData({
        name: '',
        slug: '',
        primary_color: '#0d9488',
        logo_url: '',
      })
    }
    setError(null)
    setSuccess(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingCompanyId(null)
    setFormData({
      name: '',
      slug: '',
      primary_color: '#0d9488',
      logo_url: '',
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      setError('Company name is required')
      return
    }

    if (!formData.slug.trim()) {
      setError('Slug is required')
      return
    }

    setFormLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const url = '/api/companies/manage'
      const method = editingCompanyId ? 'PUT' : 'POST'

      const body = editingCompanyId
        ? {
            id: editingCompanyId,
            name: formData.name,
            slug: formData.slug,
            primary_color: formData.primary_color,
            logo_url: formData.logo_url || null,
          }
        : {
            name: formData.name,
            primary_color: formData.primary_color,
            logo_url: formData.logo_url || null,
          }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-office-user-id': user!.id,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save company')
      }

      const data = await response.json()

      if (editingCompanyId) {
        setCompanies(companies.map(c => c.id === editingCompanyId ? data.company : c))
        setSuccess('Company updated successfully')
      } else {
        setCompanies([data.company, ...companies])
        setSuccess('Company created successfully')
      }

      setTimeout(() => {
        handleCloseModal()
      }, 1000)
    } catch (err) {
      console.error('Error saving company:', err)
      setError(err instanceof Error ? err.message : 'Failed to save company')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeactivate = async (companyId: string, currentActive: boolean) => {
    if (!confirm(`Are you sure you want to ${currentActive ? 'deactivate' : 'reactivate'} this company?`)) {
      return
    }

    setDeactivatingId(companyId)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/companies/manage', {
        method: currentActive ? 'DELETE' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-office-user-id': user!.id,
        },
        body: JSON.stringify({ id: companyId }),
      })

      if (!response.ok) {
        throw new Error('Failed to update company status')
      }

      const data = await response.json()
      setCompanies(companies.map(c => c.id === companyId ? data.company : c))
      setSuccess(`Company ${currentActive ? 'deactivated' : 'reactivated'} successfully`)
    } catch (err) {
      console.error('Error toggling company:', err)
      setError(err instanceof Error ? err.message : 'Failed to update company')
    } finally {
      setDeactivatingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading companies...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Building2 className="w-8 h-8 text-teal-600" />
                Company Management
              </h1>
              <p className="text-gray-600 mt-1">Manage your KodaConnect companies and branding</p>
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
            >
              <Plus className="w-5 h-5" />
              Add Company
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-green-700">{success}</p>
          </div>
        )}

        {/* Companies Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {companies.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No companies yet</p>
              <button
                onClick={() => handleOpenModal()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                Create Your First Company
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Slug
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Brand Color
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {company.logo_url ? (
                            <img
                              src={company.logo_url}
                              alt={company.name}
                              className="w-10 h-10 rounded object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{company.name}</p>
                            <p className="text-xs text-gray-500">
                              Created {new Date(company.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <code className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-mono">
                          {company.slug}
                        </code>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded border-2 border-gray-200"
                            style={{ backgroundColor: company.primary_color }}
                          />
                          <code className="text-sm text-gray-600 font-mono">
                            {company.primary_color}
                          </code>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${
                            company.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              company.active ? 'bg-green-600' : 'bg-gray-400'
                            }`}
                          />
                          {company.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenModal(company)}
                            className="p-2 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            title="Edit company"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeactivate(company.id, company.active)}
                            disabled={deactivatingId === company.id}
                            className={`p-2 rounded-lg transition-colors ${
                              company.active
                                ? 'text-gray-600 hover:text-red-600 hover:bg-red-50'
                                : 'text-gray-600 hover:text-green-600 hover:bg-green-50'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title={company.active ? 'Deactivate company' : 'Reactivate company'}
                          >
                            {deactivatingId === company.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Power className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingCompanyId ? 'Edit Company' : 'New Company'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {success && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-700">{success}</p>
                </div>
              )}

              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  Company Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Enter company name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  URL Slug
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="auto-generated-from-name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Unique identifier used in URLs and APIs
                </p>
              </div>

              {/* Primary Color */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-teal-600" />
                  Primary Brand Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.primary_color}
                    onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                    className="w-12 h-10 rounded-lg cursor-pointer border border-gray-300"
                  />
                  <input
                    type="text"
                    value={formData.primary_color}
                    onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                    placeholder="#0d9488"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all font-mono text-sm"
                  />
                </div>
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  Logo URL
                </label>
                <input
                  type="url"
                  value={formData.logo_url}
                  onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
                />
                {formData.logo_url && (
                  <div className="mt-3">
                    <img
                      src={formData.logo_url}
                      alt="Logo preview"
                      className="w-16 h-16 rounded object-cover border border-gray-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  disabled={formLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {formLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingCompanyId ? 'Update Company' : 'Create Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
