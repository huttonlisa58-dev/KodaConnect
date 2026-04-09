/**
 * PUT /api/companies/[id] — Update a company (super_admin only)
 * DELETE /api/companies/[id] — Soft-delete (deactivate) a company (super_admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getAuthenticatedUser, requireRole } from '@/lib/api-auth';
import { generateSlug, validateCompanyName } from '@/lib/company-utils';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/companies/[id]
 * Update company name, logo_url, primary_color, or active status.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const supabase = createServerSupabaseClient();
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const roleError = requireRole(user, 'super_admin');
    if (roleError) return roleError;
    const body = await request.json();
    const { name, logo_url, primary_color, active } = body;

    // Validate the company exists
    const { data: existing, error: fetchError } = await supabase
      .from('companies')
      .select('id, name, slug')
      .eq('id', companyId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Build update object
    const companyUpdate: Record<string, any> = {};
    const brandUpdate: Record<string, any> = {};

    if (name !== undefined) {
      const nameError = validateCompanyName(name);
      if (nameError) {
        return NextResponse.json({ error: nameError }, { status: 400 });
      }
      companyUpdate.name = name.trim();
      companyUpdate.slug = generateSlug(name);
      brandUpdate.company_name = name.trim();
      brandUpdate.slug = companyUpdate.slug;

      // Check slug uniqueness (excluding self)
      const { data: slugConflict } = await supabase
        .from('companies')
        .select('id')
        .eq('slug', companyUpdate.slug)
        .neq('id', companyId)
        .single();

      if (slugConflict) {
        return NextResponse.json(
          { error: 'A company with a similar name already exists' },
          { status: 409 }
        );
      }
    }

    if (logo_url !== undefined) {
      companyUpdate.logo_url = logo_url;
      brandUpdate.logo_url = logo_url;
    }

    if (primary_color !== undefined) {
      brandUpdate.primary_color = primary_color;
    }

    if (active !== undefined) {
      companyUpdate.active = active;
    }

    // Update company table
    if (Object.keys(companyUpdate).length > 0) {
      const { error: updateError } = await supabase
        .from('companies')
        .update(companyUpdate)
        .eq('id', companyId);

      if (updateError) {
        console.error('Error updating company:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    // Update brand profile (if brand-related fields changed)
    if (Object.keys(brandUpdate).length > 0) {
      const { error: brandError } = await supabase
        .from('brand_profiles')
        .update(brandUpdate)
        .eq('company_id', companyId);

      if (brandError) {
        console.warn('Warning: Could not update brand profile:', brandError);
      }
    }

    // Fetch updated company
    const { data: updated } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    return NextResponse.json({ company: updated });
  } catch (error) {
    console.error('Error in PUT /api/companies/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/companies/[id]
 * Soft-delete: sets active = false.
 * Fails if the company has active users assigned.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const supabase = createServerSupabaseClient();
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const roleError = requireRole(user, 'super_admin');
    if (roleError) return roleError;

    // Check company exists
    const { data: existing } = await supabase
      .from('companies')
      .select('id, name, active')
      .eq('id', companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    if (!existing.active) {
      return NextResponse.json({ error: 'Company is already inactive' }, { status: 400 });
    }

    // Check for active users assigned to this company
    const { data: activeUsers } = await supabase
      .from('user_company_assignments')
      .select('user_id')
      .eq('company_id', companyId);

    if (activeUsers && activeUsers.length > 0) {
      // Verify at least one of these users is active
      const userIds = activeUsers.map((u: any) => u.user_id);
      const { data: activeOfficeUsers } = await supabase
        .from('office_users')
        .select('id')
        .in('id', userIds)
        .eq('active', true);

      if (activeOfficeUsers && activeOfficeUsers.length > 0) {
        return NextResponse.json(
          {
            error: `Cannot deactivate: ${activeOfficeUsers.length} active user(s) are assigned to this company. Reassign them first.`,
          },
          { status: 400 }
        );
      }
    }

    // Soft delete
    const { error: deleteError } = await supabase
      .from('companies')
      .update({ active: false })
      .eq('id', companyId);

    if (deleteError) {
      console.error('Error deactivating company:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `${existing.name} has been deactivated` });
  } catch (error) {
    console.error('Error in DELETE /api/companies/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
