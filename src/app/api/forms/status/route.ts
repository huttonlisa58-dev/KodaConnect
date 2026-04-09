import { createServerSupabaseClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type FormStatus = 'draft' | 'review' | 'active' | 'archived';

interface UpdateFormStatusRequest {
  form_id: string;
  status: FormStatus;
}

interface UpdateFormStatusResponse {
  success: boolean;
  form_id: string;
  old_status: string;
  new_status: string;
}

// Define valid status transitions
const validTransitions: Record<FormStatus, FormStatus[]> = {
  draft: ['review', 'active'],
  review: ['draft', 'active'],
  active: ['archived', 'draft'],
  archived: ['draft'],
};

function isValidStatusTransition(
  currentStatus: FormStatus,
  newStatus: FormStatus
): boolean {
  if (currentStatus === newStatus) {
    return true; // Allow no-op transition
  }
  return validTransitions[currentStatus]?.includes(newStatus) ?? false;
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
    const body: UpdateFormStatusRequest = await request.json();
    const { form_id, status } = body;

    // Validate required fields
    if (!form_id || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: form_id, status' },
        { status: 400 }
      );
    }

    // Validate status is valid
    const validStatuses: FormStatus[] = ['draft', 'review', 'active', 'archived'];
    if (!validStatuses.includes(status as FormStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch current form
    const { data: form, error: fetchError } = await supabase
      .from('form_definitions')
      .select('id, status')
      .eq('id', form_id)
      .single();

    if (fetchError || !form) {
      return NextResponse.json(
        { error: `Form not found: ${form_id}` },
        { status: 404 }
      );
    }

    const currentStatus = form.status as FormStatus;

    // Validate status transition
    if (!isValidStatusTransition(currentStatus, status as FormStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status transition: cannot change from "${currentStatus}" to "${status}"`,
          current_status: currentStatus,
          requested_status: status,
          valid_next_statuses: validTransitions[currentStatus],
        },
        { status: 400 }
      );
    }

    // Update form status
    const { error: updateError } = await supabase
      .from('form_definitions')
      .update({
        status: status as FormStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', form_id);

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update form status: ${updateError.message}` },
        { status: 500 }
      );
    }

    const response: UpdateFormStatusResponse = {
      success: true,
      form_id,
      old_status: currentStatus,
      new_status: status,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Update form status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
