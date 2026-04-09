import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/messages/templates/[templateId]
 * Get a specific template
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const { templateId } = await params;

    if (!templateId) {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: template, error } = await supabase
      .from('message_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (error || !template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error in GET /api/messages/templates/[templateId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/messages/templates/[templateId]
 * Update a template
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const { templateId } = await params;
    const { name, category, body } = await request.json();

    if (!templateId) {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 }
      );
    }

    if (!name || !body) {
      return NextResponse.json(
        { error: 'name and body are required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Extract variables from body
    const variables = (body.match(/\{\{(\w+)\}\}/g) || []).map(
      (m: string) => m.slice(2, -2)
    );
    const uniqueVariables = [...new Set(variables)];

    const { data: template, error } = await supabase
      .from('message_templates')
      .update({
        name,
        category: category || 'general',
        body,
        variables: uniqueVariables,
        updated_at: new Date().toISOString(),
      })
      .eq('id', templateId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update template:', error);
      return NextResponse.json(
        { error: 'Failed to update template' },
        { status: 500 }
      );
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error in PUT /api/messages/templates/[templateId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/messages/templates/[templateId]
 * Delete a template
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const { templateId } = await params;

    if (!templateId) {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { error } = await supabase
      .from('message_templates')
      .delete()
      .eq('id', templateId);

    if (error) {
      console.error('Failed to delete template:', error);
      return NextResponse.json(
        { error: 'Failed to delete template' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/messages/templates/[templateId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
