'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Heart,
  Users,
  AlertCircle,
  CheckCircle,
  Pill,
  Phone,
  ArrowLeft,
  Loader2,
} from 'lucide-react';

interface CarePlanDetail {
  id: string;
  summary: string;
  description: string;
  startDate: string;
  nextVisitDate: string;
  visitFrequency: string;
  visitDuration: string;
  specialInstructions: string;
  caregivers: Array<{
    id: string;
    name: string;
    role: string;
    phone: string;
  }>;
  medications: Array<{
    id: string;
    name: string;
    dosage: string;
    frequency: string;
    instructions: string;
  }>;
  appointments: Array<{
    id: string;
    date: string;
    time: string;
    provider: string;
    type: string;
    location: string;
  }>;
  emergencyContacts: Array<{
    id: string;
    name: string;
    relationship: string;
    phone: string;
  }>;
}

export default function CarePlanPage() {
  const router = useRouter();
  const [carePlan, setCarePlan] = useState<CarePlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCarePlan();
  }, []);

  const loadCarePlan = async () => {
    try {
      setLoading(true);
      setError(null);

      const patientId = localStorage.getItem('patient_id');
      const token = localStorage.getItem('patient_token');

      if (!patientId || !token) {
        router.push('/patient/login');
        return;
      }

      // Mock care plan data
      const mockCarePlan: CarePlanDetail = {
        id: '1',
        summary: 'Daily physical therapy and medication management',
        description:
          'Comprehensive care plan focused on improving mobility and managing chronic conditions through supervised physical therapy sessions and medication management.',
        startDate: '2024-01-15',
        nextVisitDate: '2024-02-12',
        visitFrequency: 'Tuesday and Friday',
        visitDuration: '1 hour',
        specialInstructions:
          'Please ensure patient takes medications with food. Schedule physical therapy appointments in morning if possible. Monitor for any changes in mobility or pain levels.',
        caregivers: [
          {
            id: '1',
            name: 'Sarah Johnson',
            role: 'Primary Caregiver',
            phone: '(555) 123-4567',
          },
          {
            id: '2',
            name: 'Dr. Michael Chen',
            role: 'Healthcare Provider',
            phone: '(555) 987-6543',
          },
          {
            id: '3',
            name: 'Maria Lopez',
            role: 'Physical Therapist',
            phone: '(555) 456-7890',
          },
        ],
        medications: [
          {
            id: '1',
            name: 'Lisinopril',
            dosage: '10 mg',
            frequency: 'Once daily',
            instructions: 'Take in the morning with food',
          },
          {
            id: '2',
            name: 'Metformin',
            dosage: '500 mg',
            frequency: 'Twice daily',
            instructions: 'Take with meals',
          },
          {
            id: '3',
            name: 'Aspirin',
            dosage: '81 mg',
            frequency: 'Once daily',
            instructions: 'Take in the morning',
          },
        ],
        appointments: [
          {
            id: '1',
            date: '2024-02-12',
            time: '2:00 PM',
            provider: 'Sarah Johnson',
            type: 'Home Visit - Physical Therapy',
            location: 'Home',
          },
          {
            id: '2',
            date: '2024-02-14',
            time: '10:00 AM',
            provider: 'Dr. Michael Chen',
            type: 'Check-up',
            location: 'Medical Office - 123 Health St, Suite 200',
          },
          {
            id: '3',
            date: '2024-02-16',
            time: '2:00 PM',
            provider: 'Maria Lopez',
            type: 'Home Visit - Physical Therapy',
            location: 'Home',
          },
        ],
        emergencyContacts: [
          {
            id: '1',
            name: 'John Doe',
            relationship: 'Spouse',
            phone: '(555) 111-2222',
          },
          {
            id: '2',
            name: 'Jane Doe',
            relationship: 'Daughter',
            phone: '(555) 333-4444',
          },
          {
            id: '3',
            name: 'Emergency Services',
            relationship: 'Emergency',
            phone: '911',
          },
        ],
      };

      setCarePlan(mockCarePlan);
    } catch (err) {
      console.error('Care plan load error:', err);
      setError('Failed to load care plan');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!carePlan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Care Plan Not Found</h2>
          <p className="text-gray-600 mb-6">{error || 'Your care plan could not be loaded.'}</p>
          <Link
            href="/patient/dashboard"
            className="block bg-blue-600 text-white font-semibold px-6 py-2 rounded-lg hover:bg-blue-700 transition text-center"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/patient/dashboard"
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition font-semibold mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">My Care Plan</h1>
          <p className="text-gray-600 mt-2">Started {new Date(carePlan.startDate).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Overview Card */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Plan Overview</h2>
          <p className="text-gray-700 leading-relaxed">{carePlan.description}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Visit Schedule</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">{carePlan.visitFrequency}</p>
              <p className="text-sm text-gray-600">{carePlan.visitDuration} per visit</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Next Scheduled Visit</p>
              <p className="text-lg font-semibold text-green-600 mt-1">
                {new Date(carePlan.nextVisitDate).toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-600">
                {(() => {
                  const nextVisit = new Date(carePlan.nextVisitDate);
                  const today = new Date();
                  const days = Math.ceil((nextVisit.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
                })()}
              </p>
            </div>
          </div>
        </div>

        {/* Special Instructions */}
        {carePlan.specialInstructions && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-bold text-blue-900 flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5" />
              Special Instructions
            </h3>
            <p className="text-blue-900">{carePlan.specialInstructions}</p>
          </div>
        )}

        {/* Care Team */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Care Team
          </h3>
          <div className="space-y-3">
            {carePlan.caregivers.map((caregiver) => (
              <div key={caregiver.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{caregiver.name}</p>
                    <p className="text-sm text-gray-600">{caregiver.role}</p>
                    <p className="text-sm text-gray-600 mt-2 flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {caregiver.phone}
                    </p>
                  </div>
                  <Link
                    href={`/patient/messages?caregiverId=${caregiver.id}`}
                    className="text-blue-600 hover:text-blue-700 transition font-semibold text-sm"
                  >
                    Message
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Medications */}
        {carePlan.medications.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Pill className="w-5 h-5 text-purple-600" />
              Current Medications
            </h3>
            <div className="space-y-3">
              {carePlan.medications.map((med) => (
                <div key={med.id} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{med.name}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        <span className="font-semibold">{med.dosage}</span> • {med.frequency}
                      </p>
                      <p className="text-sm text-gray-600 mt-2">{med.instructions}</p>
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Appointments */}
        {carePlan.appointments.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-orange-600" />
              Scheduled Appointments
            </h3>
            <div className="space-y-3">
              {carePlan.appointments.map((apt) => (
                <div
                  key={apt.id}
                  className={`p-4 border-l-4 rounded-lg ${
                    new Date(apt.date) >= new Date() ? 'border-l-green-600 bg-green-50' : 'border-l-gray-400 bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{apt.type}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {new Date(apt.date).toLocaleDateString()} at {apt.time}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">Provider: {apt.provider}</p>
                      <p className="text-sm text-gray-600">Location: {apt.location}</p>
                    </div>
                    {new Date(apt.date) >= new Date() && (
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-1" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Emergency Contacts */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            Emergency Contacts
          </h3>
          <div className="space-y-2">
            {carePlan.emergencyContacts.map((contact) => (
              <div
                key={contact.id}
                className={`p-4 border rounded-lg ${
                  contact.relationship === 'Emergency' ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`}
              >
                <p className="font-semibold text-gray-900">{contact.name}</p>
                <p className="text-sm text-gray-600">{contact.relationship}</p>
                <p className="text-lg font-bold text-gray-900 mt-1 font-mono">{contact.phone}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Download/Print */}
        <div className="bg-white rounded-lg shadow p-6">
          <button className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition">
            Download Care Plan (PDF)
          </button>
        </div>
      </main>
    </div>
  );
}
