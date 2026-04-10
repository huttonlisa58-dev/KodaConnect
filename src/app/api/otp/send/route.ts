import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendVerifyOTP, sendSMS, normalizePhone } from '@/lib/twilio';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { phone, token } = await request.json();

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const normalizedPhone = normalizePhone(phone);

    // Use Twilio Verify to send OTP (works on trial accounts!)
    const verifyResult = await sendVerifyOTP(normalizedPhone);

    // Log the verification attempt
    await supabase.from('sms_log').insert({
      phone: normalizedPhone,
      message: 'Twilio Verify OTP sent',
      sms_type: 'otp',
      twilio_sid: verifyResult.sid || null,
      status: verifyResult.success ? 'sent' : 'failed',
    });

    if (!verifyResult.success) {
      return NextResponse.json(
        { error: verifyResult.error || 'Failed to send verification code' },
        { status: 500 }
      );
    }

    // If we have a token, also send the form link via regular SMS
    if (token) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://koda-connect.vercel.app';
      const formUrl = `${baseUrl}/form/${token}`;
      const linkMessage = `Complete Homecare: Please complete your form at ${formUrl}`;

      // Try to send link, but don't fail if it doesn't work (trial account limitation)
      const linkResult = await sendSMS(normalizedPhone, linkMessage);

      await supabase.from('sms_log').insert({
        phone: normalizedPhone,
        message: linkMessage,
        sms_type: 'form_link',
        twilio_sid: linkResult.sid || null,
        status: linkResult.success ? 'sent' : 'failed',
      });
    }

    // Return the form URL so frontend can show it if SMS fails
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://koda-connect.vercel.app';
    const formUrl = token ? `${baseUrl}/form/${token}` : null;

    const devMode = (verifyResult as any).dev_mode === true;
    return NextResponse.json({
      success: true,
      formUrl,
      dev_mode: devMode,
      ...(devMode && { dev_code: '123456' }),
    });
  } catch (error) {
    console.error('OTP send error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
