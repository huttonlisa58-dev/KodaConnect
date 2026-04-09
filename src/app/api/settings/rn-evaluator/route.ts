import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getAuthenticatedUser, hasMinimumRole } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/settings/rn-evaluator?form_id=xxx
 * Fetch RN evaluator metadata for a specific form.
 * Requires: super_admin role
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasMinimumRole(user, 'super_admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Super admin required.' }, { status: 403 });
    }

    const formId = request.nextUrl.searchParams.get('form_id');
    if (!formId) {
      return NextResponse.json({ error: 'form_id is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: formDef, error } = await supabase
      .from('form_definitions')
      .select('form_id, form_name, metadata')
      .eq('form_id', formId)
      .single();

    if (error || !formDef) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const metadata = formDef.metadata || {};
    return NextResponse.json({
      form_id: formDef.form_id,
      form_name: formDef.form_name,
      rn_evaluator_initials: metadata.rn_evaluator_initials || '',
      rn_evaluator_name: metadata.rn_evaluator_name || '',
      rn_license_number: metadata.rn_license_number || '',
      rn_evaluator_signature: metadata.rn_evaluator_signature || '',
    });
  } catch (error) {
    console.error('GET /api/settings/rn-evaluator error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/settings/rn-evaluator
 * Update RN evaluator metadata for a specific form.
 * Requires: super_admin role
 *
 * Body: {
 *   form_id: string,
 *   rn_evaluator_initials?: string,
 *   rn_evaluator_name?: string,
 *   rn_license_number?: string,
 *   rn_evaluator_signature?: string  // base64 data URI
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasMinimumRole(user, 'super_admin')) {
      return NextResponse.json({ error: 'Insufficient permissions. Super admin required.' }, { status: 403 });
    }

    const body = await request.json();
    const { form_id, rn_evaluator_initials, rn_evaluator_name, rn_license_number, rn_evaluator_signature } = body;

    if (!form_id) {
      return NextResponse.json({ error: 'form_id is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Fetch existing form to preserve other metadata
    const { data: formDef, error: fetchError } = await supabase
      .from('form_definitions')
      .select('metadata')
      .eq('form_id', form_id)
      .single();

    if (fetchError || !formDef) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    // Merge RN evaluator fields into existing metadata
    const updatedMetadata = {
      ...(formDef.metadata || {}),
      rn_evaluator_initials: rn_evaluator_initials || '',
      rn_evaluator_name: rn_evaluator_name || '',
      rn_license_number: rn_license_number || '',
      // Only update signature if provided (it's a large base64 string)
      ...(rn_evaluator_signature !== undefined && { rn_evaluator_signature }),
    };

    const { error: updateError } = await supabase
      .from('form_definitions')
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('form_id', form_id);

    if (updateError) {
      console.error('Error updating RN evaluator settings:', updateError);
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      form_id,
      rn_evaluator_initials: updatedMetadata.rn_evaluator_initials,
      rn_evaluator_name: updatedMetadata.rn_evaluator_name,
      rn_license_number: updatedMetadata.rn_license_number,
    });
  } catch (error) {
    console.error('PUT /api/settings/rn-evaluator error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
