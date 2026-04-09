'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Send,
  Eye,
  Download,
  Clock,
  CheckCircle,
  AlertCircle,
  Users,
  Loader2,
  Phone,
  X,
} from 'lucide-react';

interface DocumentTemplate {
  id: string;
  name: string;
  slug: string;
  pdf_url: string;
  program_id: string;
  detection_status: string;
}

interface DocumentField {
  id: string;
  field_key: string;
  field_type: string;
  label: string;
  is_required: boolean;
}

interface Submission {
  id: string;
  applicant_id: string;
  status: string;
  created_at: string;
  form_data: Record<string, unknown>;
  applicant?: {
    name: string;
    phone: string;
  };
}

export default function DocumentDetailPage() {
  const params = useParams();
  const templateId = params.id as string;

  const [template, setTemplate] = useState<DocumentTemplate | null>(null);
  const [fields, setFields] = useState<DocumentField[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  // Send Form Modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendingForm, setSendingForm] = useState(false);
  const [applicantPhone, setApplicantPhone] = useState('');
  const [applicantName, setApplicantName] = useState('');

  useEffect(() => {
    loadData();
  }, [templateId]);

  async function loadData() {
    setLoading(true);

    // Load template
    const { data: templateData } = await getSupabase()
      .from('document_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateData) {
      setTemplate(templateData);
    }

    // Load fields
    const { data: fieldsData } = await getSupabase()
      .from('document_fields')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order');

    if (fieldsData) {
      setFields(fieldsData);
    }

    // Load submissions with applicant info
    const { data: submissionsData } = await getSupabase()
      .from('submissions')
      .select('*, applicant:applicants(name, phone)')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false });

    if (submissionsData) {
      setSubmissions(submissionsData);
    }

    setLoading(false);
  }

  async function sendFormLink() {
    if (!applicantPhone) {
      alert('Please enter phone number');
      return;
    }

    setSendingForm(true);

    try {
      console.log('Step 1: Creating applicant record...');
      // Create applicant record
      const { data: applicant, error: applicantError } = await getSupabase()
        .from('applicants')
        .insert({
          phone: applicantPhone,
          full_name: applicantName || 'Unknown',
        })
        .select()
        .single();

      if (applicantError) {
        console.error('Applicant insert error:', applicantError);
        throw new Error(`Failed to create applicant: ${applicantError.message}`);
      }

      console.log('Step 2: Creating access token...');
      // Create access token
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const { error: tokenError } = await getSupabase()
        .from('access_tokens')
        .insert({
          applicant_id: applicant.id,
          template_id: templateId,
          token,
          expires_at: expiresAt.toISOString(),
        });

      if (tokenError) {
        console.error('Token insert error:', tokenError);
        throw new Error(`Failed to create token: ${tokenError.message}`);
      }

      console.log('Step 3: Sending OTP via API...');
      // Send OTP via Twilio
      const response = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: applicantPhone,
          token,
        }),
      });

      const result = await response.json();
      console.log('OTP API response:', result);

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send SMS');
      }

      // Show success with form link (in case SMS link doesn't arrive on trial account)
      const message = `OTP sent to ${applicantPhone}!\n\nForm Link (share manually if SMS doesn't arrive):\n${result.formUrl}`;
      alert(message);

      // Also copy to clipboard
      if (result.formUrl) {
        navigator.clipboard.writeText(result.formUrl).catch(() => {});
      }

      setShowSendModal(false);
      setApplicantPhone('');
      setApplicantName('');

    } catch (error) {
      console.error('Send form error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to send form: ${errorMessage}`);
    } finally {
      setSendingForm(false);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted': return 'bg-yellow-100 text-yellow-800';
      case 'under_review': return 'bg-blue-100 text-blue-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted': return <Clock className="w-4 h-4" />;
      case 'under_review': return <Eye className="w-4 h-4" />;
      case 'approved': return <CheckCircle className="w-4 h-4" />;
      case 'rejected': return <AlertCircle className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Document not found</p>
          <Link href="/office" className="text-blue-600 hover:underline mt-2 inline-block">
            Back to Office Portal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link href="/office" className="text-blue-600 hover:underline flex items-center gap-1 text-sm mb-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Office Portal
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{template.name}</h1>
              <p className="text-sm text-gray-500">
                {fields.length} fields configured •{' '}
                <a
                  href={template.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View PDF
                </a>
              </p>
            </div>
            <button
              onClick={() => setShowSendModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Send Form Link
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Fields Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="p-4 border-b">
                <h2 className="font-semibold text-gray-900">Form Fields</h2>
              </div>
              <div className="p-4 space-y-2">
                {fields.length === 0 ? (
                  <p className="text-gray-500 text-sm">No fields configured yet</p>
                ) : (
                  fields.map(field => (
                    <div key={field.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 text-sm">{field.label}</span>
                        {field.is_required && (
                          <span className="text-xs text-red-500">Required</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">{field.field_type}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Submissions */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-gray-500" />
                  Submissions ({submissions.length})
                </h2>
              </div>
              <div className="divide-y">
                {submissions.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p>No submissions yet</p>
                    <p className="text-sm mt-1">Send form links to applicants to get started</p>
                  </div>
                ) : (
                  submissions.map(submission => (
                    <div key={submission.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            {submission.applicant?.name || 'Unknown Applicant'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {submission.applicant?.phone} •{' '}
                            {new Date(submission.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(submission.status)}`}>
                            {getStatusIcon(submission.status)}
                            {submission.status.replace('_', ' ')}
                          </span>
                          <button className="p-2 hover:bg-gray-100 rounded-lg">
                            <Eye className="w-4 h-4 text-gray-500" />
                          </button>
                          <button className="p-2 hover:bg-gray-100 rounded-lg">
                            <Download className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Send Form Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Send Form Link</h3>
              <button
                onClick={() => setShowSendModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Send "{template.name}" to an applicant
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Applicant Name (Optional)
                </label>
                <input
                  type="text"
                  value={applicantName}
                  onChange={e => setApplicantName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    value={applicantPhone}
                    onChange={e => setApplicantPhone(e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2"
                  />
                </div>
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
                disabled={sendingForm || !applicantPhone}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendingForm ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Send Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
