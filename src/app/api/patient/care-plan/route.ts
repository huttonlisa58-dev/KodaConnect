/**
 * Patient Care Plan API
 * GET /api/patient/care-plan - Get patient's care plan
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { verifyPatientToken } from '@/lib/patient-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId');
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

    // Get care plan
    const { data: carePlan, error: carePlanError } = await supabase
      .from('care_plans')
      .select('*')
      .eq('patient_id', patientId)
      .single();

    if (carePlanError && carePlanError.code !== 'PGRST116') {
      console.error('Care plan fetch error:', carePlanError);
      return NextResponse.json(
        { error: 'Failed to fetch care plan' },
        { status: 500 }
      );
    }

    if (!carePlan) {
      return NextResponse.json(
        { error: 'Care plan not found' },
        { status: 404 }
      );
    }

    // Get assigned caregivers
    const { data: caregiverAssignments } = await supabase
      .from('caregiver_assignments')
      .select('caregiver_id, role')
      .eq('patient_id', patientId);

    // Get caregiver details
    const caregiverIds = (caregiverAssignments || []).map((a) => a.caregiver_id);
    let caregivers: Record<string, unknown>[] = [];

    if (caregiverIds.length > 0) {
      const { data: caregiverData } = await supabase
        .from('caregivers')
        .select('id, full_name, phone, role')
        .in('id', caregiverIds);

      caregivers = caregiverData || [];
    }

    // Return care plan with related data
    return NextResponse.json({
      ...carePlan,
      caregivers,
    });
  } catch (error) {
    console.error('Get care plan error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
