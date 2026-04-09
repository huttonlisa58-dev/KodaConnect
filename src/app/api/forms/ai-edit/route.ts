import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getAnthropicClient } from '@/lib/anthropic';
import { FormDefinition } from '@/lib/form-engine';

export const dynamic = 'force-dynamic';

export interface AIEditRequest {
  form_id: string;
  comment: string;
  user_id: string;
}

export interface ChangeObject {
  type: 'rename_field' | 'reorder_field' | 'add_field' | 'remove_field' | 'rename_section' | 'edit_content' | 'change_required' | 'move_field';
  description: string;
  details: any;
}

export interface AIEditResponse {
  changes: ChangeObject[];
  summary: string;
}

/**
 * POST /api/forms/ai-edit
 * Sends a form definition and admin comment to Claude for interpretation
 * Returns proposed changes WITHOUT applying them (admin must approve)
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

    const body = await request.json() as AIEditRequest;
    const { form_id, comment, user_id } = body;

    // Validate required fields
    if (!form_id || !comment || !user_id) {
      return NextResponse.json(
        { error: 'form_id, comment, and user_id are required' },
        { status: 400 }
      );
    }

    // Check Anthropic API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY environment variable is not set');
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 500 }
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

    const formDefinition = formData as FormDefinition;

    // Build the AI prompt
    const aiPrompt = `You are a form editor assistant. An administrator has provided a plain-language instruction for modifying a form. Your job is to interpret that instruction and return a structured list of changes.

CURRENT FORM DEFINITION:
${JSON.stringify(formDefinition, null, 2)}

ADMINISTRATOR'S INSTRUCTION:
"${comment}"

Analyze the instruction and determine what changes need to be made to the form. Return a JSON object with this structure:
{
  "changes": [
    {
      "type": "rename_field" | "reorder_field" | "add_field" | "remove_field" | "rename_section" | "edit_content" | "change_required" | "move_field",
      "description": "Human-readable description of this change",
      "details": {
        // Type-specific details:
        // For rename_field: { field_id, section_id, new_label }
        // For reorder_field: { field_id, section_id, new_order }
        // For add_field: { section_id, field: { label, type, required, ... } }
        // For remove_field: { field_id, section_id }
        // For rename_section: { section_id, new_title }
        // For edit_content: { section_id, new_content }
        // For change_required: { field_id, section_id, required: boolean }
        // For move_field: { field_id, from_section_id, to_section_id }
      }
    }
  ],
  "summary": "Brief summary of all proposed changes"
}

IMPORTANT RULES:
1. Only suggest changes that directly address the administrator's instruction
2. Be conservative - don't over-interpret
3. For field_id and section_id, use the exact IDs from the current form definition
4. For new fields, generate a field_id in format "field_X_Y" where X is section index and Y is field index
5. Always include a clear description for each change
6. Return ONLY valid JSON, no other text`;

    // Call Claude API
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: aiPrompt,
        },
      ],
    });

    // Extract the text response
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { error: 'Failed to get response from Claude' },
        { status: 500 }
      );
    }

    // Parse the JSON response
    let proposedChanges: AIEditResponse;
    try {
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      proposedChanges = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return NextResponse.json(
        { error: 'Failed to parse proposed changes from AI' },
        { status: 500 }
      );
    }

    // Validate the response structure
    if (!proposedChanges.changes || !Array.isArray(proposedChanges.changes)) {
      return NextResponse.json(
        { error: 'Invalid response structure from AI' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        proposed_changes: proposedChanges.changes,
        summary: proposedChanges.summary,
        form_id,
        created_by: user_id,
        created_at: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('AI Edit API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
