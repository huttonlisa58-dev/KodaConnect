import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * POST /api/forms/[id]/create-link
 * Generate a shareable access link for a form
 *
 * Body: { applicant_name?: string, applicant_phone?: string, expires_hours?: number }
 *
 * Returns: { token, url, expires_at }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formId } = await params;
    const body = await request.json();
    const {
      applicant_name = 'Test Applicant',
      applicant_phone = '',
      expires_hours = 72,
    } = body;

    const supabase = createServerSupabaseClient();

    // Verify the form exists
    const { data: formDef, error: formError } = await supabase
      .from('form_definitions')
      .select('form_id, form_name, company_id')
      .eq('form_id', formId)
      .single();

    if (formError || !formDef) {
      return NextResponse.json(
        { error: 'Form not found' },
        { status: 404 }
      );
    }

    // Create or find applicant
    let applicantId: string | null = null;

    if (applicant_phone) {
      // Check if applicant exists by phone
      const { data: existingApplicant } = await supabase
        .from('applicants')
        .select('id')
        .eq('phone', applicant_phone)
        .limit(1)
        .single();

      if (existingApplicant) {
        applicantId = existingApplicant.id;
      }
    }

    if (!applicantId) {
      // Create a new applicant
      const { data: newApplicant, error: applicantError } = await supabase
        .from('applicants')
        .insert({
          full_name: applicant_name,
          phone: applicant_phone || null,
          email: null,
          status: 'pending',
          company_id: formDef.company_id,
        })
        .select('id')
        .single();

      if (applicantError) {
        console.error('Failed to create applicant:', applicantError);
        return NextResponse.json(
          { error: 'Failed to create applicant record' },
          { status: 500 }
        );
      }

      applicantId = newApplicant.id;
    }

    // Generate a unique token
    const token = uuidv4().replace(/-/g, '').substring(0, 24);
    const expiresAt = new Date(Date.now() + expires_hours * 60 * 60 * 1000).toISOString();

    // Create the access token
    const { data: accessToken, error: tokenError } = await supabase
      .from('access_tokens')
      .insert({
        token,
        form_id: formId,
        applicant_id: applicantId,
        expires_at: expiresAt,
        is_active: true,
      })
      .select()
      .single();

    if (tokenError) {
      console.error('Failed to create access token:', tokenError);
      return NextResponse.json(
        { error: 'Failed to create access link', details: tokenError.message },
        { status: 500 }
      );
    }

    // Build the URL
    const baseUrl = request.headers.get('origin') || request.headers.get('host') || '';
    const protocol = baseUrl.startsWith('http') ? '' : 'https://';
    const formUrl = `${protocol}${baseUrl}/form/${token}`;

    return NextResponse.json({
      token,
      url: formUrl,
      expires_at: expiresAt,
      applicant_id: applicantId,
    });
  } catch (error) {
    console.error('POST /api/forms/[id]/create-link error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
