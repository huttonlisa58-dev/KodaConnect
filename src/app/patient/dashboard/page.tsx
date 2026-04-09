'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Heart,
  Users,
  FileText,
  Calendar,
  MessageSquare,
  Phone,
  MapPin,
  ChevronRight,
  Download,
  LogOut,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface Caregiver {
  id: string;
  fullName: string;
  phone: string;
  role: string;
  avatarUrl?: string;
}

interface Form {
  id: string;
  name: string;
  status: 'pending' | 'completed' | 'overdue';
  dueDate?: string;
  completedDate?: string;
  pdfUrl?: string;
}

interface CarePlan {
  id: string;
  summary: string;
  startDate: string;
  nextVisitDate: string;
  visitFrequency: string;
  specialInstructions?: string;
}

interface Message {
  id: string;
  senderName: string;
  senderRole: string;
  content: string;
  sentAt: string;
  read: boolean;
}

interface PatientProfile {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  dateOfBirth: string;
  relationship: string;
}

export default function PatientDashboard() {
  const router = useRouter();
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [carePlan, setCarePlan] = useState<CarePlan | null>(null);
  const [recentMessages, setRecentMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      const patientId = localStorage.getItem('patient_id');
      const token = localStorage.getItem('patient_token');

      if (!patientId || !token) {
        router.push('/patient/login');
        return;
      }

      // Fetch profile
      const profileRes = await fetch(`/api/patient/profile?id=${patientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profileRes.ok) {
        setPatient(await profileRes.json());
      }

      // Fetch caregivers (mock data for now)
      setCaregivers([
        {
          id: '1',
          fullName: 'Sarah Johnson',
          phone: '(555) 123-4567',
          role: 'Primary Caregiver',
          avatarUrl: undefined,
        },
        {
          id: '2',
          fullName: 'Dr. Michael Chen',
          phone: '(555) 987-6543',
          role: 'Healthcare Provider',
          avatarUrl: undefined,
        },
      ]);

      // Fetch forms
      const formsRes = await fetch(`/api/patient/forms?patientId=${patientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (formsRes.ok) {
        const formsData = await formsRes.json();
        setForms(formsData);
      } else {
        // Mock data for demonstration
        setForms([
          {
            id: '1',
            name: 'Health History Form',
            status: 'pending',
            dueDate: '2024-02-15',
          },
          {
            id: '2',
            name: 'Medication List',
            status: 'completed',
            completedDate: '2024-02-05',
            pdfUrl: '/documents/medication-list.pdf',
          },
          {
            id: '3',
            name: 'Emergency Contact Update',
            status: 'pending',
            dueDate: '2024-02-20',
          },
        ]);
      }

      // Fetch care plan
      const carePlanRes = await fetch(`/api/patient/care-plan?patientId=${patientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (carePlanRes.ok) {
        setCarePlan(await carePlanRes.json());
      } else {
        // Mock data for demonstration
        setCarePlan({
          id: '1',
          summary: 'Daily physical therapy and medication management',
          startDate: '2024-01-15',
          nextVisitDate: '2024-02-12',
          visitFrequency: 'Tuesday and Friday, 2:00 PM',
          specialInstructions: 'Please ensure patient takes medications with food.',
        });
      }

      // Fetch recent messages (mock data)
      setRecentMessages([
        {
          id: '1',
          senderName: 'Sarah Johnson',
          senderRole: 'Primary Caregiver',
          content: 'Your appointment is confirmed for tomorrow at 2:00 PM',
          sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          read: true,
        },
        {
          id: '2',
          senderName: 'Dr. Michael Chen',
          senderRole: 'Healthcare Provider',
          content: 'Your lab results are ready. Everything looks good!',
          sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          read: false,
        },
      ]);
    } catch (err) {
      console.error('Dashboard load error:', err);
      setError('Failed to load dashboard. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('patient_token');
    localStorage.removeItem('patient_id');
    router.push('/patient');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadDashboard}
            className="bg-blue-600 text-white font-semibold px-6 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const pendingForms = forms.filter((f) => f.status === 'pending' || f.status === 'overdue');
  const completedForms = forms.filter((f) => f.status === 'completed');
  const unreadMessages = recentMessages.filter((m) => !m.read);
  const formProgress = (completedForms.length / forms.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Heart className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="font-bold text-gray-900">KodaConnect</h1>
              <p className="text-xs text-gray-600">Patient Portal</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition p-2"
            title="Sign out"
            aria-label="Sign out from patient portal"
          >
            <LogOut className="w-5 h-5" />
            <span className="hidden sm:inline text-sm font-semibold">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900">
            Welcome back, {patient?.fullName || 'Patient'}
          </h2>
          <p className="text-gray-600 mt-2">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Care Team Card */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                My Care Team
              </h3>
            </div>
            <div className="space-y-3">
              {caregivers.slice(0, 2).map((caregiver) => (
                <div key={caregiver.id} className="flex items-start justify-between pb-3 border-b border-gray-100 last:border-0">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{caregiver.fullName}</p>
                    <p className="text-xs text-gray-600">{caregiver.role}</p>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {caregiver.phone}
                    </p>
                  </div>
                  <Link
                    href={`/patient/messages?caregiverId=${caregiver.id}`}
                    className="text-blue-600 hover:text-blue-700 transition"
                    aria-label={`Message ${caregiver.fullName}`}
                  >
                    <MessageSquare className="w-5 h-5" />
                  </Link>
                </div>
              ))}
            </div>
            {caregivers.length > 2 && (
              <Link
                href="/patient/messages"
                className="text-blue-600 hover:text-blue-700 transition font-semibold text-sm flex items-center gap-1 pt-2"
              >
                View all caregivers
                <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>

          {/* Forms Card */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-orange-600" />
              My Forms
            </h3>
            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-600">Completion</span>
                  <span className="text-xs font-bold text-gray-900">{Math.round(formProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${formProgress}%` }}
                    role="progressbar"
                    aria-valuenow={Math.round(formProgress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              </div>
            </div>
            {pendingForms.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-yellow-900 mb-2">
                  {pendingForms.length} form{pendingForms.length > 1 ? 's' : ''} pending
                </p>
                {pendingForms.slice(0, 2).map((form) => (
                  <Link
                    key={form.id}
                    href={`/patient/forms/${form.id}`}
                    className="block text-xs text-yellow-900 hover:text-yellow-700 py-1"
                  >
                    • {form.name}
                  </Link>
                ))}
              </div>
            )}
            <Link
              href="/patient/forms"
              className="text-blue-600 hover:text-blue-700 transition font-semibold text-sm flex items-center gap-1"
            >
              View all forms
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Messages Card */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-green-600" />
              Messages
            </h3>
            {unreadMessages.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-900">
                  {unreadMessages.length} new message{unreadMessages.length > 1 ? 's' : ''}
                </p>
              </div>
            )}
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {recentMessages.slice(0, 3).map((msg) => (
                <div key={msg.id} className={`p-2 rounded text-xs ${msg.read ? 'bg-gray-50' : 'bg-blue-50'}`}>
                  <p className="font-semibold text-gray-900">{msg.senderName}</p>
                  <p className="text-gray-600 line-clamp-2">{msg.content}</p>
                </div>
              ))}
            </div>
            <Link
              href="/patient/messages"
              className="text-blue-600 hover:text-blue-700 transition font-semibold text-sm flex items-center gap-1"
            >
              View all messages
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Care Plan Card */}
        {carePlan && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 text-lg">
              <Calendar className="w-5 h-5 text-purple-600" />
              My Care Plan
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase">Summary</p>
                <p className="text-gray-900 mt-1">{carePlan.summary}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase">Visit Schedule</p>
                <p className="text-gray-900 mt-1">{carePlan.visitFrequency}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase">Next Visit</p>
                <p className="text-lg font-bold text-green-600 mt-1">
                  {new Date(carePlan.nextVisitDate).toLocaleDateString()}
                </p>
                <p className="text-xs text-gray-600">
                  {(() => {
                    const nextVisit = new Date(carePlan.nextVisitDate);
                    const today = new Date();
                    const days = Math.ceil((nextVisit.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
                  })()}
                </p>
              </div>
            </div>
            {carePlan.specialInstructions && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-semibold text-blue-900 mb-1">Special Instructions</p>
                <p className="text-sm text-blue-900">{carePlan.specialInstructions}</p>
              </div>
            )}
            <Link
              href="/patient/care-plan"
              className="text-blue-600 hover:text-blue-700 transition font-semibold text-sm flex items-center gap-1 pt-2"
            >
              View full care plan
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
