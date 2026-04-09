import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sanitizePostgrestInput } from '@/lib/supabase-utils';
import { normalizePhone } from '@/lib/twilio';

export const dynamic = 'force-dynamic';

/**
 * GET /api/messages/[phone]
 * Get all messages with a specific phone number
 * Query param: ?company_id=xxx
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id');
    const { phone } = await params;

    if (!companyId) {
      return NextResponse.json(
        { error: 'company_id query parameter is required' },
        { status: 400 }
      );
    }

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Normalize phone number
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhone(phone);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Get all messages in this conversation
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('company_id', companyId)
      .or(
        `and(from_phone.eq.${sanitizePostgrestInput(normalizedPhone)},to_phone.eq.${process.env.TWILIO_PHONE_NUMBER}),and(from_phone.eq.${process.env.TWILIO_PHONE_NUMBER},to_phone.eq.${sanitizePostgrestInput(normalizedPhone)})`
      )
      .order('sent_at', { ascending: true });

    if (error) {
      console.error('Failed to get conversation messages:', error);
      return NextResponse.json(
        { error: 'Failed to get messages' },
        { status: 500 }
      );
    }

    return NextResponse.json({ messages: messages || [] });
  } catch (error) {
    console.error('Error in GET /api/messages/[phone]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
