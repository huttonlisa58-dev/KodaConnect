import { createServerSupabaseClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

interface Company {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  accent_color: string
  active: boolean
  created_at: string
  updated_at: string
}

interface CreateCompanyRequest {
  name: string
  primary_color?: string
  secondary_color?: string
  accent_color?: string
  logo_url?: string
}

interface UpdateCompanyRequest {
  id: string
  name?: string
  slug?: string
  primary_color?: string
  secondary_color?: string
  accent_color?: string
  logo_url?: string
}

interface DeleteCompanyRequest {
  id: string
}

// Helper function to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

// GET: List all companies
async function handleGet(req: NextRequest) {
  try {
    const userId = req.headers.get('x-office-user-id')
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing x-office-user-id header' },
        { status: 401 }
      )
    }

    const supabase = await createServerSupabaseClient()

    const { data: companies, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error fetching companies:', error)
      return NextResponse.json(
        { error: 'Failed to fetch companies' },
        { status: 500 }
      )
    }

    // Fetch counts for users, forms, and submissions per company
    const companyIds = (companies || []).map((c: any) => c.id)

    // User counts from office_users
    const { data: userCounts } = await supabase
      .from('office_users')
      .select('company_id')
      .eq('active', true)
      .in('company_id', companyIds)

    // Form counts from form_definitions
    const { data: formCounts } = await supabase
      .from('form_definitions')
      .select('company_id')
      .in('company_id', companyIds)

    // Submission counts from form_submissions via form_definitions
    const { data: submissionCounts } = await supabase
      .from('form_submissions')
      .select('form_id, form_definitions!inner(company_id)')

    // Build count maps
    const userCountMap: Record<string, number> = {}
    const formCountMap: Record<string, number> = {}
    const submissionCountMap: Record<string, number> = {}

    for (const row of userCounts || []) {
      if (row.company_id) {
        userCountMap[row.company_id] = (userCountMap[row.company_id] || 0) + 1
      }
    }
    for (const row of formCounts || []) {
      if (row.company_id) {
        formCountMap[row.company_id] = (formCountMap[row.company_id] || 0) + 1
      }
    }
    for (const row of submissionCounts || []) {
      const cid = (row as any).form_definitions?.company_id
      if (cid) {
        submissionCountMap[cid] = (submissionCountMap[cid] || 0) + 1
      }
    }

    // Merge counts onto company objects
    const enriched = (companies || []).map((c: any) => ({
      ...c,
      user_count: userCountMap[c.id] || 0,
      form_count: formCountMap[c.id] || 0,
      submission_count: submissionCountMap[c.id] || 0,
    }))

    return NextResponse.json(
      { companies: enriched },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error in GET /api/companies/manage:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST: Create new company
async function handlePost(req: NextRequest) {
  try {
    const userId = req.headers.get('x-office-user-id')
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing x-office-user-id header' },
        { status: 401 }
      )
    }

    const body: CreateCompanyRequest = await req.json()

    if (!body.name || body.name.trim() === '') {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      )
    }

    const slug = generateSlug(body.name)

    const supabase = await createServerSupabaseClient()

    // Check if slug already exists
    const { data: existing } = await supabase
      .from('companies')
      .select('id')
      .eq('slug', slug)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'A company with this name already exists' },
        { status: 400 }
      )
    }

    // Build insert object with only the base columns guaranteed to exist
    // secondary_color and accent_color may not exist in all deployments
    const insertData: Record<string, any> = {
      name: body.name.trim(),
      slug,
      logo_url: body.logo_url || null,
      primary_color: body.primary_color || '#0d9488', // teal-600
      active: true,
    }
    if (body.secondary_color) insertData.secondary_color = body.secondary_color
    if (body.accent_color) insertData.accent_color = body.accent_color

    const { data: company, error } = await supabase
      .from('companies')
      .insert([insertData])
      .select()
      .single()

    if (error) {
      console.error('Supabase error creating company:', error)
      return NextResponse.json(
        { error: 'Failed to create company' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { company },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error in POST /api/companies/manage:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT: Update company
async function handlePut(req: NextRequest) {
  try {
    const userId = req.headers.get('x-office-user-id')
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing x-office-user-id header' },
        { status: 401 }
      )
    }

    const body: UpdateCompanyRequest = await req.json()

    if (!body.id) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (body.name !== undefined) {
      updateData.name = body.name.trim()
    }

    if (body.slug !== undefined) {
      updateData.slug = body.slug
    } else if (body.name !== undefined) {
      // Auto-generate slug if name changed but slug not provided
      updateData.slug = generateSlug(body.name)
    }

    if (body.primary_color !== undefined) {
      updateData.primary_color = body.primary_color
    }

    if (body.secondary_color !== undefined) {
      updateData.secondary_color = body.secondary_color
    }

    if (body.accent_color !== undefined) {
      updateData.accent_color = body.accent_color
    }

    if (body.logo_url !== undefined) {
      updateData.logo_url = body.logo_url || null
    }

    const supabase = await createServerSupabaseClient()

    // Check if slug is unique (if being updated)
    if (updateData.slug) {
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .eq('slug', updateData.slug)
        .neq('id', body.id)
        .single()

      if (existing) {
        return NextResponse.json(
          { error: 'A company with this slug already exists' },
          { status: 400 }
        )
      }
    }

    const { data: company, error } = await supabase
      .from('companies')
      .update(updateData)
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      console.error('Supabase error updating company:', error)
      return NextResponse.json(
        { error: 'Failed to update company' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { company },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error in PUT /api/companies/manage:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE: Deactivate company (soft delete)
async function handleDelete(req: NextRequest) {
  try {
    const userId = req.headers.get('x-office-user-id')
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing x-office-user-id header' },
        { status: 401 }
      )
    }

    const body: DeleteCompanyRequest = await req.json()

    if (!body.id) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createServerSupabaseClient()

    const { data: company, error } = await supabase
      .from('companies')
      .update({
        active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      console.error('Supabase error deactivating company:', error)
      return NextResponse.json(
        { error: 'Failed to deactivate company' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { company },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error in DELETE /api/companies/manage:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  return handleGet(req)
}

export async function POST(req: NextRequest) {
  return handlePost(req)
}

export async function PUT(req: NextRequest) {
  return handlePut(req)
}

export async function DELETE(req: NextRequest) {
  return handleDelete(req)
}
