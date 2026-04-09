/**
 * Patient Profile API
 * GET /api/patient/profile - Get patient profile
 * PUT /api/patient/profile - Update patient profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { verifyPatientToken } from '@/lib/patient-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('id');
    const authHeader = request.headers.get('authorization');

    if (!patientId || !authHeader) {
      return NextResponse.json(
        { error: 'Missing patient ID or authorization' },
        { status: 400 }
      );
    }

    // Verify token
    const token = authHeader.replace('Bearer ', '');
    const decoded = await verifyPatientToken(token);

    if (!decoded || decoded.patientId !== patientId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: patient, error } = await supabase
      .from('patients')
      .select('id, full_name, phone, email, date_of_birth, relationship, primary_insurance')
      .eq('id', patientId)
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(patient);
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const body = await request.json();

    if (!authHeader) {
      return NextResponse.json(
        { error: 'Missing authorization' },
        { status: 401 }
      );
    }

    // Verify token
    const token = authHeader.replace('Bearer ', '');
    const decoded = await verifyPatientToken(token);

    if (!decoded) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { error } = await supabase
      .from('patients')
      .update({
        full_name: body.fullName,
        email: body.email,
        date_of_birth: body.dateOfBirth,
        relationship: body.relationship,
        primary_insurance: body.insurance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', decoded.patientId);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Profile updated',
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
