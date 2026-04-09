import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { processInboundMessage } from '@/lib/messaging';
import twilio from 'twilio';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/twilio
 * Receives incoming SMS from Twilio
 * Validates Twilio signature, stores inbound message, updates conversation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);

    // Validate Twilio signature
    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${request.nextUrl.protocol}//${request.nextUrl.host}${request.nextUrl.pathname}`;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      console.error('Twilio credentials not configured');
      return NextResponse.json(
        { error: 'Twilio not configured' },
        { status: 500 }
      );
    }

    // Validate signature
    const isValid = twilio.validateRequest(
      authToken,
      signature,
      url,
      Object.fromEntries(params)
    );

    if (!isValid) {
      console.warn('Invalid Twilio signature');
      // Return 403 but still respond with TwiML to Twilio
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message('');
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'application/xml' },
        status: 200, // Return 200 to acknowledge to Twilio, even if invalid
      });
    }

    const from = params.get('From');
    const messageBody = params.get('Body');
    const messageSid = params.get('MessageSid');

    if (!from || !messageBody || !messageSid) {
      console.error('Missing required Twilio parameters');
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message('');
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    // Process inbound message
    const result = await processInboundMessage(from, messageBody, messageSid);

    if (!result.success) {
      console.error('Failed to process inbound message:', result.error);
    }

    // Return TwiML response
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message('');

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error) {
    console.error('Error in POST /api/webhooks/twilio:', error);

    // Still return 200 with empty TwiML to acknowledge to Twilio
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message('');

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}
