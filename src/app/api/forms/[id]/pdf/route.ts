import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/forms/[id]/pdf
 *
 * Returns the stored PDF base64 for a given form_id.
 * Used by MobileFormWizard to load the generated PDF for content preview.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Look up the packet for this form
    const { data: packet, error } = await supabase
      .from('form_packets')
      .select('template_pdf_base64')
      .eq('master_form_id', id)
      .single();

    if (error) {
      console.error('[PDF API] Query error:', error);
      return NextResponse.json({ error: 'Failed to load PDF' }, { status: 500 });
    }

    if (!packet?.template_pdf_base64) {
      return NextResponse.json({ error: 'No PDF found for this form' }, { status: 404 });
    }

    return NextResponse.json({
      pdf_base64: packet.template_pdf_base64,
      length: packet.template_pdf_base64.length,
    });
  } catch (err) {
    console.error('[PDF API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
