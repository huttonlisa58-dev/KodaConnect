import { createServerSupabaseClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface SendTestLinkRequest {
  form_id: string;
  delivery_method: 'email' | 'sms';
  recipient: string;
}

interface SendTestLinkResponse {
  success: boolean;
  test_url: string;
  token: string;
  delivery_method: string;
}

function generateTestToken(): string {
  const random = Math.random().toString(36).substring(2, 15) +
                 Math.random().toString(36).substring(2, 15);
  return `test_${Date.now()}_${random}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Auth check
    const officeUserId = request.headers.get('x-office-user-id');
    if (!officeUserId) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing x-office-user-id header' },
        { status: 401 }
      );
    }

    // Parse request body
    const body: SendTestLinkRequest = await request.json();
    const { form_id, delivery_method, recipient } = body;

    // Validate required fields
    if (!form_id || !delivery_method || !recipient) {
      return NextResponse.json(
        { error: 'Missing required fields: form_id, delivery_method, recipient' },
        { status: 400 }
      );
    }

    // Validate delivery method
    if (!['email', 'sms'].includes(delivery_method)) {
      return NextResponse.json(
        { error: 'Invalid delivery_method. Must be "email" or "sms"' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Verify form exists
    const { data: form, error: formError } = await supabase
      .from('form_definitions')
      .select('id')
      .eq('id', form_id)
      .single();

    if (formError || !form) {
      return NextResponse.json(
        { error: `Form not found: ${form_id}` },
        { status: 404 }
      );
    }

    // Generate test token
    const testToken = generateTestToken();

    // Create test form_submission entry
    const { data: submission, error: submissionError } = await supabase
      .from('form_submissions')
      .insert({
        form_id,
        status: 'test',
        token: testToken,
        recipient_email: delivery_method === 'email' ? recipient : null,
        recipient_phone: delivery_method === 'sms' ? recipient : null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (submissionError) {
      return NextResponse.json(
        { error: `Failed to create test submission: ${submissionError.message}` },
        { status: 500 }
      );
    }

    // Build test URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const testUrl = `${appUrl}/form/${testToken}`;

    // Handle delivery method
    if (delivery_method === 'email') {
      // Placeholder for email integration
      // In production, this would call your email service
      // For now, we just return the URL
      console.log(`[PLACEHOLDER] Would send email to ${recipient} with URL: ${testUrl}`);
    } else if (delivery_method === 'sms') {
      // Placeholder for SMS integration
      // In production, this would call your SMS service
      console.log(`[PLACEHOLDER] Would send SMS to ${recipient} with URL: ${testUrl}`);
    }

    const response: SendTestLinkResponse = {
      success: true,
      test_url: testUrl,
      token: testToken,
      delivery_method,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Send test link error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
