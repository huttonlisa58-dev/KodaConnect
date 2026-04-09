export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/submissions/[submissionId]/changes-pdf
 * Generate a changelog PDF showing all staff modifications
 *
 * Format: Sequential changelog
 * "Field X changed from A to B on [date] by [staff]"
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await params;
    const body = await request.json();
    const { applicant_name, form_name } = body;

    const supabase = createServerSupabaseClient();

    // Fetch edit history
    const { data: history, error: histError } = await supabase
      .from('submission_edit_history')
      .select('*')
      .eq('submission_id', submissionId)
      .order('edited_at', { ascending: true });

    if (histError) {
      console.error('Error fetching edit history:', histError);
      return NextResponse.json(
        { error: 'Failed to fetch edit history' },
        { status: 500 }
      );
    }

    if (!history || history.length === 0) {
      return NextResponse.json(
        { error: 'No edit history found for this submission' },
        { status: 404 }
      );
    }

    // Fetch submission for context
    const { data: submission } = await supabase
      .from('form_submissions')
      .select('submitted_at, form_id')
      .eq('submission_id', submissionId)
      .single();

    // Build HTML for PDF generation
    const htmlContent = buildChangelogHTML({
      applicantName: applicant_name || 'Unknown Applicant',
      formName: form_name || 'Form Submission',
      submissionId,
      submittedAt: submission?.submitted_at || '',
      history,
    });

    // Return HTML that the frontend can print/save as PDF
    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error generating changes PDF:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

interface ChangelogEntry {
  id: string;
  field_id: string;
  field_label: string | null;
  old_value: any;
  new_value: any;
  edited_by: string;
  edited_at: string;
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && value.startsWith('data:image')) return '[Signature Image]';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function buildChangelogHTML(params: {
  applicantName: string;
  formName: string;
  submissionId: string;
  submittedAt: string;
  history: ChangelogEntry[];
}): string {
  const { applicantName, formName, submissionId, submittedAt, history } = params;

  const rows = history.map((entry, index) => {
    const label = entry.field_label || entry.field_id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const oldVal = formatValue(entry.old_value);
    const newVal = formatValue(entry.new_value);

    return `
      <tr style="${index % 2 === 0 ? '' : 'background-color: #f9fafb;'}">
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151;">
          ${index + 1}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151;">
          ${formatDate(entry.edited_at)}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; font-weight: 600; color: #1f2937;">
          ${label}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #dc2626; text-decoration: line-through;">
          ${oldVal}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #15803d; font-weight: 500;">
          ${newVal}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">
          ${entry.edited_by}
        </td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Changes Log - ${applicantName}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 40px;
      color: #1f2937;
    }
  </style>
</head>
<body>
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="font-size: 22px; color: #1e3a5f; margin-bottom: 4px;">Staff Changes Log</h1>
    <h2 style="font-size: 16px; color: #6b7280; font-weight: 400; margin-top: 0;">Submission Edit History</h2>
  </div>

  <div style="display: flex; gap: 40px; margin-bottom: 24px; font-size: 14px;">
    <div>
      <span style="color: #6b7280;">Applicant:</span>
      <strong>${applicantName}</strong>
    </div>
    <div>
      <span style="color: #6b7280;">Form:</span>
      <strong>${formName}</strong>
    </div>
    <div>
      <span style="color: #6b7280;">Submitted:</span>
      <strong>${submittedAt ? formatDate(submittedAt) : 'N/A'}</strong>
    </div>
  </div>

  <div style="margin-bottom: 16px; padding: 12px 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; font-size: 13px; color: #1e40af;">
    This document records ${history.length} change(s) made by office staff to the applicant's original submission.
    Submission ID: <code style="background: #dbeafe; padding: 2px 6px; border-radius: 4px;">${submissionId.slice(0, 8)}...</code>
  </div>

  <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px;">
    <thead>
      <tr style="background-color: #1e3a5f;">
        <th style="padding: 10px 12px; text-align: left; color: white; font-size: 12px; font-weight: 600;">#</th>
        <th style="padding: 10px 12px; text-align: left; color: white; font-size: 12px; font-weight: 600;">Date & Time</th>
        <th style="padding: 10px 12px; text-align: left; color: white; font-size: 12px; font-weight: 600;">Field</th>
        <th style="padding: 10px 12px; text-align: left; color: white; font-size: 12px; font-weight: 600;">Original Value</th>
        <th style="padding: 10px 12px; text-align: left; color: white; font-size: 12px; font-weight: 600;">New Value</th>
        <th style="padding: 10px 12px; text-align: left; color: white; font-size: 12px; font-weight: 600;">Changed By</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center;">
    Generated ${new Date().toLocaleString('en-US')} | Confidential
  </div>

  <div class="no-print" style="text-align: center; margin-top: 20px;">
    <button onclick="window.print()" style="padding: 10px 24px; background: #1e3a5f; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>`;
}
