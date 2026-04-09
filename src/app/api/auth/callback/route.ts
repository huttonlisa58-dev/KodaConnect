/**
 * Supabase Auth Callback Handler
 * Handles OAuth/magic link callbacks and redirects to dashboard
 *
 * Note: With password-based auth, this callback is mainly used for
 * email confirmation or password reset flows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/callback
 * Called by Supabase for auth callbacks (email confirm, password reset, etc.)
 * Exchanges the code for a session and redirects
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.redirect(new URL('/office/login?error=no_code', request.url));
    }

    const supabase = createServerSupabaseClient();

    // Exchange the code for a session
    const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError || !sessionData.user) {
      console.error('Session exchange error:', sessionError);
      return NextResponse.redirect(
        new URL('/office/login?error=invalid_code', request.url)
      );
    }

    // Redirect to the office dashboard
    return NextResponse.redirect(new URL('/office', request.url));
  } catch (error) {
    console.error('Auth callback error:', error);
    return NextResponse.redirect(
      new URL('/office/login?error=internal_error', request.url)
    );
  }
}
