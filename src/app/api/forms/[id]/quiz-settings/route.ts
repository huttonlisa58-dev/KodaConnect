import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/forms/[id]/quiz-settings
 * Get quiz/training settings from form metadata
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formId } = await params;
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('form_definitions')
      .select('form_id, form_name, metadata')
      .eq('form_id', formId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const metadata = data.metadata || {};

    return NextResponse.json({
      form_id: data.form_id,
      form_name: data.form_name,
      quiz_settings: {
        auto_grade: metadata.auto_grade ?? false,
        passing_score: metadata.passing_score ?? 70,
        sequential_sections: metadata.sequential_sections ?? false,
        retake_enabled: metadata.retake_enabled ?? true,
        total_questions: metadata.total_questions ?? 0,
      },
    });
  } catch (error) {
    console.error('GET /api/forms/[id]/quiz-settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/forms/[id]/quiz-settings
 * Update quiz/training settings in form metadata
 * Only super_admin can access this.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formId } = await params;
    const body = await request.json();
    const supabase = createServerSupabaseClient();

    // Fetch current metadata
    const { data: existing, error: fetchErr } = await supabase
      .from('form_definitions')
      .select('metadata')
      .eq('form_id', formId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const currentMetadata = existing.metadata || {};

    // Only allow updating specific quiz-related fields
    const allowedKeys = ['passing_score', 'sequential_sections', 'retake_enabled'];
    const updates: Record<string, any> = {};
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    // Validate passing_score range
    if (updates.passing_score !== undefined) {
      const score = Number(updates.passing_score);
      if (isNaN(score) || score < 1 || score > 100) {
        return NextResponse.json(
          { error: 'Passing score must be between 1 and 100' },
          { status: 400 }
        );
      }
      updates.passing_score = score;
    }

    const newMetadata = { ...currentMetadata, ...updates };

    const { error: updateErr } = await supabase
      .from('form_definitions')
      .update({
        metadata: newMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('form_id', formId);

    if (updateErr) {
      console.error('Update error:', updateErr);
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      quiz_settings: {
        auto_grade: newMetadata.auto_grade ?? false,
        passing_score: newMetadata.passing_score ?? 70,
        sequential_sections: newMetadata.sequential_sections ?? false,
        retake_enabled: newMetadata.retake_enabled ?? true,
        total_questions: newMetadata.total_questions ?? 0,
      },
    });
  } catch (error) {
    console.error('PATCH /api/forms/[id]/quiz-settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
