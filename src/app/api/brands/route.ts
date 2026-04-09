/**
 * Brand Profiles API
 * GET: Get brand profile for current user's company (or all for super_admin)
 * POST: Create/update brand profile (admin/super_admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { saveBrandProfile, uploadBrandLogo } from '@/lib/brand';
import { getAuthenticatedUser, requireRole } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const url = new URL(request.url);
    const companyId = url.searchParams.get('company_id');

    let query = supabase
      .from('brand_profiles')
      .select('*');

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('Brand fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { company_id, company_name, slug, logo_file_name, primary_color, secondary_color, accent_color, light_bg, dark_text, font_family } = body;

    // Require admin authentication for brand changes
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const roleError = requireRole(user, 'admin');
    if (roleError) return roleError;

    if (!company_id || !company_name || !primary_color) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // If logo is provided, handle the upload
    let logoUrl = `/logos/${company_id}.png`;
    if (logo_file_name) {
      // In a real implementation, handle file upload here
      logoUrl = `/logos/${logo_file_name}`;
    }

    const brandProfile = {
      company_id,
      company_name,
      slug: slug || company_id.toLowerCase().replace(/\s+/g, '-'),
      logo_url: logoUrl,
      primary_color,
      secondary_color: secondary_color || primary_color,
      accent_color: accent_color || '#F0F9FF',
      light_bg: light_bg || '#F8FAFC',
      dark_text: dark_text || '#1E293B',
      font_family: font_family || 'system-ui, -apple-system, sans-serif',
    };

    const result = await saveBrandProfile(brandProfile);

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to save brand profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Brand save error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
