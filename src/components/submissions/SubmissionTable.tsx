'use client';

import { FormSubmission } from '@/lib/submissions';
import { StatusBadge } from './StatusBadge';
import { formatDate } from '@/lib/submissions';
import { Trash2 } from 'lucide-react';

interface FormOption {
  id: string;
  name: string;
}

interface SubmissionTableProps {
  submissions: FormSubmission[];
  onRowClick: (submissionId: string) => void;
  onDelete?: (submissionId: string) => void;
  showFormName?: boolean;
  showChwColumns?: boolean;
  isLoading?: boolean;
  forms?: FormOption[];
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-200">
      <td className="px-6 py-4">
        <div className="h-4 bg-gray-200 rounded w-32 animate-pulse" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 bg-gray-200 rounded w-20 animate-pulse" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 bg-gray-200 rounded w-28 animate-pulse" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 bg-gray-200 rounded w-16 animate-pulse" />
      </td>
    </tr>
  );
}

function SubmissionCard({
  submission,
  onRowClick,
  onDelete,
  showFormName,
  showChwColumns,
  forms,
}: {
  submission: FormSubmission;
  onRowClick: (submissionId: string) => void;
  onDelete?: (submissionId: string) => void;
  showFormName?: boolean;
  showChwColumns?: boolean;
  forms?: FormOption[];
}) {
  return (
    <div
      onClick={() => onRowClick(submission.submission_id)}
      className="block bg-white border border-gray-200 rounded-lg p-4 mb-4 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">
            {showChwColumns && (submission as any).chw_name
              ? (submission as any).chw_name
              : submission.applicant_name}
          </h3>
          {showChwColumns && (submission as any).participant_name && (
            <p className="text-sm text-gray-600">
              Member: {(submission as any).participant_name}
            </p>
          )}
          {!showChwColumns && submission.applicant_phone && (
            <p className="text-sm text-gray-600">{submission.applicant_phone}</p>
          )}
        </div>
        <StatusBadge status={submission.status} />
      </div>

      {showFormName && submission.form_id && (
        <p className="text-sm text-gray-600 mb-2">Form: {submission.form_name || forms?.find(f => f.id === submission.form_id)?.name || submission.form_id}</p>
      )}

      <div className="flex justify-between items-center text-sm text-gray-500">
        <span>{formatDate(submission.submitted_at || submission.created_at)}</span>
        <div className="flex items-center gap-3">
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(submission.submission_id);
              }}
              className="text-red-500 hover:text-red-700 font-medium"
            >
              Delete
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRowClick(submission.submission_id);
            }}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            View
          </button>
        </div>
      </div>
    </div>
  );
}

export function SubmissionTable({
  submissions,
  onRowClick,
  onDelete,
  showFormName = false,
  showChwColumns = false,
  isLoading = false,
  forms = [],
}: SubmissionTableProps) {
  // Calculate colSpan based on visible columns
  const baseColumns = 4; // Applicant/CHW, Status, Date, Actions
  const extraColumns = (showFormName ? 1 : 0) + (showChwColumns ? 1 : 0);
  const totalColumns = baseColumns + extraColumns;

  return (
    <>
      {/* Mobile card view */}
      <div className="block md:hidden">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-100 rounded-lg h-32 animate-pulse" />
            ))}
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No submissions found</p>
          </div>
        ) : (
          <div>
            {submissions.map((submission) => (
              <SubmissionCard
                key={submission.submission_id}
                submission={submission}
                onRowClick={onRowClick}
                onDelete={onDelete}
                showFormName={showFormName}
                showChwColumns={showChwColumns}
                forms={forms}
              />
            ))}
          </div>
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block overflow-x-auto">
      <table className="w-full table-fixed">
        <thead>
          <tr className="border-b border-gray-300 bg-gray-50">
            <th className="text-left px-6 py-3 font-semibold text-gray-900 w-[20%]">
              {showChwColumns ? 'CHW Name' : 'Applicant'}
            </th>
            {showChwColumns && (
              <th className="text-left px-6 py-3 font-semibold text-gray-900 w-[15%]">Participant</th>
            )}
            {showFormName && (
              <th className="text-left px-6 py-3 font-semibold text-gray-900 w-[25%]">Form Name</th>
            )}
            <th className="text-left px-6 py-3 font-semibold text-gray-900 w-[12%]">Status</th>
            <th className="text-left px-6 py-3 font-semibold text-gray-900 w-[18%]">Submitted Date</th>
            <th className="text-left px-6 py-3 font-semibold text-gray-900 w-[10%]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <>
              {[...Array(5)].map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </>
          ) : submissions.length === 0 ? (
            <tr>
              <td
                colSpan={totalColumns}
                className="text-center py-12 text-gray-500"
              >
                No submissions found
              </td>
            </tr>
          ) : (
            submissions.map((submission) => (
              <tr
                key={submission.submission_id}
                onClick={() => onRowClick(submission.submission_id)}
                className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {showChwColumns && (submission as any).chw_name
                        ? (submission as any).chw_name
                        : submission.applicant_name}
                    </p>
                    {!showChwColumns && submission.applicant_phone && (
                      <p className="text-sm text-gray-600 truncate">{submission.applicant_phone}</p>
                    )}
                  </div>
                </td>
                {showChwColumns && (
                  <td className="px-6 py-4 text-gray-700">
                    {(submission as any).participant_name || '-'}
                  </td>
                )}
                {showFormName && (
                  <td className="px-6 py-4 text-gray-700 truncate" title={submission.form_name || forms?.find(f => f.id === submission.form_id)?.name || submission.form_id || '-'}>{submission.form_name || forms?.find(f => f.id === submission.form_id)?.name || submission.form_id || '-'}</td>
                )}
                <td className="px-6 py-4">
                  <StatusBadge status={submission.status} />
                </td>
                <td className="px-6 py-4 text-gray-700">
                  {formatDate(submission.submitted_at || submission.created_at)}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowClick(submission.submission_id);
                      }}
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                    >
                      View
                    </button>
                    {onDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(submission.submission_id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete submission"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
    </>
  );
}
