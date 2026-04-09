export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/users/[userId]/assign-companies
 * Get all company assignments for a user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: assignments, error } = await supabaseAdmin
      .from('user_company_assignments')
      .select(`
        id,
        company_id,
        assigned_at,
        assigned_by,
        companies (id, name)
      `)
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching company assignments:', error);
      return NextResponse.json(
        { error: 'Failed to fetch company assignments' },
        { status: 500 }
      );
    }

    return NextResponse.json({ assignments: assignments || [] }, { status: 200 });
  } catch (error) {
    console.error('Error in assign-companies GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/[userId]/assign-companies
 * Set company assignments for a user (replaces all existing)
 * Body: { company_ids: string[] }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const body = await request.json();
    const { company_ids } = body;

    if (!Array.isArray(company_ids)) {
      return NextResponse.json(
        { error: 'company_ids must be an array' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Get requester info
    const assignedBy = request.headers.get('x-user-email') || 'system';

    // Delete existing assignments
    await supabaseAdmin
      .from('user_company_assignments')
      .delete()
      .eq('user_id', userId);

    // Insert new assignments
    if (company_ids.length > 0) {
      const rows = company_ids.map((companyId: string) => ({
        user_id: userId,
        company_id: companyId,
        assigned_by: assignedBy,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('user_company_assignments')
        .insert(rows);

      if (insertError) {
        console.error('Error assigning companies:', insertError);
        return NextResponse.json(
          { error: 'Failed to assign companies', details: insertError.message },
          { status: 500 }
        );
      }
    }

    // Also update legacy company_id field (use first company or null)
    await supabaseAdmin
      .from('office_users')
      .update({ company_id: company_ids[0] || null })
      .eq('id', userId);

    return NextResponse.json(
      { message: 'Companies assigned successfully', count: company_ids.length },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in assign-companies PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
