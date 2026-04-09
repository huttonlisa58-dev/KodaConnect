'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Bundle,
  BundleApplicant,
  BundleNote,
  PacketStatus,
  BundleDetailResponse,
} from './types';

// Loading skeleton
function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-12 bg-gray-200 rounded animate-pulse" />
      <div className="h-6 bg-gray-200 rounded animate-pulse" />
      <div className="h-6 bg-gray-200 rounded animate-pulse" />
    </div>
  );
}

// Status badge for packets
function PacketStatusBadge({ status }: { status: PacketStatus }) {
  const config = {
    not_started: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      label: 'Not Started',
    },
    in_progress: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      label: 'In Progress',
    },
    submitted: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      label: 'Submitted',
    },
    approved: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Approved',
    },
    needs_revision: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      label: 'Needs Revision',
    },
  };

  const c = config[status];
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// Render mode badge
function RenderModeBadge({ mode }: { mode: 'generated' | 'replica' }) {
  const config = {
    generated: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Generated' },
    replica: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Replica' },
  };

  const c = config[mode];
  return (
    <span className={`px-2 py-1 rounded text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// Role badge
function RoleBadge({ role }: { role: 'applicant' | 'rn_evaluator' | 'hr_admin' }) {
  const config = {
    applicant: { bg: 'bg-green-100', text: 'text-green-800', label: 'Applicant' },
    rn_evaluator: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'RN Evaluator' },
    hr_admin: { bg: 'bg-red-100', text: 'text-red-800', label: 'HR Admin' },
  };

  const c = config[role];
  return (
    <span className={`px-2 py-1 rounded text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// Bundle status badge
function BundleStatusBadge({ status }: { status: string }) {
  const config = {
    not_started: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      label: 'Not Started',
    },
    in_progress: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      label: 'In Progress',
    },
    pending_review: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      label: 'Pending Review',
    },
    complete: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Complete',
    },
  };

  const c = config[status as keyof typeof config] || config.not_started;
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

/**
 * BundleDetail Component
 * Displays detailed view of a single onboarding bundle including:
 * - Applicant information
 * - Overall status and progress
 * - Individual packet statuses
 * - Notes section
 */
export default function BundleDetail() {
  const params = useParams();
  const router = useRouter();
  const bundleId = params?.id as string;

  // State management
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [applicant, setApplicant] = useState<BundleApplicant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);

  // Fetch bundle details on mount
  useEffect(() => {
    const fetchBundleDetail = async () => {
      if (!bundleId) return;

      try {
        const response = await fetch(`/api/onboarding/bundles/${bundleId}`);
        if (!response.ok) throw new Error('Failed to fetch bundle details');

        const data: BundleDetailResponse = await response.json();
        setBundle(data.bundle);
        setApplicant(data.applicant);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'An error occurred while loading bundle details'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchBundleDetail();
  }, [bundleId]);

  // Handle add note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!notes.trim() || !bundle) return;

    setSubmittingNote(true);

    try {
      const response = await fetch(`/api/onboarding/bundles/${bundle.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: notes.trim(),
        }),
      });

      if (!response.ok) throw new Error('Failed to add note');

      // Refresh bundle data to show new note
      const bundleRes = await fetch(`/api/onboarding/bundles/${bundle.id}`);
      const bundleData: BundleDetailResponse = await bundleRes.json();
      setBundle(bundleData.bundle);

      setNotes('');
      setShowAddNote(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to add note. Please try again.'
      );
    } finally {
      setSubmittingNote(false);
    }
  };

  // Handle send reminder
  const handleSendReminder = async () => {
    if (!bundle) return;

    try {
      const response = await fetch(`/api/onboarding/bundles/${bundle.id}/reminder`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to send reminder');

      // Show success message
      alert('Reminder sent successfully');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to send reminder'
      );
    }
  };

  // Handle download all PDFs
  const handleDownloadAll = async () => {
    if (!bundle) return;

    try {
      const response = await fetch(
        `/api/onboarding/bundles/${bundle.id}/download-all`
      );

      if (!response.ok) throw new Error('Failed to download files');

      // Create blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `onboarding-${bundle.applicant_name.replace(/\s+/g, '-')}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to download files. Please try again.'
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  if (!bundle || !applicant) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">
              {error || 'Bundle not found'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-start justify-between">
            <div>
              <button
                onClick={() => router.back()}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-4"
              >
                ← Back
              </button>
              <h1 className="text-3xl font-bold text-gray-900">
                {bundle.applicant_name}
              </h1>
              <div className="flex items-center gap-4 mt-4">
                <BundleStatusBadge status={bundle.status} />
                <span className="text-sm text-gray-600">
                  Created {new Date(bundle.created_at).toLocaleDateString()} by{' '}
                  {bundle.created_by_name}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSendReminder}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Send Reminder
              </button>
              <button
                onClick={handleDownloadAll}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Download All PDFs
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {/* Applicant info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Applicant Information
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600">Name</p>
              <p className="font-medium text-gray-900">
                {applicant.first_name} {applicant.last_name}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p className="font-medium text-gray-900">{applicant.phone}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-medium text-gray-900">
                {applicant.email || 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Company</p>
              <p className="font-medium text-gray-900">{bundle.company_name}</p>
            </div>
          </div>
        </div>

        {/* Template info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Template
          </h2>
          <p className="font-medium text-gray-900">{bundle.template_name}</p>
        </div>

        {/* Packets section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            Form Packets ({bundle.progress.completed_packets}/
            {bundle.progress.total_packets})
          </h2>

          <div className="space-y-4">
            {bundle.progress.packets.map((packet) => (
              <div
                key={packet.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">
                      {packet.packet_name}
                    </h3>
                    <div className="flex gap-2 mt-2">
                      <RenderModeBadge mode={packet.render_mode} />
                      <RoleBadge role={packet.assigned_to_role} />
                      {packet.is_required && (
                        <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded">
                          Required
                        </span>
                      )}
                    </div>
                  </div>
                  <PacketStatusBadge status={packet.status} />
                </div>

                {/* Status details */}
                <div className="text-sm text-gray-600 mb-3">
                  {packet.status === 'not_started' && (
                    <p>Not yet started</p>
                  )}
                  {packet.status === 'in_progress' && (
                    <p>Currently being filled out</p>
                  )}
                  {packet.status === 'submitted' && (
                    <p>
                      Submitted on{' '}
                      {packet.submitted_at &&
                        new Date(packet.submitted_at).toLocaleDateString()}{' '}
                      by {packet.submitted_by_role}
                    </p>
                  )}
                  {packet.status === 'approved' && (
                    <p>
                      Approved on{' '}
                      {packet.submitted_at &&
                        new Date(packet.submitted_at).toLocaleDateString()}
                    </p>
                  )}
                  {packet.status === 'needs_revision' && (
                    <p>Requires changes - awaiting resubmission</p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  {packet.submission_id && (
                    <button
                      onClick={() =>
                        router.push(
                          `/office/submissions/${packet.submission_id}`
                        )
                      }
                      className="text-sm px-3 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      Review Submission
                    </button>
                  )}
                  {packet.status === 'not_started' &&
                    packet.assigned_to_role === 'hr_admin' && (
                    <button
                      onClick={() =>
                        router.push(
                          `/office/forms/${packet.packet_id}?bundle=${bundle.id}`
                        )
                      }
                      className="text-sm px-3 py-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                    >
                      Fill Form
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notes section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Notes</h2>

          {/* Existing notes */}
          {bundle.notes.length > 0 && (
            <div className="space-y-4 mb-6">
              {bundle.notes.map((note) => (
                <div key={note.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-medium text-gray-900">
                      {note.created_by_name}
                    </p>
                    <p className="text-xs text-gray-600">
                      {new Date(note.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="text-gray-700">{note.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Add note form */}
          {!showAddNote ? (
            <button
              onClick={() => setShowAddNote(true)}
              className="text-sm px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              + Add Note
            </button>
          ) : (
            <form onSubmit={handleAddNote} className="space-y-3">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add a note..."
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submittingNote || !notes.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submittingNote ? 'Saving...' : 'Save Note'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddNote(false);
                    setNotes('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
