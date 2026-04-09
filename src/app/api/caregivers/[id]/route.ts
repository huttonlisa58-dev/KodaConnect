/**
 * Single Caregiver API
 * GET: Full caregiver profile with forms, credentials, messages
 * PUT: Update caregiver details
 * DELETE: Deactivate caregiver (soft delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerSupabaseClient();
    const { id } = await params;

    // Get caregiver profile
    const { data: caregiver, error: caregiverError } = await supabase
      .from('caregivers')
      .select('*')
      .eq('id', id)
      .single();

    if (caregiverError || !caregiver) {
      return NextResponse.json(
        { error: 'Caregiver not found' },
        { status: 404 }
      );
    }

    // Get credentials
    const { data: credentials } = await supabase
      .from('credentials')
      .select('*')
      .eq('caregiver_id', id);

    // Get form submissions
    const { data: submissions } = await supabase
      .from('submissions')
      .select(
        `
        id,
        template:document_templates(name),
        status,
        created_at,
        filled_pdf_url
      `
      )
      .eq('caregiver_id', id)
      .order('created_at', { ascending: false });

    // Get messages
    const { data: messages } = await supabase
      .from('sms_log')
      .select('*')
      .eq('caregiver_id', id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Get activity log
    const { data: activity } = await supabase
      .from('activity_log')
      .select('*')
      .eq('caregiver_id', id)
      .order('created_at', { ascending: false })
      .limit(20);

    return NextResponse.json({
      success: true,
      data: {
        profile: caregiver,
        credentials: credentials || [],
        submissions: submissions || [],
        messages: messages || [],
        activity: activity || [],
      },
    });
  } catch (error) {
    console.error('Caregiver fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerSupabaseClient();
    const { id } = await params;
    const body = await request.json();

    // Allowed fields to update
    const allowedFields = ['full_name', 'phone', 'email', 'status', 'areas', 'onboarding_progress'];
    const updateData: Record<string, any> = {};

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('caregivers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Caregiver update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerSupabaseClient();
    const { id } = await params;

    // Soft delete - set status to inactive
    const { data, error } = await supabase
      .from('caregivers')
      .update({ status: 'inactive' })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Caregiver delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
