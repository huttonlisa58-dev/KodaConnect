import { createServerSupabaseClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/form-packets
 *
 * Returns deduplicated form packets for the template manager packet picker.
 * Deduplicates by display name (form_definition.form_name or packet_name),
 * keeping only the most recently created packet for each unique name.
 * Uses the form_definition name (user-given name) instead of the raw packet_name.
 *
 * FIX: Now filters out archived packets so they don't appear in Template Picker.
 */
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    // Fetch packets joined with their master form definition for name + render_mode
    // FIX: Filter out archived packets — they should not appear in the Template Picker
    const { data, error } = await supabase
      .from('form_packets')
      .select(`
        id,
        packet_id,
        packet_name,
        import_source,
        status,
        company_id,
        master_form_id,
        created_at,
        form_definitions:master_form_id(form_name, metadata)
      `)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching form packets:', error);
      return NextResponse.json(
        { error: 'Failed to fetch form packets' },
        { status: 500 }
      );
    }

    // Deduplicate by display name: keep only the most recent packet per unique name.
    // Data is ordered by created_at desc, so first occurrence of each name wins.
    const seenNames = new Set<string>();
    const uniquePackets = (data || []).filter((p: any) => {
      const displayName = (p.form_definitions?.form_name || p.packet_name || '').toLowerCase().trim();
      if (seenNames.has(displayName)) return false;
      seenNames.add(displayName);
      return true;
    });

    // Map packets to the format expected by TemplateManager
    const packets = uniquePackets.map((p: any) => {
      const renderMode = p.form_definitions?.metadata?.render_mode
        || (p.import_source === 'json_package' ? 'generated' : 'replica');

      // Prefer the form_definition name (user-given) over the raw packet_name
      const displayName = p.form_definitions?.form_name || p.packet_name;

      return {
        id: p.id,
        packet_id: p.packet_id,
        name: displayName,
        render_mode: renderMode,
        company_id: p.company_id,
        status: p.status,
      };
    });

    return NextResponse.json(packets);
  } catch (error) {
    console.error('Form packets API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
