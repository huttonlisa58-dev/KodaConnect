import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { FormDefinition } from '@/lib/form-engine';

export const dynamic = 'force-dynamic';

export interface VersionSnapshot {
  version: number;
  timestamp: string;
  comment: string;
  user_id: string;
  snapshot: FormDefinition;
}

/**
 * GET /api/forms/version-history?form_id=xxx
 * Returns version history for a form (list of snapshots with metadata)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const form_id = searchParams.get('form_id');

    if (!form_id) {
      return NextResponse.json(
        { error: 'form_id query parameter is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch the form definition
    const { data: formData, error: formError } = await supabase
      .from('form_definitions')
      .select('*')
      .eq('form_id', form_id)
      .single();

    if (formError || !formData) {
      console.error('Failed to fetch form definition:', formError);
      return NextResponse.json(
        { error: 'Form definition not found' },
        { status: 404 }
      );
    }

    const formDefinition = formData as FormDefinition;

    // Extract version history from metadata
    const versionHistory = (formDefinition.metadata?.version_history || []) as VersionSnapshot[];

    // Sort by version number (descending - most recent first)
    const sortedHistory = [...versionHistory].sort((a, b) => b.version - a.version);

    // Return metadata only (without full snapshots to save bandwidth)
    const historyMetadata = sortedHistory.map((v) => ({
      version: v.version,
      timestamp: v.timestamp,
      comment: v.comment,
      user_id: v.user_id,
    }));

    return NextResponse.json(
      {
        success: true,
        form_id,
        total_versions: historyMetadata.length,
        versions: historyMetadata,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Version history GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/forms/version-history
 * Creates a new version snapshot: { form_id, comment, user_id, form_definition_snapshot? }
 * If form_definition_snapshot is not provided, uses the current form definition
 */
export async function POST(request: NextRequest) {
  try {
    // Check for office user ID header (authentication)
    const userId = request.headers.get('x-office-user-id');
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized: x-office-user-id header is required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { form_id, comment, user_id, form_definition_snapshot } = body;

    // Validate required fields
    if (!form_id || !comment || !user_id) {
      return NextResponse.json(
        { error: 'form_id, comment, and user_id are required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch the current form definition
    const { data: formData, error: formError } = await supabase
      .from('form_definitions')
      .select('*')
      .eq('form_id', form_id)
      .single();

    if (formError || !formData) {
      console.error('Failed to fetch form definition:', formError);
      return NextResponse.json(
        { error: 'Form definition not found' },
        { status: 404 }
      );
    }

    let formDefinition = JSON.parse(JSON.stringify(formData)) as FormDefinition;

    // Use provided snapshot or current definition
    const snapshotToSave = form_definition_snapshot || JSON.parse(JSON.stringify(formDefinition));

    // Initialize metadata if not present
    if (!formDefinition.metadata) {
      formDefinition.metadata = {};
    }

    // Initialize version history if not present
    if (!formDefinition.metadata.version_history) {
      formDefinition.metadata.version_history = [];
    }

    // Create new version snapshot
    const newVersion: VersionSnapshot = {
      version: (formDefinition.metadata.version_history as VersionSnapshot[]).length + 1,
      timestamp: new Date().toISOString(),
      comment,
      user_id,
      snapshot: snapshotToSave,
    };

    // Add the snapshot
    formDefinition.metadata.version_history.push(newVersion);

    // Keep only the last 20 versions
    if (formDefinition.metadata.version_history.length > 20) {
      formDefinition.metadata.version_history = formDefinition.metadata.version_history.slice(-20);
    }

    // Update the form definition
    const { data: updatedForm, error: updateError } = await supabase
      .from('form_definitions')
      .update(formDefinition)
      .eq('form_id', form_id)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update form definition:', updateError);
      return NextResponse.json(
        { error: 'Failed to save version snapshot' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        form_id,
        version_created: newVersion.version,
        timestamp: newVersion.timestamp,
        comment,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Version history POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
