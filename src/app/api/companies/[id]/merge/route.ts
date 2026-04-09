/**
 * POST /api/companies/[id]/merge
 * Merge source company (this ID) into a target company.
 * Moves all users, forms, submissions from source → target. Deactivates source.
 * Super admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getAuthenticatedUser, requireRole } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sourceId } = await params;
    const supabase = createServerSupabaseClient();
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const roleError = requireRole(user, 'super_admin');
    if (roleError) return roleError;
    const body = await request.json();
    const { target_company_id } = body;

    if (!target_company_id) {
      return NextResponse.json({ error: 'target_company_id is required' }, { status: 400 });
    }

    if (sourceId === target_company_id) {
      return NextResponse.json({ error: 'Cannot merge a company into itself' }, { status: 400 });
    }

    // Verify both companies exist
    const { data: source } = await supabase
      .from('companies')
      .select('id, name, active')
      .eq('id', sourceId)
      .single();

    const { data: target } = await supabase
      .from('companies')
      .select('id, name, active')
      .eq('id', target_company_id)
      .single();

    if (!source) {
      return NextResponse.json({ error: 'Source company not found' }, { status: 404 });
    }
    if (!target) {
      return NextResponse.json({ error: 'Target company not found' }, { status: 404 });
    }
    if (!target.active) {
      return NextResponse.json({ error: 'Target company is inactive' }, { status: 400 });
    }

    const mergeLog: string[] = [];

    // 1. Move user_company_assignments (avoid duplicates)
    const { data: sourceAssignments } = await supabase
      .from('user_company_assignments')
      .select('user_id')
      .eq('company_id', sourceId);

    if (sourceAssignments && sourceAssignments.length > 0) {
      // Get existing target assignments to avoid duplicates
      const { data: targetAssignments } = await supabase
        .from('user_company_assignments')
        .select('user_id')
        .eq('company_id', target_company_id);

      const targetUserIds = new Set((targetAssignments || []).map((a: any) => a.user_id));
      const usersToMove = sourceAssignments.filter((a: any) => !targetUserIds.has(a.user_id));

      if (usersToMove.length > 0) {
        // Insert new assignments
        const { error: insertError } = await supabase
          .from('user_company_assignments')
          .insert(
            usersToMove.map((a: any) => ({
              user_id: a.user_id,
              company_id: target_company_id,
            }))
          );

        if (insertError) {
          console.warn('Error moving user assignments:', insertError);
        }
      }

      // Remove source assignments
      const { error: deleteError } = await supabase
        .from('user_company_assignments')
        .delete()
        .eq('company_id', sourceId);

      if (deleteError) {
        console.warn('Error removing source user assignments:', deleteError);
      }

      mergeLog.push(`Moved ${usersToMove.length} user assignment(s)`);
    }

    // 2. Move form_definitions
    const { data: sourceForms } = await supabase
      .from('form_definitions')
      .select('id')
      .eq('company_id', sourceId);

    if (sourceForms && sourceForms.length > 0) {
      const { error } = await supabase
        .from('form_definitions')
        .update({ company_id: target_company_id })
        .eq('company_id', sourceId);

      if (error) console.warn('Error moving form_definitions:', error);
      mergeLog.push(`Moved ${sourceForms.length} form definition(s)`);
    }

    // 3. Move form_packets
    const { data: sourcePackets } = await supabase
      .from('form_packets')
      .select('id')
      .eq('company_id', sourceId);

    if (sourcePackets && sourcePackets.length > 0) {
      const { error } = await supabase
        .from('form_packets')
        .update({ company_id: target_company_id })
        .eq('company_id', sourceId);

      if (error) console.warn('Error moving form_packets:', error);
      mergeLog.push(`Moved ${sourcePackets.length} form packet(s)`);
    }

    // 4. Move form_submissions
    const { data: sourceSubmissions } = await supabase
      .from('form_submissions')
      .select('id')
      .eq('company_id', sourceId);

    if (sourceSubmissions && sourceSubmissions.length > 0) {
      const { error } = await supabase
        .from('form_submissions')
        .update({ company_id: target_company_id })
        .eq('company_id', sourceId);

      if (error) console.warn('Error moving form_submissions:', error);
      mergeLog.push(`Moved ${sourceSubmissions.length} submission(s)`);
    }

    // 5. Move caregivers
    const { data: sourceCaregivers } = await supabase
      .from('caregivers')
      .select('id')
      .eq('company_id', sourceId);

    if (sourceCaregivers && sourceCaregivers.length > 0) {
      const { error } = await supabase
        .from('caregivers')
        .update({ company_id: target_company_id })
        .eq('company_id', sourceId);

      if (error) console.warn('Error moving caregivers:', error);
      mergeLog.push(`Moved ${sourceCaregivers.length} caregiver(s)`);
    }

    // 6. Move conversations
    const { data: sourceConversations } = await supabase
      .from('conversations')
      .select('id')
      .eq('company_id', sourceId);

    if (sourceConversations && sourceConversations.length > 0) {
      const { error } = await supabase
        .from('conversations')
        .update({ company_id: target_company_id })
        .eq('company_id', sourceId);

      if (error) console.warn('Error moving conversations:', error);
      mergeLog.push(`Moved ${sourceConversations.length} conversation(s)`);
    }

    // 7. Deactivate source company
    const { error: deactivateError } = await supabase
      .from('companies')
      .update({ active: false })
      .eq('id', sourceId);

    if (deactivateError) {
      console.error('Error deactivating source company:', deactivateError);
      return NextResponse.json(
        { error: 'Merge completed but failed to deactivate source company' },
        { status: 500 }
      );
    }

    mergeLog.push(`Deactivated "${source.name}"`);

    return NextResponse.json({
      success: true,
      message: `Merged "${source.name}" into "${target.name}"`,
      details: mergeLog,
    });
  } catch (error) {
    console.error('Error in POST /api/companies/[id]/merge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
