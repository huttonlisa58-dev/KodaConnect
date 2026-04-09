export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getAuthenticatedUser, requireRole } from '@/lib/api-auth';

/**
 * POST /api/users
 * Create a new office user with Supabase Auth + office_users record
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, password, role, company_id, caller_user_id, caller_user_email } = body;

    // Require admin authentication (check headers first, body fields as fallback)
    const user = await getAuthenticatedUser(request, { caller_user_id, caller_user_email });
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const roleError = requireRole(user, 'admin');
    if (roleError) return roleError;

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: 'Email, name, and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createServerSupabaseClient();

    // Step 1: Check if user already exists in office_users
    const { data: existingUser } = await supabaseAdmin
      .from('office_users')
      .select('id, email, active')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      if (!existingUser.active) {
        // Reactivate inactive user
        const { error: reactivateError } = await supabaseAdmin
          .from('office_users')
          .update({
            name,
            role: role || 'staff',
            company_id: company_id || null,
            active: true,
          })
          .eq('id', existingUser.id);

        if (reactivateError) {
          return NextResponse.json(
            { error: 'Failed to reactivate user: ' + reactivateError.message },
            { status: 500 }
          );
        }

        return NextResponse.json(
          { id: existingUser.id, message: 'User reactivated successfully' },
          { status: 200 }
        );
      }

      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      );
    }

    // Step 1b: Check if a ghost auth user exists (deleted from office_users but not from Auth)
    // If so, delete it first so we can create fresh
    const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const ghostAuth = allUsers?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (ghostAuth) {
      // Delete the ghost auth record so we can re-create
      await supabaseAdmin.auth.admin.deleteUser(ghostAuth.id);
    }

    // Step 2: Create Supabase Auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
    });

    if (authError) {
      console.error('Auth user creation error:', authError);
      return NextResponse.json(
        { error: 'Failed to create auth user: ' + authError.message },
        { status: 500 }
      );
    }

    // Step 3: Create office_users record
    const { data: officeUser, error: dbError } = await supabaseAdmin
      .from('office_users')
      .insert({
        email: email.toLowerCase(),
        name,
        role: role || 'staff',
        company_id: company_id || null,
        active: true,
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('Office user creation error:', dbError);
      // Rollback auth user
      if (authData?.user?.id) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      }
      return NextResponse.json(
        { error: 'Failed to create office user: ' + dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { id: officeUser.id, message: 'User created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/users error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users
 * Fully delete an office user (removes from office_users AND Supabase Auth)
 * Body: { userId, email }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, email, caller_user_id, caller_user_email } = body;

    // Require admin authentication (check headers first, body fields as fallback)
    const user = await getAuthenticatedUser(request, { caller_user_id, caller_user_email });
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const roleError = requireRole(user, 'admin');
    if (roleError) return roleError;

    if (!userId || !email) {
      return NextResponse.json(
        { error: 'userId and email are required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createServerSupabaseClient();

    // Step 1: Find auth user by email (with proper pagination)
    const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = allUsers?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    // Step 2: Delete from office_users
    const { error: dbError } = await supabaseAdmin
      .from('office_users')
      .delete()
      .eq('id', userId);

    if (dbError) {
      console.error('Failed to delete office user:', dbError);
      return NextResponse.json(
        { error: 'Failed to delete user: ' + dbError.message },
        { status: 500 }
      );
    }

    // Step 3: Delete company and form assignments
    await supabaseAdmin
      .from('user_company_assignments')
      .delete()
      .eq('user_id', userId);

    await supabaseAdmin
      .from('user_form_assignments')
      .delete()
      .eq('user_id', userId);

    // Step 4: Delete from Supabase Auth
    if (authUser) {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      if (authDeleteError) {
        console.error('Failed to delete auth user:', authDeleteError);
        // Don't fail — office record is already deleted
      }
    } else {
      console.warn('No auth user found for email:', email, '— office record deleted anyway');
    }

    return NextResponse.json(
      { message: 'User deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('DELETE /api/users error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
