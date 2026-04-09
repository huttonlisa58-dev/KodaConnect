/**
 * Caregivers API
 * GET: List caregivers with filters (status, area, company)
 * POST: Create new caregiver (admin adds manually)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sanitizePostgrestInput } from '@/lib/supabase-utils';
import { getAuthenticatedUser } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

interface CaregiverFilters {
  status?: 'active' | 'onboarding' | 'inactive';
  area?: string;
  company_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    // Require authentication
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const url = new URL(request.url);

    // Parse filters
    const filters: CaregiverFilters = {
      status: (url.searchParams.get('status') as any) || undefined,
      area: url.searchParams.get('area') || undefined,
      company_id: url.searchParams.get('company_id') || undefined,
      search: url.searchParams.get('search') || undefined,
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '20'),
    };

    let query = supabase
      .from('caregivers')
      .select(
        `
        id,
        full_name,
        phone,
        email,
        status,
        areas,
        company_id,
        onboarding_progress,
        created_at,
        credentials(id, credential_type, expiry_date)
      `,
        { count: 'exact' }
      );

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.area) {
      query = query.contains('areas', [filters.area]);
    }

    if (filters.company_id) {
      query = query.eq('company_id', filters.company_id);
    }

    if (filters.search) {
      const s = sanitizePostgrestInput(filters.search);
      query = query.or(
        `full_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`
      );
    }

    // Pagination
    const offset = (filters.page! - 1) * filters.limit!;
    query = query.range(offset, offset + filters.limit! - 1);

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Format response
    const caregivers = (data || []).map((caregiver: any) => {
      const credentials = caregiver.credentials || [];
      const now = new Date();

      const credentialStatus = credentials.reduce(
        (acc: any, cred: any) => {
          const expiryDate = new Date(cred.expiry_date);
          const daysUntilExpiry = Math.ceil(
            (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysUntilExpiry < 0) {
            acc.expired += 1;
          } else if (daysUntilExpiry < 30) {
            acc.expiring += 1;
          } else {
            acc.current += 1;
          }
          return acc;
        },
        { current: 0, expiring: 0, expired: 0 }
      );

      return {
        id: caregiver.id,
        full_name: caregiver.full_name,
        phone: caregiver.phone,
        email: caregiver.email,
        status: caregiver.status,
        areas: caregiver.areas || [],
        onboarding_progress: caregiver.onboarding_progress || 0,
        credentials_status: credentialStatus,
        created_at: caregiver.created_at,
      };
    });

    return NextResponse.json({
      success: true,
      data: caregivers,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / filters.limit!),
      },
    });
  } catch (error) {
    console.error('Caregivers list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { full_name, phone, email, areas, company_id } = body;

    // Require authentication
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!full_name || !phone) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('caregivers')
      .insert({
        full_name,
        phone,
        email: email || null,
        areas: areas || [],
        company_id: company_id || null,
        status: 'onboarding',
        onboarding_progress: 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Caregiver creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
