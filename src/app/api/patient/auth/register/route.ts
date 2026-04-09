/**
 * Patient Auth API - Register
 * POST /api/patient/auth/register
 * Creates new patient account with OTP verification
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
    const {
      fullName,
      phone,
      email,
      dateOfBirth,
      relationship,
      insurance,
      otp,
    } = body;

    // Validation
    if (!fullName || !phone || !dateOfBirth || !otp) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    // Check if patient already exists
    const { data: existingPatient } = await supabase
      .from('patients')
      .select('id')
      .eq('phone', normalizedPhone)
      .single();

    if (existingPatient) {
      return NextResponse.json(
        { error: 'Patient already registered with this phone number' },
        { status: 409 }
      );
    }

    // Create new patient
    const patientId = uuidv4();
    const now = new Date().toISOString();

    const { error: insertError } = await supabase
      .from('patients')
      .insert({
        id: patientId,
        full_name: fullName,
        phone: normalizedPhone,
        email: email || null,
        date_of_birth: dateOfBirth,
        relationship,
        primary_insurance: insurance || null,
        auth_type: 'otp',
        created_at: now,
        updated_at: now,
      });

    if (insertError) {
      console.error('Patient insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create patient account' },
        { status: 500 }
      );
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
      message: 'Registration successful',
    });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
