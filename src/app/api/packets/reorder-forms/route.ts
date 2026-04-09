import { createServerSupabaseClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface ReorderFormsRequest {
  packet_id: string;
  form_order: string[];
}

interface FormPacket {
  id: string;
  name: string;
  sub_forms: string[];
  updated_at?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Auth check
    const officeUserId = request.headers.get('x-office-user-id');
    if (!officeUserId) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing x-office-user-id header' },
        { status: 401 }
      );
    }

    // Parse request body
    const body: ReorderFormsRequest = await request.json();
    const { packet_id, form_order } = body;

    // Validate required fields
    if (!packet_id || !form_order || !Array.isArray(form_order)) {
      return NextResponse.json(
        { error: 'Missing required fields: packet_id, form_order (array)' },
        { status: 400 }
      );
    }

    // Validate form_order is not empty
    if (form_order.length === 0) {
      return NextResponse.json(
        { error: 'form_order array cannot be empty' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch the form_packet
    const { data: packet, error: fetchError } = await supabase
      .from('form_packets')
      .select('*')
      .eq('id', packet_id)
      .single();

    if (fetchError || !packet) {
      return NextResponse.json(
        { error: `Form packet not found: ${packet_id}` },
        { status: 404 }
      );
    }

    // Validate that all forms in form_order are currently in the packet
    const currentForms = packet.sub_forms || [];
    const allFormsPresent = form_order.every(formId => currentForms.includes(formId));
    const correctCount = form_order.length === currentForms.length;

    if (!allFormsPresent || !correctCount) {
      return NextResponse.json(
        {
          error: 'Invalid form_order: must contain exactly the same forms as currently in the packet',
          current_forms: currentForms,
          provided_forms: form_order,
        },
        { status: 400 }
      );
    }

    // Update the sub_forms array with new ordering
    const { data: updatedPacket, error: updateError } = await supabase
      .from('form_packets')
      .update({
        sub_forms: form_order,
        updated_at: new Date().toISOString(),
      })
      .eq('id', packet_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update form packet: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedPacket, { status: 200 });
  } catch (error) {
    console.error('Reorder forms error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
