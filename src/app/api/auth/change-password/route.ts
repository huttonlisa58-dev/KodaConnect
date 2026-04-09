export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/auth/change-password
 * Change password for the currently authenticated user.
 * Body: { current_password, new_password, email }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { current_password, new_password, email } = body;

    if (!current_password || !new_password || !email) {
      return NextResponse.json(
        { error: 'Current password, new password, and email are required' },
        { status: 400 }
      );
    }

    if (new_password.length < 6) {
      return NextResponse.json(
        { error: 'New password must be at least 6 characters' },
        { status: 400 }
      );
    }

    if (current_password === new_password) {
      return NextResponse.json(
        { error: 'New password must be different from current password' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // Step 1: Verify current password by attempting to sign in
    const tempClient = createClient(supabaseUrl, supabaseAnonKey);
    const { error: signInError } = await tempClient.auth.signInWithPassword({
      email,
      password: current_password,
    });

    if (signInError) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    // Step 2: Update password using the authenticated session
    const { error: updateError } = await tempClient.auth.updateUser({
      password: new_password,
    });

    if (updateError) {
      console.error('Password update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update password' },
        { status: 500 }
      );
    }

    // Step 3: Clear must_change_password flag
    const supabase = createServerSupabaseClient();
    await supabase
      .from('office_users')
      .update({ must_change_password: false })
      .eq('email', email.toLowerCase());

    // Sign out the temp client
    await tempClient.auth.signOut();

    return NextResponse.json(
      { message: 'Password changed successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('POST /api/auth/change-password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
