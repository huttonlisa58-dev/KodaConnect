import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { normalizePhone } from '@/lib/phone-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/forms/[id]/draft?phone=XXXX
 * Look up the most recent draft submission for a form by applicant phone number.
 * Used for resuming partially completed forms.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formId } = await params;
    const phone = request.nextUrl.searchParams.get('phone');

    if (!phone) {
      return NextResponse.json(
        { error: 'phone query parameter is required' },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    const supabase = createServerSupabaseClient();

    // Find applicant by phone
    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('id')
      .eq('phone', normalizedPhone)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (applicantError || !applicant) {
      return NextResponse.json(
        { error: 'No applicant found for this phone number' },
        { status: 404 }
      );
    }

    // Find most recent draft submission for this form + applicant
    const { data: draft, error: draftError } = await supabase
      .from('form_submissions')
      .select('submission_id, form_data, updated_at, created_at')
      .eq('form_id', formId)
      .eq('applicant_id', applicant.id)
      .eq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (draftError || !draft) {
      return NextResponse.json(
        { error: 'No draft found' },
        { status: 404 }
      );
    }

    // Extract current_step from draft metadata (stored in form_data._draft_metadata)
    const draftMeta = (draft.form_data as any)?._draft_metadata;
    const currentStep = draftMeta?.current_step ?? 0;

    return NextResponse.json({
      submission_id: draft.submission_id,
      form_data: draft.form_data,
      current_step: currentStep,
      updated_at: draft.updated_at,
      applicant_id: applicant.id,
    });
  } catch (error) {
    console.error('GET /api/forms/[id]/draft error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
