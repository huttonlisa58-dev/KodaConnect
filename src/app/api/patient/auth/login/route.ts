/**
 * Patient Auth API - Login
 * POST /api/patient/auth/login
 * Verifies OTP and creates patient session
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { checkVerifyOTP, normalizePhone } from '@/lib/twilio';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, otp } = body;

    if (!phone || !otp) {
      return NextResponse.json(
        { error: 'Phone and OTP are required' },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);

    // Verify OTP with Twilio
    const verifyResult = await checkVerifyOTP(normalizedPhone, otp);

    if (!verifyResult.success || !verifyResult.valid) {
      return NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 401 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Find or create patient
    const { data: existingPatient, error: fetchError } = await supabase
      .from('patients')
      .select('id')
      .eq('phone', normalizedPhone)
      .single();

    let patientId: string;

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 means not found, which is fine
      console.error('Patient fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      );
    }

    if (existingPatient) {
      patientId = existingPatient.id;
    } else {
      // Create new patient record
      const newPatientId = uuidv4();
      const { error: insertError } = await supabase
        .from('patients')
        .insert({
          id: newPatientId,
          phone: normalizedPhone,
          auth_type: 'otp',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('Patient insert error:', insertError);
        return NextResponse.json(
          { error: 'Failed to create patient record' },
          { status: 500 }
        );
      }

      patientId = newPatientId;
    }

    // Generate JWT token
    const token = jwt.sign(
      { patientId, phone: normalizedPhone },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    return NextResponse.json({
      success: true,
      token,
      patient_id: patientId,
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
