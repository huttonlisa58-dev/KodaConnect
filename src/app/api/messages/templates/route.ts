import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/messages/templates
 * List templates for a company
 * Query param: ?company_id=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id');

    if (!companyId) {
      return NextResponse.json(
        { error: 'company_id query parameter is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: templates, error } = await supabase
      .from('message_templates')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('category, name');

    if (error) {
      console.error('Failed to get templates:', error);
      return NextResponse.json(
        { error: 'Failed to get templates' },
        { status: 500 }
      );
    }

    return NextResponse.json({ templates: templates || [] });
  } catch (error) {
    console.error('Error in GET /api/messages/templates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/messages/templates
 * Create a new template
 */
export async function POST(request: NextRequest) {
  try {
    const { company_id, name, category, body, variables } = await request.json();

    if (!company_id || !name || !body) {
      return NextResponse.json(
        { error: 'company_id, name, and body are required' },
        { status: 400 }
      );
    }

    if (body.length === 0 || body.length > 1600) {
      return NextResponse.json(
        { error: 'Message body must be between 1 and 1600 characters' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: template, error } = await supabase
      .from('message_templates')
      .insert({
        company_id,
        name,
        category: category || 'general',
        body,
        variables: variables || [],
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create template:', error);
      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      );
    }

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/messages/templates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
