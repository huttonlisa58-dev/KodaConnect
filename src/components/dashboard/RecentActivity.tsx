'use client';

/**
 * RecentActivity Component
 * Displays activity timeline with action icons and timestamps
 */

import React from 'react';
import Link from 'next/link';
import {
  FileCheck,
  MessageSquare,
  UserPlus,
  Shield,
  LogIn,
  MoreHorizontal,
} from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'form_submitted' | 'message_sent' | 'caregiver_added' | 'credential_verified' | 'login' | 'other';
  user_name: string;
  description: string;
  timestamp: Date;
  related_id?: string;
}

interface RecentActivityProps {
  activities: ActivityItem[];
}

const iconMap = {
  form_submitted: FileCheck,
  message_sent: MessageSquare,
  caregiver_added: UserPlus,
  credential_verified: Shield,
  login: LogIn,
  other: MoreHorizontal,
};

const colorMap = {
  form_submitted: 'bg-green-100 text-green-600',
  message_sent: 'bg-blue-100 text-blue-600',
  caregiver_added: 'bg-purple-100 text-purple-600',
  credential_verified: 'bg-blue-100 text-blue-600',
  login: 'bg-gray-100 text-gray-600',
  other: 'bg-gray-100 text-gray-600',
};

export function RecentActivity({ activities }: RecentActivityProps) {
  const formatTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
        <Link href="/office/dashboard" className="text-sm text-blue-600 hover:text-blue-700">
          View All
        </Link>
      </div>

      <div className="space-y-4">
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">No activity yet</p>
        ) : (
          activities.map((activity, index) => {
            const Icon = iconMap[activity.type];
            const colorClass = colorMap[activity.type];

            return (
              <div key={activity.id} className="flex gap-4">
                {/* Timeline */}
                <div className="flex flex-col items-center">
                  <div className={`rounded-lg p-2 ${colorClass}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {index !== activities.length - 1 && (
                    <div className="w-0.5 h-8 bg-gray-200 mt-2" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pt-1">
                  <p className="text-sm font-medium text-gray-900">
                    {activity.user_name}
                  </p>
                  <p className="text-sm text-gray-600">
                    {activity.description}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatTime(activity.timestamp)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
