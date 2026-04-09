import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PacketSubForm } from '@/lib/packet-engine';

export const dynamic = 'force-dynamic';

interface CreatePacketRequest {
  packet_name: string;
  company_id: string;
  description?: string;
  master_form_id: string;
  sub_forms: PacketSubForm[];
}

interface ListPacketsQuery {
  company_id?: string;
  status?: 'draft' | 'published' | 'archived';
}

/**
 * GET /api/packets - List all packets with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    const companyId = searchParams.get('company_id');
    const status = searchParams.get('status') as 'draft' | 'published' | 'archived' | null;

    let query = supabase.from('form_packets').select('*').order('created_at', { ascending: false });

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: packets, error } = await query;

    if (error) {
      console.error('Error fetching packets:', error);
      return NextResponse.json(
        { error: 'Failed to fetch packets' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: packets || [],
      count: packets?.length || 0,
    });
  } catch (error) {
    console.error('Packets list error:', error);
    return NextResponse.json(
      { error: 'Failed to list packets' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/packets - Create a new packet
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreatePacketRequest = await request.json();
    const { packet_name, company_id, description, master_form_id, sub_forms } = body;

    // Validation
    if (!packet_name || !company_id || !master_form_id) {
      return NextResponse.json(
        { error: 'packet_name, company_id, and master_form_id are required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(sub_forms) || sub_forms.length === 0) {
      return NextResponse.json(
        { error: 'At least one sub_form is required' },
        { status: 400 }
      );
    }

    // Generate packet ID
    const packetId = `packet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const supabase = createServerSupabaseClient();
    const now = new Date().toISOString();

    // Create packet
    const { data: packet, error } = await supabase
      .from('form_packets')
      .insert({
        packet_id: packetId,
        company_id,
        packet_name,
        description: description || null,
        master_form_id,
        sub_forms: sub_forms, // Will be stored as JSONB
        status: 'draft',
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating packet:', error);
      return NextResponse.json(
        { error: 'Failed to create packet' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: packet,
        message: 'Packet created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Packet creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create packet' },
      { status: 500 }
    );
  }
}
