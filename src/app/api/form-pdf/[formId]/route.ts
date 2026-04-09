import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/form-pdf/[formId]
 *
 * Returns the stored PDF base64 and packet data for a given form_id.
 * Used by:
 *   - MobileFormWizard to load the generated PDF for content preview
 *   - ApplyFormPage to load replica mode packet data (PDF, field map, page sizes)
 *
 * Query params:
 *   ?include=packet  — also return field_position_map and page_sizes
 *
 * NOTE: This route uses createServerSupabaseClient (service role key) to bypass
 * RLS policies on form_packets, ensuring reliable access for public-facing pages.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
): Promise<NextResponse> {
  try {
    const { formId } = await params;

    if (!formId) {
      return NextResponse.json({ error: 'formId is required' }, { status: 400 });
    }

    const includePacket = request.nextUrl.searchParams.get('include') === 'packet';

    const supabase = createServerSupabaseClient();

    // Always select all three fields — TypeScript needs a static select string
    // to properly infer the return type from Supabase's generated types.
    const { data: packet, error } = await supabase
      .from('form_packets')
      .select('template_pdf_base64, field_position_map, page_sizes')
      .eq('master_form_id', formId)
      .single();

    if (error) {
      console.error('[PDF API] Query error:', error);
      return NextResponse.json({ error: 'Failed to load PDF' }, { status: 500 });
    }

    if (!packet?.template_pdf_base64) {
      return NextResponse.json({ error: 'No PDF found for this form' }, { status: 404 });
    }

    // Build response — only include packet fields when requested
    const response: Record<string, any> = {
      pdf_base64: packet.template_pdf_base64,
      length: packet.template_pdf_base64.length,
    };

    if (includePacket) {
      response.field_position_map = packet.field_position_map || {};
      response.page_sizes = packet.page_sizes || {};
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('[PDF API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
