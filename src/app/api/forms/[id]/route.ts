import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { FormDefinition } from '@/lib/form-engine';

export const dynamic = 'force-dynamic';

/**
 * GET /api/forms/[id]
 * Get a single form definition by ID
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
      .select('*')
      .eq('form_id', formId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Form definition not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ form: data });
  } catch (error) {
    console.error('GET /api/forms/[id] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/forms/[id]
 * Update a form definition
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formId } = await params;
    const body = await request.json();

    const supabase = createServerSupabaseClient();

    const updateData: Partial<FormDefinition> = {
      ...body,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('form_definitions')
      .update(updateData)
      .eq('form_id', formId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update form:', error);
      return NextResponse.json(
        { error: 'Failed to update form definition' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Form definition not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ form: data });
  } catch (error) {
    console.error('PUT /api/forms/[id] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/forms/[id]
 * Archive (soft delete) a form definition
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formId } = await params;

    const supabase = createServerSupabaseClient();

    // Soft delete by setting status to 'archived'
    const { data, error } = await supabase
      .from('form_definitions')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('form_id', formId)
      .select()
      .single();

    if (error) {
      console.error('Failed to archive form:', error);
      return NextResponse.json(
        { error: 'Failed to archive form definition' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Form definition not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ form: data });
  } catch (error) {
    console.error('DELETE /api/forms/[id] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/forms/[id]
 * Soft-delete a form (set status to 'deleted').
 * Only allowed if the form has zero submissions.
 * Body: { action: 'delete' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formId } = await params;
    const body = await request.json();

    if (body.action !== 'delete') {
      return NextResponse.json(
        { error: 'Invalid action. Supported: "delete"' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Check submission count — only allow deletion if 0 submissions
    const { count, error: countError } = await supabase
      .from('form_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('form_id', formId);

    if (countError) {
      console.error('Failed to check submissions:', countError);
      return NextResponse.json(
        { error: 'Failed to verify submission count' },
        { status: 500 }
      );
    }

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Cannot delete form with ${count} submission(s). Archive it instead.` },
        { status: 409 }
      );
    }

    // Soft-delete by setting status to 'deleted'
    const { data, error } = await supabase
      .from('form_definitions')
      .update({
        status: 'deleted',
        updated_at: new Date().toISOString(),
      })
      .eq('form_id', formId)
      .select()
      .single();

    if (error) {
      console.error('Failed to delete form:', error);
      return NextResponse.json(
        { error: 'Failed to delete form' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Form definition not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ form: data, message: 'Form deleted' });
  } catch (error) {
    console.error('PATCH /api/forms/[id] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
