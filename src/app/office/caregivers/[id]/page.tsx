'use client';

/**
 * Caregiver Profile Page
 * View and manage individual caregiver details, forms, credentials, messages, and activity
 */

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  Mail,
  Phone,
  MapPin,
  FileText,
  Shield,
  MessageSquare,
  Activity,
  AlertCircle,
  Download,
  Plus,
  Send,
} from 'lucide-react';
import { BrandedHeader } from '@/components/BrandedHeader';
import { useSession } from '@/components/SessionProvider';

interface CaregiverData {
  profile: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    status: string;
    areas: string[];
    onboarding_progress: number;
    created_at: string;
  };
  credentials: Array<{
    id: string;
    credential_type: string;
    issue_date: string;
    expiry_date: string;
    document_url?: string;
  }>;
  submissions: Array<{
    id: string;
    template: { name: string };
    status: string;
    created_at: string;
    filled_pdf_url?: string;
  }>;
  messages: Array<{
    id: string;
    message: string;
    created_at: string;
    direction: 'inbound' | 'outbound';
  }>;
  activity: Array<{
    id: string;
    activity_type: string;
    description: string;
    created_at: string;
  }>;
}

type TabType = 'overview' | 'forms' | 'credentials' | 'messages' | 'activity';

export default function CaregiverProfilePage() {
  const router = useRouter();
  const params = useParams();
  const { user, isLoading: sessionLoading } = useSession();

  const caregiver_id = params.id as string;
  const [data, setData] = useState<CaregiverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (sessionLoading) return;

    if (!user) {
      router.push('/office/login');
      return;
    }

    loadCaregiverData();
  }, [user, sessionLoading, router, caregiver_id]);

  async function loadCaregiverData() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/caregivers/${caregiver_id}`);

      if (!response.ok) {
        throw new Error('Failed to load caregiver data');
      }

      const result = await response.json();
      setData(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Caregiver data error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BrandedHeader title="Caregivers" />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{error || 'Caregiver not found'}</p>
            <button
              onClick={() => router.back()}
              className="mt-4 text-sm text-red-600 hover:text-red-700"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const profile = data.profile;
  const initials = profile.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'onboarding':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCredentialStatus = (date: string) => {
    const now = new Date();
    const expiry = new Date(date);
    const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) return { text: 'Expired', color: 'bg-red-100 text-red-800' };
    if (daysUntil < 30) return { text: 'Expiring Soon', color: 'bg-yellow-100 text-yellow-800' };
    return { text: 'Current', color: 'bg-green-100 text-green-800' };
  };

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: Users },
    { id: 'forms' as TabType, label: 'Forms', icon: FileText },
    { id: 'credentials' as TabType, label: 'Credentials', icon: Shield },
    { id: 'messages' as TabType, label: 'Messages', icon: MessageSquare },
    { id: 'activity' as TabType, label: 'Activity', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <BrandedHeader title="Caregivers" />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">{error}</p>
          </div>
        )}

        {/* Profile Header */}
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-blue-600">{initials}</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{profile.full_name}</h1>
                <span className={`inline-block mt-2 text-xs font-medium px-3 py-1 rounded-full ${getStatusColor(profile.status)}`}>
                  {profile.status}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/office/messages?caregiver=${caregiver_id}`)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
              >
                <MessageSquare className="w-4 h-4" />
                Message
              </button>
              <button
                onClick={() => router.push(`/office/forms/send?caregiver=${caregiver_id}`)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                <Send className="w-4 h-4" />
                Send Form
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl shadow-sm border mb-6">
          <div className="flex border-b">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Contact Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">Phone</p>
                        <p className="font-medium text-gray-900">{profile.phone}</p>
                      </div>
                    </div>
                    {profile.email && (
                      <div className="flex items-center gap-3">
                        <Mail className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">Email</p>
                          <p className="font-medium text-gray-900">{profile.email}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Areas of Coverage */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Areas of Coverage</h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.areas.length > 0 ? (
                      profile.areas.map((area) => (
                        <span key={area} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                          {area}
                        </span>
                      ))
                    ) : (
                      <p className="text-gray-500">No areas configured</p>
                    )}
                  </div>
                </div>

                {/* Onboarding Progress */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Onboarding Progress</h3>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Completion</span>
                      <span className="text-sm font-bold text-gray-900">{profile.onboarding_progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="h-3 bg-blue-600 rounded-full transition-all"
                        style={{ width: `${profile.onboarding_progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'forms' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Form Submissions</h3>
                  <button
                    onClick={() => router.push(`/office/forms/send?caregiver=${caregiver_id}`)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Send Form
                  </button>
                </div>

                {data.submissions.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No form submissions yet</p>
                ) : (
                  <div className="space-y-2">
                    {data.submissions.map((submission) => (
                      <div key={submission.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                        <div>
                          <p className="font-medium text-gray-900">{submission.template.name}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(submission.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">
                            {submission.status}
                          </span>
                          {submission.filled_pdf_url && (
                            <Link
                              href={submission.filled_pdf_url}
                              target="_blank"
                              className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'credentials' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Credentials</h3>
                  <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                    <Plus className="w-4 h-4" />
                    Add Credential
                  </button>
                </div>

                {data.credentials.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No credentials added yet</p>
                ) : (
                  <div className="space-y-3">
                    {data.credentials.map((cred) => {
                      const status = getCredentialStatus(cred.expiry_date);
                      return (
                        <div key={cred.id} className="p-4 bg-gray-50 rounded-lg border">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-gray-900">{cred.credential_type}</h4>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>
                              {status.text}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 text-sm text-gray-600">
                            <div>Issued: {new Date(cred.issue_date).toLocaleDateString()}</div>
                            <div>Expires: {new Date(cred.expiry_date).toLocaleDateString()}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'messages' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Message History</h3>
                {data.messages.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No messages yet</p>
                ) : (
                  <div className="space-y-3">
                    {data.messages.map((msg) => (
                      <div key={msg.id} className={`p-4 rounded-lg ${msg.direction === 'outbound' ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
                        <p className="text-sm text-gray-600">{msg.message}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {new Date(msg.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'activity' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Log</h3>
                {data.activity.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No activity yet</p>
                ) : (
                  <div className="space-y-3">
                    {data.activity.map((item) => (
                      <div key={item.id} className="flex gap-3 p-4 bg-gray-50 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-blue-600 mt-2 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900">{item.activity_type}</p>
                          <p className="text-sm text-gray-600">{item.description}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(item.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Users({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 12H9m6 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
