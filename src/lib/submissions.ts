export interface FormSubmission {
  submission_id: string;
  form_id: string;
  applicant_id: string;
  form_data: Record<string, any>;
  original_form_data?: Record<string, any> | null;
  status: 'submitted' | 'finalized' | 'approved' | 'rejected';
  submitted_at: string;
  created_at: string;
  updated_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  notes?: string | null;
  applicant_name?: string | null;
  applicant_phone?: string | null;
  applicant_email?: string | null;
  form_name?: string | null;
}

/**
 * Get Tailwind CSS class for submission status
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'submitted':
      return 'bg-yellow-100 text-yellow-800';
    case 'finalized':
      return 'bg-teal-100 text-teal-800';
    case 'approved':
      return 'bg-green-100 text-green-800';
    case 'rejected':
      return 'bg-red-100 text-red-800';
    case 'pending_client':
      return 'bg-blue-100 text-blue-800';
    case 'draft':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Get display label for submission status
 */
export function getStatusLabel(status: string): string {
  switch (status) {
    case 'submitted':
      return 'Submitted';
    case 'finalized':
      return 'Finalized';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'pending_client':
      return 'Pending Client';
    case 'draft':
      return 'Draft';
    default:
      return 'Unknown';
  }
}

/**
 * Format date string to readable format (e.g., "Feb 8, 2026")
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}
