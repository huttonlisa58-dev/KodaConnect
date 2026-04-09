import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { FormDefinition } from '@/lib/form-engine';

export const dynamic = 'force-dynamic';

export interface ValidationWarning {
  type: string;
  message: string;
  field_id?: string;
  section_id?: string;
}

export interface ValidateResponse {
  valid: boolean;
  warnings: ValidationWarning[];
}

/**
 * POST /api/forms/validate
 * Validates a form definition and returns warnings/errors
 * Checks for:
 * - Fields with empty labels
 * - Sections with no fields and no content
 * - Signature fields exist (warning if none)
 * - Required fields check (at least one name and one signature)
 * - For replica mode: fields without positions
 * - Duplicate field IDs
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { form_id } = body;

    // Validate required fields
    if (!form_id) {
      return NextResponse.json(
        { error: 'form_id is required' },
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
    const warnings: ValidationWarning[] = [];
    let isValid = true;

    // Track all field IDs to check for duplicates
    const allFieldIds = new Set<string>();
    const fieldIdCounts: Record<string, number> = {};

    // Iterate through all sections
    for (const section of formDefinition.sections) {
      // Check if section has no fields and no content
      if (section.fields.length === 0 && !section.content && !section.summary) {
        warnings.push({
          type: 'empty_section',
          message: `Section "${section.title}" has no fields and no content`,
          section_id: section.section_id,
        });
      }

      // Check each field in the section
      for (const field of section.fields) {
        // Check for empty field labels
        if (!field.label || field.label.trim() === '') {
          isValid = false;
          warnings.push({
            type: 'empty_field_label',
            message: `Field in section "${section.title}" has no label`,
            field_id: field.field_id,
            section_id: section.section_id,
          });
        }

        // Check for duplicate field IDs
        if (fieldIdCounts[field.field_id] === undefined) {
          fieldIdCounts[field.field_id] = 0;
        }
        fieldIdCounts[field.field_id]++;
        allFieldIds.add(field.field_id);

        // Check for replica mode fields without positions
        if (formDefinition.metadata?.mode === 'replica' && !field.layout?.row) {
          warnings.push({
            type: 'missing_position',
            message: `Field "${field.label}" in replica mode is missing position information`,
            field_id: field.field_id,
            section_id: section.section_id,
          });
        }
      }
    }

    // Check for duplicate field IDs
    for (const [fieldId, count] of Object.entries(fieldIdCounts)) {
      if (count > 1) {
        isValid = false;
        warnings.push({
          type: 'duplicate_field_id',
          message: `Field ID "${fieldId}" appears ${count} times (should be unique)`,
          field_id: fieldId,
        });
      }
    }

    // Check for signature fields
    let hasSignatureField = false;
    let hasNameField = false;

    for (const section of formDefinition.sections) {
      for (const field of section.fields) {
        if (field.type === 'signature') {
          hasSignatureField = true;
        }
        if (
          field.type === 'text' &&
          (field.label.toLowerCase().includes('name') ||
            field.label.toLowerCase().includes('print name'))
        ) {
          hasNameField = true;
        }
      }
    }

    if (!hasSignatureField) {
      warnings.push({
        type: 'no_signature_field',
        message: 'Form has no signature fields',
      });
    }

    if (!hasNameField) {
      warnings.push({
        type: 'no_name_field',
        message: 'Form has no name field',
      });
    }

    // Check if there's at least one required name field AND one required signature field
    let hasRequiredNameField = false;
    let hasRequiredSignatureField = false;

    for (const section of formDefinition.sections) {
      for (const field of section.fields) {
        if (
          field.required &&
          field.type === 'signature'
        ) {
          hasRequiredSignatureField = true;
        }
        if (
          field.required &&
          field.type === 'text' &&
          (field.label.toLowerCase().includes('name') ||
            field.label.toLowerCase().includes('print name'))
        ) {
          hasRequiredNameField = true;
        }
      }
    }

    if (!hasRequiredNameField && hasNameField) {
      warnings.push({
        type: 'non_required_name_field',
        message: 'Form has a name field but it is not marked as required',
      });
    }

    if (!hasRequiredSignatureField && hasSignatureField) {
      warnings.push({
        type: 'non_required_signature_field',
        message: 'Form has a signature field but it is not marked as required',
      });
    }

    // Check for fields with invalid types
    const validFieldTypes = [
      'text',
      'email',
      'phone',
      'date',
      'number',
      'textarea',
      'signature',
      'checkbox',
      'checkbox_group',
      'checkbox_grid',
      'radio',
      'select',
      'file_upload',
    ];

    for (const section of formDefinition.sections) {
      for (const field of section.fields) {
        if (!validFieldTypes.includes(field.type)) {
          warnings.push({
            type: 'invalid_field_type',
            message: `Field "${field.label}" has invalid type: ${field.type}`,
            field_id: field.field_id,
            section_id: section.section_id,
          });
        }
      }
    }

    // Check for select/radio/checkbox_group fields without options
    for (const section of formDefinition.sections) {
      for (const field of section.fields) {
        if (['select', 'radio', 'checkbox_group'].includes(field.type)) {
          if (!field.options || field.options.length === 0) {
            warnings.push({
              type: 'missing_options',
              message: `Field "${field.label}" is type ${field.type} but has no options`,
              field_id: field.field_id,
              section_id: section.section_id,
            });
          }
        }
      }
    }

    // Check for checkbox_grid fields without rows or columns
    for (const section of formDefinition.sections) {
      for (const field of section.fields) {
        if (field.type === 'checkbox_grid') {
          if (!field.rows || field.rows.length === 0) {
            warnings.push({
              type: 'missing_grid_rows',
              message: `Checkbox grid field "${field.label}" has no rows`,
              field_id: field.field_id,
              section_id: section.section_id,
            });
          }
          if (!field.columns || field.columns.length === 0) {
            warnings.push({
              type: 'missing_grid_columns',
              message: `Checkbox grid field "${field.label}" has no columns`,
              field_id: field.field_id,
              section_id: section.section_id,
            });
          }
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        form_id,
        valid: isValid && warnings.length === 0,
        warning_count: warnings.length,
        warnings,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Validate form error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
