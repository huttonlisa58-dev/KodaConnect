import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * GET /api/companies/list
 * Returns all active companies for dropdowns/selectors.
 * Requires x-office-user-id header (set by office client from localStorage session).
 */
export async function GET(request: NextRequest) {
  try {
    // Basic auth gate — require office user ID header
    const officeUserId = request.headers.get('x-office-user-id');
    if (!officeUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, logo_url, primary_color, slug')
      .eq('active', true)
      .order('name');

    if (error) {
      console.error('Failed to fetch companies:', error);
      return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
    }

    const response = NextResponse.json({ companies: data || [] });
    // Prevent any caching at Vercel edge or CDN level
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    response.headers.set('CDN-Cache-Control', 'no-store');
    response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error('Companies list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
