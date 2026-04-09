'use client';

import { FormSubmission } from '@/lib/submissions';
import { formatDate } from '@/lib/submissions';

interface SubmissionTimelineProps {
  submission: FormSubmission;
}

interface TimelineEvent {
  id: string;
  label: string;
  timestamp?: string;
  status?: string;
  reviewedBy?: string;
  color: 'green' | 'yellow' | 'red';
}

export function SubmissionTimeline({ submission }: SubmissionTimelineProps) {
  const events: TimelineEvent[] = [];

  // Created event
  if (submission.created_at) {
    events.push({
      id: 'created',
      label: 'Created',
      timestamp: submission.created_at,
      color: 'yellow',
    });
  }

  // Submitted event
  if (submission.submitted_at) {
    events.push({
      id: 'submitted',
      label: 'Submitted',
      timestamp: submission.submitted_at,
      color: 'yellow',
    });
  }

  // Reviewed event
  if (submission.reviewed_at) {
    const isApproved = submission.status === 'approved';
    events.push({
      id: 'reviewed',
      label: isApproved ? 'Approved' : 'Rejected',
      timestamp: submission.reviewed_at,
      status: submission.status,
      reviewedBy: submission.reviewed_by,
      color: isApproved ? 'green' : 'red',
    });
  }

  const getColorClasses = (color: 'green' | 'yellow' | 'red') => {
    switch (color) {
      case 'green':
        return 'bg-green-100 border-green-300 text-green-700';
      case 'yellow':
        return 'bg-yellow-100 border-yellow-300 text-yellow-700';
      case 'red':
        return 'bg-red-100 border-red-300 text-red-700';
    }
  };

  const getDotClasses = (color: 'green' | 'yellow' | 'red') => {
    switch (color) {
      case 'green':
        return 'bg-green-500';
      case 'yellow':
        return 'bg-yellow-500';
      case 'red':
        return 'bg-red-500';
    }
  };

  if (events.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Timeline</h3>

      <div className="space-y-0">
        {events.map((event, index) => (
          <div key={event.id} className="flex gap-4 relative pb-8">
            {/* Vertical Line */}
            {index < events.length - 1 && (
              <div className="absolute left-4 top-12 w-0.5 h-12 bg-gray-200" />
            )}

            {/* Dot */}
            <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center ${getDotClasses(event.color)}`}>
              <div className="w-3 h-3 rounded-full bg-white" />
            </div>

            {/* Content */}
            <div className="flex-1 pt-1">
              <div className={`inline-block px-3 py-2 rounded-lg border ${getColorClasses(event.color)}`}>
                <p className="font-medium text-sm">{event.label}</p>
              </div>

              {event.timestamp && (
                <p className="text-sm text-gray-600 mt-2">{formatDate(event.timestamp)}</p>
              )}

              {event.status && (
                <p className="text-sm text-gray-600 mt-1">
                  Status: <span className="font-medium text-gray-900">{event.status}</span>
                </p>
              )}

              {event.reviewedBy && (
                <p className="text-sm text-gray-600 mt-1">
                  Reviewed by: <span className="font-medium text-gray-900">{event.reviewedBy}</span>
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
