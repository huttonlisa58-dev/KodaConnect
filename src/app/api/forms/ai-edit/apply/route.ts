import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { FormDefinition, FormSection, FormField } from '@/lib/form-engine';

export const dynamic = 'force-dynamic';

export interface ApplyChangesRequest {
  form_id: string;
  changes: Array<{
    type: string;
    description: string;
    details: any;
  }>;
  comment: string;
  user_id: string;
}

/**
 * POST /api/forms/ai-edit/apply
 * Applies approved changes to a form definition
 * Saves a version snapshot before applying changes
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

    const body = await request.json() as ApplyChangesRequest;
    const { form_id, changes, comment, user_id } = body;

    // Validate required fields
    if (!form_id || !changes || !Array.isArray(changes) || !user_id) {
      return NextResponse.json(
        { error: 'form_id, changes array, and user_id are required' },
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

    // Save version snapshot BEFORE applying changes
    const versionSnapshot = {
      version: (formDefinition.metadata?.version_history?.length || 0) + 1,
      timestamp: new Date().toISOString(),
      comment,
      user_id,
      snapshot: JSON.parse(JSON.stringify(formDefinition)),
    };

    // Initialize metadata if not present
    if (!formDefinition.metadata) {
      formDefinition.metadata = {};
    }

    // Initialize version history if not present
    if (!formDefinition.metadata.version_history) {
      formDefinition.metadata.version_history = [];
    }

    // Add the snapshot
    formDefinition.metadata.version_history.push(versionSnapshot);

    // Keep only the last 20 versions
    if (formDefinition.metadata.version_history.length > 20) {
      formDefinition.metadata.version_history = formDefinition.metadata.version_history.slice(-20);
    }

    // Apply each change
    for (const change of changes) {
      switch (change.type) {
        case 'rename_field': {
          const { field_id, section_id, new_label } = change.details;
          const section = formDefinition.sections.find((s) => s.section_id === section_id);
          if (section) {
            const field = section.fields.find((f) => f.field_id === field_id);
            if (field) {
              field.label = new_label;
            }
          }
          break;
        }

        case 'reorder_field': {
          const { field_id, section_id, new_order } = change.details;
          const section = formDefinition.sections.find((s) => s.section_id === section_id);
          if (section) {
            const fieldIndex = section.fields.findIndex((f) => f.field_id === field_id);
            if (fieldIndex !== -1) {
              const field = section.fields[fieldIndex];
              section.fields.splice(fieldIndex, 1);
              section.fields.splice(new_order, 0, field);
              // Update order numbers
              section.fields.forEach((f, idx) => {
                f.order = idx;
              });
            }
          }
          break;
        }

        case 'add_field': {
          const { section_id, field } = change.details;
          const section = formDefinition.sections.find((s) => s.section_id === section_id);
          if (section) {
            const newField: FormField = {
              ...field,
              field_id: field.field_id || `field_${section.fields.length}_${section.fields.length}`,
              order: section.fields.length,
            };
            section.fields.push(newField);
          }
          break;
        }

        case 'remove_field': {
          const { field_id, section_id } = change.details;
          const section = formDefinition.sections.find((s) => s.section_id === section_id);
          if (section) {
            const fieldIndex = section.fields.findIndex((f) => f.field_id === field_id);
            if (fieldIndex !== -1) {
              section.fields.splice(fieldIndex, 1);
              // Update order numbers
              section.fields.forEach((f, idx) => {
                f.order = idx;
              });
            }
          }
          break;
        }

        case 'rename_section': {
          const { section_id, new_title } = change.details;
          const section = formDefinition.sections.find((s) => s.section_id === section_id);
          if (section) {
            section.title = new_title;
          }
          break;
        }

        case 'edit_content': {
          const { section_id, new_content } = change.details;
          const section = formDefinition.sections.find((s) => s.section_id === section_id);
          if (section) {
            section.content = new_content;
          }
          break;
        }

        case 'change_required': {
          const { field_id, section_id, required } = change.details;
          const section = formDefinition.sections.find((s) => s.section_id === section_id);
          if (section) {
            const field = section.fields.find((f) => f.field_id === field_id);
            if (field) {
              field.required = required;
            }
          }
          break;
        }

        case 'move_field': {
          const { field_id, from_section_id, to_section_id } = change.details;
          const fromSection = formDefinition.sections.find((s) => s.section_id === from_section_id);
          const toSection = formDefinition.sections.find((s) => s.section_id === to_section_id);

          if (fromSection && toSection) {
            const fieldIndex = fromSection.fields.findIndex((f) => f.field_id === field_id);
            if (fieldIndex !== -1) {
              const field = fromSection.fields[fieldIndex];
              fromSection.fields.splice(fieldIndex, 1);

              // Update order in source section
              fromSection.fields.forEach((f, idx) => {
                f.order = idx;
              });

              // Add to target section
              field.order = toSection.fields.length;
              toSection.fields.push(field);
            }
          }
          break;
        }
      }
    }

    // Update the updated_at timestamp
    formDefinition.updated_at = new Date().toISOString();

    // Save the updated form definition
    const { data: updatedForm, error: updateError } = await supabase
      .from('form_definitions')
      .update(formDefinition)
      .eq('form_id', form_id)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update form definition:', updateError);
      return NextResponse.json(
        { error: 'Failed to update form definition' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        form: updatedForm,
        version_created: versionSnapshot.version,
        changes_applied: changes.length,
        message: `${changes.length} change(s) applied and version saved`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Apply changes API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
