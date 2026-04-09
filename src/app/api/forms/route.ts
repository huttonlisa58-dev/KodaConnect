import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { FormDefinition } from '@/lib/form-engine';
import { getAuthenticatedUser } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/forms
 * List all form definitions, optionally filtered by company_id
 * Enforces company-based access control when auth headers are present
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('company_id');
    const status = searchParams.get('status');

    const supabase = createServerSupabaseClient();

    let query = supabase.from('form_definitions').select('*').order('created_at', { ascending: false });

    // --- Company-based access control ---
    const user = await getAuthenticatedUser(request);
    if (user && user.role !== 'super_admin') {
      // Build list of accessible companies (multi-company assignments + legacy fallback)
      const accessibleCompanies = user.assigned_companies.length > 0
        ? user.assigned_companies
        : user.company_id ? [user.company_id] : [];

      if (accessibleCompanies.length > 0) {
        query = query.in('company_id', accessibleCompanies);
      } else {
        // User has no company assignments — return empty
        return NextResponse.json({ forms: [] });
      }
    }

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    if (status) {
      query = query.eq('status', status);
    } else {
      // By default, exclude soft-deleted forms from listings
      query = query.neq('status', 'deleted');
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch forms:', error);
      return NextResponse.json(
        { error: 'Failed to fetch form definitions' },
        { status: 500 }
      );
    }

    return NextResponse.json({ forms: data || [] });
  } catch (error) {
    console.error('GET /api/forms error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/forms
 * Create a new form definition
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { form_name, company_id, version = '1.0', description, status = 'draft', sections = [] } = body;

    if (!form_name) {
      return NextResponse.json(
        { error: 'form_name is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // If company_id is 'default' or not a valid UUID, try to look it up
    let resolvedCompanyId = company_id;
    if (!company_id || company_id === 'default' || company_id.length < 36) {
      // Try to get the first company from the database
      const { data: companies } = await supabase
        .from('companies')
        .select('id')
        .limit(1)
        .single();
      if (companies) {
        resolvedCompanyId = companies.id;
      }
    }

    // Generate form_id
    const form_id = `form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const formDefinition: FormDefinition = {
      form_id,
      form_name,
      version,
      company_id: resolvedCompanyId,
      description,
      status,
      sections,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('form_definitions')
      .insert([formDefinition])
      .select()
      .single();

    if (error) {
      console.error('Failed to create form:', error);
      return NextResponse.json(
        { error: 'Failed to create form definition' },
        { status: 500 }
      );
    }

    return NextResponse.json({ form: data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/forms error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
