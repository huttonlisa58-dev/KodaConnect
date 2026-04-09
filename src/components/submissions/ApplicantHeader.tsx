'use client';

import { User, Phone, Mail } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { formatDate } from '@/lib/submissions';

interface ApplicantHeaderProps {
  applicantName: string;
  applicantPhone?: string;
  applicantEmail?: string;
  formName: string;
  status: string;
  submittedAt?: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);
}

export function ApplicantHeader({
  applicantName,
  applicantPhone,
  applicantEmail,
  formName,
  status,
  submittedAt,
}: ApplicantHeaderProps) {
  const initials = getInitials(applicantName);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Applicant Info */}
        <div className="flex items-start gap-4 flex-1">
          {/* Avatar Circle */}
          <div className="flex-shrink-0">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-xl font-semibold text-blue-700">{initials}</span>
            </div>
          </div>

          {/* Applicant Details */}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{applicantName}</h1>

            <div className="space-y-2 text-gray-600">
              {applicantPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span>{applicantPhone}</span>
                </div>
              )}
              {applicantEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span>{applicantEmail}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Form and Status Info */}
        <div className="flex flex-col gap-4 md:border-l md:border-gray-200 md:pl-6">
          <div>
            <p className="text-sm text-gray-600 mb-1">Form</p>
            <p className="font-semibold text-gray-900">{formName}</p>
          </div>

          <div>
            <p className="text-sm text-gray-600 mb-1">Status</p>
            <StatusBadge status={status} />
          </div>

          {submittedAt && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Submitted</p>
              <p className="text-gray-900">{formatDate(submittedAt)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
