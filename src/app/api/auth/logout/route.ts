/**
 * Logout API endpoint
 * POST: Signs out the user from Supabase
 *
 * Note: Primary logout is handled client-side via getSupabase().auth.signOut()
 * This endpoint provides a server-side fallback for signing out.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout
 * Signs out the current user
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    // Sign out from Supabase
    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      console.error('Sign out error:', signOutError);
      return NextResponse.json(
        { error: 'Failed to logout' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully logged out',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
