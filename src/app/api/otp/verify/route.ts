import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { checkVerifyOTP, normalizePhone } from '@/lib/twilio';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { phone, code, name, token: accessToken } = await request.json();

    if (!phone || !code) {
      return NextResponse.json(
        { error: 'Phone and code are required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const normalizedPhone = normalizePhone(phone);

    // Verify OTP using Twilio Verify
    const verifyResult = await checkVerifyOTP(normalizedPhone, code);

    if (!verifyResult.success || !verifyResult.valid) {
      return NextResponse.json(
        { error: verifyResult.error || 'Invalid or expired verification code' },
        { status: 400 }
      );
    }

    // Find applicant by phone or access token
    let applicant = null;

    if (accessToken) {
      // Look up by access token
      const { data: tokenData } = await supabase
        .from('access_tokens')
        .select('*, applicant:applicants(*)')
        .eq('token', accessToken)
        .single();

      if (tokenData?.applicant) {
        applicant = tokenData.applicant;
      }
    }

    if (!applicant) {
      // Look up by phone
      const { data: phoneApplicant } = await supabase
        .from('applicants')
        .select('*')
        .eq('phone', normalizedPhone)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      applicant = phoneApplicant;
    }

    if (!applicant && name) {
      // Create new applicant
      const { data: newApplicant, error: createError } = await supabase
        .from('applicants')
        .insert({
          full_name: name,
          phone: normalizedPhone,
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json(
          { error: 'Failed to create applicant record' },
          { status: 500 }
        );
      }
      applicant = newApplicant;
    }

    if (!applicant) {
      return NextResponse.json(
        { error: 'Applicant not found. Please provide your name.' },
        { status: 400 }
      );
    }

    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString('hex');

    return NextResponse.json({
      success: true,
      applicant: {
        id: applicant.id,
        full_name: applicant.full_name,
        phone: applicant.phone,
      },
      sessionToken,
    });
  } catch (error) {
    console.error('OTP verify error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
