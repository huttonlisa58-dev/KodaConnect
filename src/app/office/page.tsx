'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { getOfficeUser, clearOfficeUser, canManageUsers, getRoleLabel, getRoleColor, type OfficeUser } from '@/lib/auth';
import {
  FileText,
  Users,
  Clock,
  CheckCircle,
  ChevronRight,
  Send,
  X,
  Loader2,
  Phone,
  LogOut,
  Settings,
  Shield,
  BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import CompanySelector from '@/components/office/CompanySelector';
import { getCompanyInitials, getLogoUrl, getInitialsColor } from '@/lib/logo-utils';

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

interface DocumentTemplate {
  id: string;
  name: string;
  slug: string;
  company_id: string | null;
  is_active: boolean;
  is_fillable_pdf: boolean;
}

interface FormDef {
  form_id: string;
  form_name: string;
  company_id: string;
  status: string;
}

interface Submission {
  id: string;
  status: string;
  company_id: string | null;
  created_at: string;
  applicant?: {
    full_name: string;
    phone: string;
  };
  template?: {
    name: string;
  };
}

interface NewSubmission {
  submission_id: string;
  form_id: string;
  applicant_id: string;
  status: string;
  submitted_at: string;
  created_at: string;
  applicants?: {
    full_name: string;
    phone: string;
  };
  form_definitions?: {
    form_name: string;
  };
}

export default function OfficeDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<OfficeUser | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [formDefinitions, setFormDefinitions] = useState<FormDef[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<Submission[]>([]);
  const [newSubmissions, setNewSubmissions] = useState<NewSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  // Send Form Link Modal State
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendingForm, setSendingForm] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [applicantName, setApplicantName] = useState('');

  useEffect(() => {
    const user = getOfficeUser();
    setCurrentUser(user);

    if (!user) {
      router.push('/office/login');
      return;
    }

    loadData(user);
  }, []);

  // Auto-select first company when data loads
  useEffect(() => {
    if (companies.length > 0 && !selectedCompany) {
      setSelectedCompany(companies[0].id);
    }
  }, [companies]);

  async function loadData(user: OfficeUser) {
    setLoading(true);

    // Load companies
    let companiesQuery = getSupabase()
      .from('companies')
      .select('*')
      .eq('active', true)
      .order('name');

    if (user.role !== 'super_admin' && user.company_id) {
      companiesQuery = companiesQuery.eq('id', user.company_id);
    }

    const { data: companiesData } = await companiesQuery;
    if (companiesData) setCompanies(companiesData);

    // Load templates (old system)
    let templatesQuery = getSupabase()
      .from('document_templates')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (user.role !== 'super_admin' && user.company_id) {
      templatesQuery = templatesQuery.eq('company_id', user.company_id);
    }

    const { data: templatesData } = await templatesQuery;
    if (templatesData) setTemplates(templatesData);

    // Load form definitions (new system - published only)
    let formDefsQuery = getSupabase()
      .from('form_definitions')
      .select('form_id, form_name, company_id, status')
      .eq('status', 'published')
      .order('form_name');

    if (user.role !== 'super_admin' && user.company_id) {
      formDefsQuery = formDefsQuery.eq('company_id', user.company_id);
    }

    const { data: formDefsData } = await formDefsQuery;
    if (formDefsData) setFormDefinitions(formDefsData);

    // Load recent submissions (old system)
    let submissionsQuery = getSupabase()
      .from('submissions')
      .select(`
        *,
        applicant:applicants(full_name, phone),
        template:document_templates(name)
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (user.role !== 'super_admin' && user.company_id) {
      submissionsQuery = submissionsQuery.eq('company_id', user.company_id);
    }

    const { data: submissionsData } = await submissionsQuery;
    if (submissionsData) setRecentSubmissions(submissionsData as unknown as Submission[]);

    // Load recent submissions (new system)
    const { data: newSubmissionsData } = await getSupabase()
      .from('form_submissions')
      .select(`
        submission_id,
        form_id,
        applicant_id,
        status,
        submitted_at,
        created_at,
        applicants:applicant_id(full_name, phone),
        form_definitions:form_id(form_name)
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (newSubmissionsData) {
      let filtered = newSubmissionsData as unknown as NewSubmission[];
      if (user.role !== 'super_admin' && user.company_id && formDefsData) {
        filtered = filtered.filter(sub => {
          const fd = formDefsData.find(f => f.form_id === sub.form_id);
          return fd && fd.company_id === user.company_id;
        });
      }
      setNewSubmissions(filtered);
    }

    setLoading(false);
  }

  function handleLogout() {
    clearOfficeUser();
    router.push('/office/login');
  }

  async function sendFormLink() {
    if (!selectedTemplateId || !applicantPhone) {
      alert('Please select a document and enter phone number');
      return;
    }

    setSendingForm(true);

    try {
      const template = templates.find(t => t.id === selectedTemplateId);
      const company = companies.find(c => c.id === template?.company_id);

      const { data: applicant, error: applicantError } = await getSupabase()
        .from('applicants')
        .insert({
          phone: applicantPhone,
          full_name: applicantName || 'Unknown',
        })
        .select()
        .single();

      if (applicantError) throw applicantError;

      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const { error: tokenError } = await getSupabase()
        .from('access_tokens')
        .insert({
          applicant_id: applicant.id,
          template_id: selectedTemplateId,
          token,
          expires_at: expiresAt.toISOString(),
        });

      if (tokenError) throw tokenError;

      const formUrl = company && template
        ? `${window.location.origin}/apply/${company.slug}/${template.slug}`
        : null;

      const response = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: applicantPhone, token }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to send SMS');

      const message = formUrl
        ? `OTP sent to ${applicantPhone}!\n\nForm Link:\n${formUrl}`
        : `OTP sent to ${applicantPhone}!`;
      alert(message);

      if (formUrl) navigator.clipboard.writeText(formUrl).catch(() => {});

      setShowSendModal(false);
      setSelectedTemplateId('');
      setApplicantPhone('');
      setApplicantName('');

      if (currentUser) loadData(currentUser);
    } catch (error) {
      console.error('Send form error:', error);
      alert(`Failed to send form: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSendingForm(false);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-teal-100 text-teal-800';
      case 'finalized': return 'bg-teal-100 text-teal-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <FileText className="w-3.5 h-3.5" />;
      case 'submitted': return <Clock className="w-3.5 h-3.5" />;
      case 'approved': return <CheckCircle className="w-3.5 h-3.5" />;
      case 'finalized': return <CheckCircle className="w-3.5 h-3.5" />;
      default: return <FileText className="w-3.5 h-3.5" />;
    }
  };

  // Filter by selected company
  const filteredSubmissions = selectedCompany
    ? recentSubmissions.filter(s => s.company_id === selectedCompany)
    : recentSubmissions;

  const filteredNewSubmissions = selectedCompany
    ? newSubmissions.filter(ns => {
        const fd = formDefinitions.find(f => f.form_id === ns.form_id);
        return fd && fd.company_id === selectedCompany;
      })
    : newSubmissions;

  // Combined stats from filtered submissions
  const allForStats = [...filteredSubmissions, ...filteredNewSubmissions.map(ns => ({ status: ns.status }))];
  const draftCount = allForStats.filter(s => s.status === 'draft').length;
  const pendingCount = allForStats.filter(s => s.status === 'submitted').length;
  const finalizedCount = allForStats.filter(s => s.status === 'approved' || s.status === 'finalized').length;
  const totalCount = allForStats.length;

  // Merge recent submissions from both systems, sorted by date
  const mergedRecent: Array<{
    key: string;
    name: string;
    phone: string;
    formName: string;
    date: string;
    status: string;
    href: string;
  }> = [
    ...filteredSubmissions.map(s => ({
      key: `old-${s.id}`,
      name: s.applicant?.full_name || `Submission #${s.id.slice(0, 8)}`,
      phone: s.applicant?.phone || '',
      formName: s.template?.name || 'Unknown Form',
      date: s.created_at,
      status: s.status,
      href: `/office/submission/${s.id}`,
    })),
    ...filteredNewSubmissions.map(s => ({
      key: `new-${s.submission_id}`,
      name: s.applicants?.full_name || `Submission #${s.submission_id.slice(0, 8)}`,
      phone: s.applicants?.phone || '',
      formName: s.form_definitions?.form_name || 'Unknown Form',
      date: s.created_at,
      status: s.status,
      href: `/office/form-manager/${s.form_id}/submissions/${s.submission_id}`,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/office" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
                <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-700 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-lg">K</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold">KodaConnect</h1>
                  <p className="text-xs text-slate-400">by Bright Koda</p>
                </div>
              </Link>

              {/* Company Selector */}
              {companies.length > 1 && (
                <>
                  <div className="h-8 w-px bg-slate-700 mx-1" />
                  <CompanySelector
                    companies={companies}
                    selectedId={selectedCompany}
                    onSelect={setSelectedCompany}
                    compact
                  />
                </>
              )}
              {companies.length === 1 && (
                <>
                  <div className="h-8 w-px bg-slate-700 mx-1" />
                  <span className="text-sm text-slate-300">{companies[0].name}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSendModal(true)}
                className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 flex items-center gap-2 text-sm"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send Form Link</span>
              </button>

              <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium">{currentUser?.name}</p>
                  <p className={`text-xs px-1.5 py-0.5 rounded ${getRoleColor(currentUser?.role || '')}`}>
                    {getRoleLabel(currentUser?.role || '')}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {canManageUsers(currentUser) && (
                    <Link href="/office/users" className="p-2 hover:bg-slate-700 rounded-lg" title="Manage Users">
                      <Settings className="w-4 h-4" />
                    </Link>
                  )}
                  <button onClick={handleLogout} className="p-2 hover:bg-slate-700 rounded-lg" title="Logout">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Bar */}
          <nav className="flex items-center gap-1 mt-3 -mb-1 overflow-x-auto">
            {[
              { label: 'Dashboard', href: '/office', active: true },
              { label: 'Forms', href: '/office/form-manager' },
              { label: 'Messages', href: '/office/messages' },
              { label: 'Caregivers', href: '/office/caregivers' },
              ...(currentUser?.role === 'super_admin' ? [{ label: 'Companies', href: '/office/companies' }] : []),
              { label: 'Settings', href: '/office/settings' },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 text-sm rounded-t-lg transition-colors whitespace-nowrap ${
                  (item as any).active
                    ? 'bg-gray-50 text-slate-900 font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards — Full Width, 4 Columns */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Drafts</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{draftCount}</p>
              </div>
              <div className="bg-gray-100 rounded-lg p-2.5">
                <FileText className="w-5 h-5 text-gray-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Review</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{pendingCount}</p>
              </div>
              <div className="bg-yellow-100 rounded-lg p-2.5">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Finalized</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{finalizedCount}</p>
              </div>
              <div className="bg-teal-100 rounded-lg p-2.5">
                <CheckCircle className="w-5 h-5 text-teal-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount}</p>
              </div>
              <div className="bg-blue-100 rounded-lg p-2.5">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            href="/office/form-manager"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Form Manager
          </Link>
          <Link
            href="/office/packet-manager/import"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Import PDF
          </Link>
          {canManageUsers(currentUser) && (
            <Link
              href="/office/users"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Shield className="w-4 h-4" />
              User Management
            </Link>
          )}
        </div>

        {/* Recent Submissions — Full Width Table */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-500" />
              Recent Submissions
            </h2>
            <span className="text-sm text-gray-400">{mergedRecent.length} total</span>
          </div>

          {mergedRecent.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="font-medium">No submissions yet</p>
              <p className="text-sm mt-1">Send form links to applicants to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b bg-gray-50">
                    <th className="px-4 py-3 font-medium">Applicant</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">Phone</th>
                    <th className="px-4 py-3 font-medium">Form</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Date</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {mergedRecent.slice(0, 20).map(item => (
                    <tr key={item.key} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={item.href} className="font-medium text-gray-900 hover:text-teal-600">
                          {item.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">
                        {item.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{item.formName}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                          {getStatusIcon(item.status)}
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
                        {new Date(item.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={item.href}>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <p className="text-center text-sm text-gray-500">
            Powered by <span className="font-semibold text-gray-700">KodaConnect</span> by Bright Koda
          </p>
        </div>
      </footer>

      {/* Send Form Link Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Send Form Link</h3>
              <button onClick={() => setShowSendModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Document</label>
                <select
                  value={selectedTemplateId}
                  onChange={e => setSelectedTemplateId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">Choose a document...</option>
                  {companies.map(company => (
                    <optgroup key={company.id} label={company.name}>
                      {templates.filter(t => t.company_id === company.id).map(template => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Applicant Name (Optional)</label>
                <input
                  type="text"
                  value={applicantName}
                  onChange={e => setApplicantName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    value={applicantPhone}
                    onChange={e => setApplicantPhone(e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Include country code (e.g., +1 for US)</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSendModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={sendFormLink}
                disabled={sendingForm || !selectedTemplateId || !applicantPhone}
                className="flex-1 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {sendingForm ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Link
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
