import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PacketSubForm } from '@/lib/packet-engine';

export const dynamic = 'force-dynamic';

interface UpdatePacketRequest {
  packet_name?: string;
  description?: string;
  status?: 'draft' | 'published' | 'archived';
  sub_forms?: PacketSubForm[];
}

/**
 * GET /api/packets/[id] - Fetch a single packet with its form definition
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();

    // Fetch packet
    const { data: packet, error: packetError } = await supabase
      .from('form_packets')
      .select('*')
      .eq('packet_id', id)
      .single();

    if (packetError || !packet) {
      return NextResponse.json(
        { error: 'Packet not found' },
        { status: 404 }
      );
    }

    // Fetch linked form definition
    const { data: formDef, error: formError } = await supabase
      .from('form_definitions')
      .select('*')
      .eq('form_id', packet.master_form_id)
      .single();

    if (formError) {
      console.warn('Could not fetch linked form definition:', formError);
    }

    // Fetch field mappings
    const { data: mappings, error: mappingsError } = await supabase
      .from('packet_field_mappings')
      .select('*')
      .eq('form_id', packet.master_form_id)
      .single();

    if (mappingsError) {
      console.warn('Could not fetch field mappings:', mappingsError);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...packet,
        form_definition: formDef || null,
        field_mappings: mappings?.field_mappings || [],
        deduplication_report: mappings?.deduplication_report || null,
      },
    });
  } catch (error) {
    console.error('Packet fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch packet' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/packets/[id] - Update a packet
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: UpdatePacketRequest = await request.json();
    const { packet_name, description, status, sub_forms } = body;

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (packet_name !== undefined) {
      updateData.packet_name = packet_name;
    }

    if (description !== undefined) {
      updateData.description = description;
    }

    if (status !== undefined) {
      if (!['draft', 'published', 'archived'].includes(status)) {
        return NextResponse.json(
          { error: 'Invalid status. Must be one of: draft, published, archived' },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    if (sub_forms !== undefined) {
      if (!Array.isArray(sub_forms) || sub_forms.length === 0) {
        return NextResponse.json(
          { error: 'sub_forms must be a non-empty array' },
          { status: 400 }
        );
      }
      updateData.sub_forms = sub_forms;
    }

    const supabase = createServerSupabaseClient();

    // Update packet
    const { data: packet, error } = await supabase
      .from('form_packets')
      .update(updateData)
      .eq('packet_id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating packet:', error);
      return NextResponse.json(
        { error: 'Failed to update packet' },
        { status: 500 }
      );
    }

    if (!packet) {
      return NextResponse.json(
        { error: 'Packet not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: packet,
      message: 'Packet updated successfully',
    });
  } catch (error) {
    console.error('Packet update error:', error);
    return NextResponse.json(
      { error: 'Failed to update packet' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/packets/[id] - Delete (soft delete) a packet
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();

    // Soft delete by setting status to archived
    const { data: packet, error } = await supabase
      .from('form_packets')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('packet_id', id)
      .select()
      .single();

    if (error) {
      console.error('Error deleting packet:', error);
      return NextResponse.json(
        { error: 'Failed to delete packet' },
        { status: 500 }
      );
    }

    if (!packet) {
      return NextResponse.json(
        { error: 'Packet not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: packet,
      message: 'Packet deleted successfully',
    });
  } catch (error) {
    console.error('Packet delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete packet' },
      { status: 500 }
    );
  }
}
