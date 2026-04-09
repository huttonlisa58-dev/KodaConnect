import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/caregivers/search
 * Search for caregivers by name, email, or phone
 * Query param: ?q=search_query
 */
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('q');
    const companyId = request.nextUrl.searchParams.get('company_id');

    if (!query || query.length < 2) {
      return NextResponse.json(
        { results: [] }
      );
    }

    const supabase = createServerSupabaseClient();

    // Search in caregivers table
    let baseQuery = supabase
      .from('caregivers')
      .select('id, full_name, phone, email, company_id')
      .eq('is_active', true);

    if (companyId) {
      baseQuery = baseQuery.eq('company_id', companyId);
    }

    const { data: caregivers, error } = await baseQuery.limit(20);

    if (error) {
      console.error('Failed to search caregivers:', error);
      return NextResponse.json(
        { error: 'Failed to search caregivers' },
        { status: 500 }
      );
    }

    // Filter results client-side (in real app, use full-text search in Supabase)
    const searchLower = query.toLowerCase();
    const results = (caregivers || []).filter(
      caregiver =>
        caregiver.full_name.toLowerCase().includes(searchLower) ||
        (caregiver.email && caregiver.email.toLowerCase().includes(searchLower)) ||
        (caregiver.phone && caregiver.phone.includes(query))
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Error in GET /api/caregivers/search:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
