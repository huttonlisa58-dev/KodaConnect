/**
 * Authentication API endpoint for office portal login
 * POST: Authenticate with email and password
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { logLogin } from '@/lib/audit';
import { getIpFromRequest, getUserAgentFromRequest } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/login
 * Authenticates user with email and password
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Authenticate with Supabase Auth using email/password
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });

    if (authError || !authData.user) {
      await logLogin(
        email,
        getIpFromRequest(request),
        getUserAgentFromRequest(request),
        false
      );

      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify user exists in office_users table and is active
    const { data: officeUser, error: userError } = await supabase
      .from('office_users')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('active', true)
      .single();

    if (userError || !officeUser) {
      // Sign out since they're not an authorized office user
      await supabase.auth.signOut();
      await logLogin(
        email,
        getIpFromRequest(request),
        getUserAgentFromRequest(request),
        false
      );

      return NextResponse.json(
        { error: 'You are not authorized to access the office portal' },
        { status: 403 }
      );
    }

    // Log successful login
    await logLogin(
      email,
      getIpFromRequest(request),
      getUserAgentFromRequest(request),
      true
    );

    return NextResponse.json({
      success: true,
      user: officeUser,
      must_change_password: officeUser.must_change_password || false,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
