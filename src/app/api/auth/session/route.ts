/**
 * Session check API endpoint
 * GET: Returns current session user info using Supabase client-side auth
 * POST: Refresh/keepalive for session
 *
 * Note: Auth is primarily handled client-side via Supabase SDK.
 * This endpoint provides a server-side check using the auth token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/session
 * Returns the current authenticated user based on Supabase auth token
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    // Get the current user from Supabase auth
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { error: 'No active session' },
        { status: 401 }
      );
    }

    // Look up the office user record
    const { data: officeUser } = await supabase
      .from('office_users')
      .select('*')
      .eq('email', user.email)
      .single();

    return NextResponse.json({
      success: true,
      user: officeUser || {
        id: user.id,
        email: user.email,
        role: 'user',
      },
    });
  } catch (error) {
    console.error('Session check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/session
 * Session keepalive / refresh endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { error: 'No active session' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Session refresh error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
