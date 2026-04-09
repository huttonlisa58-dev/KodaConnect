import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendTextMessage } from '@/lib/messaging';
import { normalizePhone } from '@/lib/twilio';

export const dynamic = 'force-dynamic';

/**
 * GET /api/messages
 * Get inbox (all conversations for current user's company)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id');
    const companyId = searchParams.get('company_id');

    if (!userId || !companyId) {
      return NextResponse.json(
        { error: 'user_id and company_id are required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false });

    if (error) {
      console.error('Failed to get inbox:', error);
      return NextResponse.json(
        { error: 'Failed to get inbox' },
        { status: 500 }
      );
    }

    return NextResponse.json({ conversations: conversations || [] });
  } catch (error) {
    console.error('Error in GET /api/messages:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/messages
 * Send a new message
 */
export async function POST(request: NextRequest) {
  try {
    const { to, body, from_user_id, company_id } = await request.json();

    if (!to || !body || !from_user_id || !company_id) {
      return NextResponse.json(
        { error: 'to, body, from_user_id, and company_id are required' },
        { status: 400 }
      );
    }

    // Validate phone number
    try {
      normalizePhone(to);
    } catch {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Check message length
    if (body.length === 0 || body.length > 1600) {
      return NextResponse.json(
        { error: 'Message must be between 1 and 1600 characters' },
        { status: 400 }
      );
    }

    // Send message
    const result = await sendTextMessage(to, body, from_user_id, company_id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send message' },
        { status: 500 }
      );
    }

    // Get the created message
    const supabase = createServerSupabaseClient();
    const { data: message, error: fetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', result.messageId)
      .single();

    if (fetchError) {
      console.error('Failed to fetch created message:', fetchError);
      return NextResponse.json(
        { message: { id: result.messageId, status: 'sent' } },
        { status: 201 }
      );
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/messages:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
