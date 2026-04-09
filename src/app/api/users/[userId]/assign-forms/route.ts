export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/users/[userId]/assign-forms
 * Get all form assignments for a user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: assignments, error } = await supabaseAdmin
      .from('user_form_assignments')
      .select(`
        id,
        form_id,
        assigned_at,
        assigned_by,
        form_definitions (form_id, form_name, company_id)
      `)
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching form assignments:', error);
      return NextResponse.json(
        { error: 'Failed to fetch form assignments' },
        { status: 500 }
      );
    }

    return NextResponse.json({ assignments: assignments || [] }, { status: 200 });
  } catch (error) {
    console.error('Error in assign-forms GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/[userId]/assign-forms
 * Set form assignments for a user (replaces all existing)
 * Body: { form_ids: string[] }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const body = await request.json();
    const { form_ids } = body;

    if (!Array.isArray(form_ids)) {
      return NextResponse.json(
        { error: 'form_ids must be an array' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Get requester info
    const assignedBy = request.headers.get('x-user-email') || 'system';

    // Delete existing assignments
    await supabaseAdmin
      .from('user_form_assignments')
      .delete()
      .eq('user_id', userId);

    // Insert new assignments
    if (form_ids.length > 0) {
      const rows = form_ids.map((formId: string) => ({
        user_id: userId,
        form_id: formId,
        assigned_by: assignedBy,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('user_form_assignments')
        .insert(rows);

      if (insertError) {
        console.error('Error assigning forms:', insertError);
        return NextResponse.json(
          { error: 'Failed to assign forms', details: insertError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { message: 'Forms assigned successfully', count: form_ids.length },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in assign-forms PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
