import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendBulkMessages } from '@/lib/messaging';

export const dynamic = 'force-dynamic';

/**
 * POST /api/messages/bulk
 * Send message to multiple recipients
 * Body: { recipients: string[], body: string, from_user_id: string, company_id: string, template_id?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { recipients, body, from_user_id, company_id, template_id } =
      await request.json();

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'recipients array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'string') {
      return NextResponse.json(
        { error: 'body is required and must be a string' },
        { status: 400 }
      );
    }

    if (!from_user_id || !company_id) {
      return NextResponse.json(
        { error: 'from_user_id and company_id are required' },
        { status: 400 }
      );
    }

    // Validate message length
    if (body.length === 0 || body.length > 1600) {
      return NextResponse.json(
        { error: 'Message must be between 1 and 1600 characters' },
        { status: 400 }
      );
    }

    // Validate recipient count
    if (recipients.length > 1000) {
      return NextResponse.json(
        { error: 'Cannot send to more than 1000 recipients at once' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Log bulk send job
    const jobId = crypto.randomUUID();
    const { error: jobError } = await supabase.from('bulk_send_jobs').insert({
      id: jobId,
      company_id,
      initiated_by: from_user_id,
      recipient_count: recipients.length,
      message_body: body,
      template_id,
      status: 'processing',
    });

    if (jobError) {
      console.error('Failed to create bulk send job:', jobError);
    }

    // Send messages with rate limiting (max 1 per second)
    const result = await sendBulkMessages(recipients, body, from_user_id, company_id, 1);

    // Update job status
    if (jobError === null) {
      const finalStatus = result.failed === 0 ? 'completed' : 'completed_with_errors';
      await supabase
        .from('bulk_send_jobs')
        .update({
          status: finalStatus,
          sent_count: result.sent,
          failed_count: result.failed,
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }

    return NextResponse.json({
      job_id: jobId,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Error in POST /api/messages/bulk:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/messages/bulk
 * Get bulk send job status
 * Query param: ?job_id=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get('job_id');

    if (!jobId) {
      return NextResponse.json(
        { error: 'job_id query parameter is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: job, error } = await supabase
      .from('bulk_send_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error('Error in GET /api/messages/bulk:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
