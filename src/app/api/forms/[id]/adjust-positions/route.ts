import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface FieldPositionEntry {
  label: string;
  positions: Array<{
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    font_size: number;
  }>;
}

interface FieldPositionMap {
  [fieldId: string]: FieldPositionEntry;
}

/**
 * POST /api/forms/[id]/adjust-positions
 *
 * Modes:
 * 1. adjust              — Claude adjusts positions/fields based on text instructions (+ optional PDF upload)
 * 2. generate_test_data   — Returns labeled test data for all fields
 * 3. import_positions     — Directly save a raw position map JSON (no AI involved)
 * 4. generate_grid_pdf    — Generate a PDF with coordinate grid overlay on the template
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<any>> {
  try {
    const { id: formId } = await params;

    let instructions = '';
    let uploadedPdfBase64: string | null = null;
    let mode = 'adjust';
    let importedPositionMap: any = null;

    // Handle both JSON and FormData
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      instructions = (formData.get('instructions') as string) || '';
      mode = (formData.get('mode') as string) || 'adjust';
      const pdfFile = formData.get('pdf') as File | null;
      if (pdfFile) {
        const buffer = Buffer.from(await pdfFile.arrayBuffer());
        uploadedPdfBase64 = buffer.toString('base64');
      }
      const posMapStr = formData.get('position_map') as string | null;
      if (posMapStr) {
        try { importedPositionMap = JSON.parse(posMapStr); } catch (e) { /* will handle below */ }
      }
    } else {
      const body = await request.json();
      instructions = body.instructions || '';
      mode = body.mode || 'adjust';
      importedPositionMap = body.position_map || null;
    }

    const supabase = createServerSupabaseClient();

    // ============================================================
    // MODE: Generate labeled test data
    // ============================================================
    if (mode === 'generate_test_data') {
      const { data: formDef, error: formError } = await supabase
        .from('form_definitions')
        .select('sections')
        .eq('form_id', formId)
        .single();

      if (formError || !formDef) {
        return NextResponse.json({ error: 'Form not found' }, { status: 404 });
      }

      const testData: Record<string, any> = {};
      const sections = Array.isArray(formDef.sections) ? formDef.sections : [];

      for (const section of sections) {
        for (const field of (section.fields || [])) {
          const fid = field.field_id;
          const label = field.label || fid;

          switch (field.type) {
            case 'text':
            case 'email':
            case 'phone':
            case 'textarea':
              testData[fid] = `[${label}]`;
              break;
            case 'date':
              testData[fid] = '2026-01-15';
              break;
            case 'number':
              testData[fid] = '12345';
              break;
            case 'checkbox':
              testData[fid] = true;
              break;
            case 'checkbox_group':
              testData[fid] = field.options?.slice(0, 2).map((o: any) => o.value) || ['Option A'];
              break;
            case 'checkbox_grid':
              if (field.rows?.length && field.columns?.length) {
                testData[fid] = { [`${field.rows[0].row_id}__${field.columns[0].col_id}`]: true };
              }
              break;
            case 'radio':
            case 'select':
              testData[fid] = field.options?.[0]?.value || 'Selected';
              break;
            case 'signature':
              testData[fid] = `[${label}]`;
              break;
            default:
              testData[fid] = `[${label}]`;
          }
        }
      }

      return NextResponse.json({
        success: true,
        test_data: testData,
        field_count: Object.keys(testData).length,
      });
    }

    // ============================================================
    // MODE: Import positions directly (no AI)
    // ============================================================
    if (mode === 'import_positions') {
      if (!importedPositionMap || typeof importedPositionMap !== 'object') {
        return NextResponse.json(
          { error: 'position_map is required and must be a valid JSON object' },
          { status: 400 }
        );
      }

      // Validate structure: each entry must have label and positions array
      const fieldCount = Object.keys(importedPositionMap).length;
      let validationErrors: string[] = [];

      for (const [fieldId, entry] of Object.entries(importedPositionMap) as [string, any][]) {
        if (!entry.label) {
          validationErrors.push(`${fieldId}: missing "label"`);
        }
        if (!Array.isArray(entry.positions) || entry.positions.length === 0) {
          validationErrors.push(`${fieldId}: missing or empty "positions" array`);
        } else {
          for (const pos of entry.positions) {
            if (typeof pos.page !== 'number' || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
              validationErrors.push(`${fieldId}: position must have numeric page, x, y`);
              break;
            }
          }
        }
      }

      if (validationErrors.length > 0) {
        return NextResponse.json(
          { error: `Validation errors:\n${validationErrors.slice(0, 10).join('\n')}` },
          { status: 400 }
        );
      }

      // Clamp all values
      const clampedMap: FieldPositionMap = {};
      for (const [fieldId, entry] of Object.entries(importedPositionMap) as [string, any][]) {
        clampedMap[fieldId] = {
          label: entry.label,
          positions: entry.positions.map((p: any) => ({
            page: Math.max(0, Math.round(p.page)),
            x: clamp(p.x, 0, 612),
            y: clamp(p.y, 0, 792),
            width: clamp(p.width || 200, 10, 600),
            height: clamp(p.height || 14, 5, 200),
            font_size: clamp(p.font_size || 10, 6, 24),
          })),
        };
      }

      // Load packet
      const { data: packetData, error: packetError } = await supabase
        .from('form_packets')
        .select('packet_id')
        .eq('master_form_id', formId)
        .single();

      if (packetError || !packetData) {
        return NextResponse.json({ error: 'No packet found for this form.' }, { status: 404 });
      }

      // Save
      const { error: updateError } = await supabase
        .from('form_packets')
        .update({
          field_position_map: clampedMap,
          updated_at: new Date().toISOString(),
        })
        .eq('packet_id', packetData.packet_id);

      if (updateError) {
        return NextResponse.json(
          { error: `Failed to save: ${updateError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        field_count: fieldCount,
        message: `Imported ${fieldCount} field positions successfully.`,
      });
    }

    // ============================================================
    // MODE: Generate grid overlay PDF
    // ============================================================
    if (mode === 'generate_grid_pdf') {
      // Load template PDF
      const { data: packetData, error: packetError } = await supabase
        .from('form_packets')
        .select('template_pdf_base64, field_position_map')
        .eq('master_form_id', formId)
        .single();

      if (packetError || !packetData?.template_pdf_base64) {
        return NextResponse.json(
          { error: 'No template PDF found for this form.' },
          { status: 404 }
        );
      }

      const templateBytes = Buffer.from(packetData.template_pdf_base64, 'base64');
      const pdfDoc = await PDFDocument.load(templateBytes);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const positionMap: FieldPositionMap = packetData.field_position_map || {};

      const pages = pdfDoc.getPages();

      for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const page = pages[pageIdx];
        const { width, height } = page.getSize();

        // Draw major gridlines every 100 points (darker)
        for (let x = 0; x <= width; x += 100) {
          page.drawLine({
            start: { x, y: 0 },
            end: { x, y: height },
            thickness: 0.5,
            color: rgb(0.7, 0.7, 0.9),
            opacity: 0.6,
          });
          // Label at top
          page.drawText(`${Math.round(x)}`, {
            x: x + 2,
            y: height - 10,
            size: 6,
            font,
            color: rgb(0.3, 0.3, 0.7),
            opacity: 0.8,
          });
          // Label at bottom
          page.drawText(`${Math.round(x)}`, {
            x: x + 2,
            y: 2,
            size: 6,
            font,
            color: rgb(0.3, 0.3, 0.7),
            opacity: 0.8,
          });
        }

        for (let y = 0; y <= height; y += 100) {
          page.drawLine({
            start: { x: 0, y },
            end: { x: width, y },
            thickness: 0.5,
            color: rgb(0.7, 0.7, 0.9),
            opacity: 0.6,
          });
          // Label on left
          page.drawText(`${Math.round(y)}`, {
            x: 2,
            y: y + 2,
            size: 6,
            font,
            color: rgb(0.3, 0.3, 0.7),
            opacity: 0.8,
          });
          // Label on right
          page.drawText(`${Math.round(y)}`, {
            x: width - 18,
            y: y + 2,
            size: 6,
            font,
            color: rgb(0.3, 0.3, 0.7),
            opacity: 0.8,
          });
        }

        // Draw minor gridlines every 50 points (lighter, skip 100s)
        for (let x = 50; x <= width; x += 100) {
          page.drawLine({
            start: { x, y: 0 },
            end: { x, y: height },
            thickness: 0.3,
            color: rgb(0.85, 0.85, 0.95),
            opacity: 0.4,
          });
          page.drawText(`${Math.round(x)}`, {
            x: x + 1,
            y: height - 10,
            size: 5,
            font,
            color: rgb(0.5, 0.5, 0.8),
            opacity: 0.6,
          });
        }

        for (let y = 50; y <= height; y += 100) {
          page.drawLine({
            start: { x: 0, y },
            end: { x: width, y },
            thickness: 0.3,
            color: rgb(0.85, 0.85, 0.95),
            opacity: 0.4,
          });
          page.drawText(`${Math.round(y)}`, {
            x: 2,
            y: y + 1,
            size: 5,
            font,
            color: rgb(0.5, 0.5, 0.8),
            opacity: 0.6,
          });
        }

        // Draw current field positions as red rectangles with labels
        for (const [fieldId, entry] of Object.entries(positionMap)) {
          for (const pos of entry.positions) {
            if (pos.page === pageIdx) {
              // Red rectangle outline
              page.drawRectangle({
                x: pos.x,
                y: pos.y,
                width: pos.width || 100,
                height: pos.height || 14,
                borderColor: rgb(1, 0, 0),
                borderWidth: 1,
                color: rgb(1, 0.9, 0.9),
                opacity: 0.3,
              });
              // Red label
              const labelText = `${entry.label} (${Math.round(pos.x)},${Math.round(pos.y)})`;
              page.drawText(labelText, {
                x: pos.x,
                y: pos.y + (pos.height || 14) + 2,
                size: 5,
                font,
                color: rgb(0.8, 0, 0),
                opacity: 0.9,
              });
            }
          }
        }

        // Page label
        page.drawText(`Page ${pageIdx + 1} - Coordinates: origin at BOTTOM-LEFT, x=left-to-right, y=bottom-to-top`, {
          x: 50,
          y: height - 20,
          size: 8,
          font,
          color: rgb(0.2, 0.2, 0.6),
          opacity: 0.9,
        });
      }

      const pdfBytes = await pdfDoc.save();

      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="grid_overlay_${formId}.pdf"`,
        },
      });
    }

    // ============================================================
    // MODE: Adjust (AI-powered positions, fields, or both)
    // ============================================================
    if (!instructions || instructions.trim().length === 0) {
      return NextResponse.json({ error: 'Instructions are required' }, { status: 400 });
    }

    // Load packet (positions + template)
    const { data: packetData, error: packetError } = await supabase
      .from('form_packets')
      .select('packet_id, field_position_map, packet_name, template_pdf_base64')
      .eq('master_form_id', formId)
      .single();

    if (packetError || !packetData) {
      return NextResponse.json(
        { error: 'No packet found for this form.' },
        { status: 404 }
      );
    }

    // Load form definition (for field add/delete/change)
    const { data: formDef, error: formError } = await supabase
      .from('form_definitions')
      .select('form_id, form_name, sections')
      .eq('form_id', formId)
      .single();

    if (formError || !formDef) {
      return NextResponse.json({ error: 'Form definition not found' }, { status: 404 });
    }

    const currentPositionMap: FieldPositionMap = packetData.field_position_map || {};
    const currentSections = Array.isArray(formDef.sections) ? formDef.sections : [];

    const claudeApiKey = process.env.ANTHROPIC_API_KEY;
    if (!claudeApiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    // Build context for Claude
    const positionSummary = Object.entries(currentPositionMap).map(([fieldId, entry]) => {
      const posStr = entry.positions.map(p =>
        `page ${p.page + 1}: x=${Math.round(p.x)}, y=${Math.round(p.y)}, w=${Math.round(p.width)}, h=${Math.round(p.height)}, font=${p.font_size}`
      ).join('; ');
      return `- "${entry.label}" (${fieldId}): ${posStr}`;
    }).join('\n');

    const fieldSummary = currentSections.map((s: any) => {
      const fieldList = (s.fields || []).map((f: any) =>
        `    - "${f.label}" (${f.field_id}) type=${f.type} required=${f.required}`
      ).join('\n');
      return `  Section "${s.title}" (${s.section_id}):\n${fieldList}`;
    }).join('\n');

    // Build Claude message content
    const messageContent: any[] = [];

    if (uploadedPdfBase64) {
      messageContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: uploadedPdfBase64 },
      });
    }

    if (uploadedPdfBase64 && packetData.template_pdf_base64) {
      messageContent.push({
        type: 'text',
        text: 'The FIRST PDF above is the rendered output (with test data filled in). Compare it to the original template positions to identify misplacements.',
      });
    }

    const claudePrompt = `You are a PDF form layout and field management assistant. You can:
1. MOVE field positions (adjust x, y, width, height, font_size)
2. ADD new fields (to both the form definition and position map)
3. DELETE fields (remove from both form definition and position map)
4. CHANGE field properties (label, type, required status)

PDF uses US Letter (612 x 792 points), origin at BOTTOM-LEFT:
- x: 0 = left, 612 = right
- y: 0 = bottom, 792 = top
- Pages are 0-indexed in data but user says "page 1" = index 0

CURRENT FIELD POSITIONS:
${positionSummary}

CURRENT FORM STRUCTURE:
${fieldSummary}

USER INSTRUCTIONS:
"${instructions}"

Return ONLY valid JSON:
{
  "position_adjustments": [
    {
      "field_id": "existing_field_id",
      "positions": [{ "page": 0, "x": 100, "y": 500, "width": 200, "height": 20, "font_size": 10 }]
    }
  ],
  "new_fields": [
    {
      "field_id": "new_field_id_here",
      "label": "New Field Label",
      "type": "text",
      "required": false,
      "section_id": "section_to_add_to",
      "position": { "page": 0, "x": 100, "y": 400, "width": 200, "height": 20, "font_size": 10 }
    }
  ],
  "delete_fields": ["field_id_to_delete"],
  "field_changes": [
    {
      "field_id": "existing_field_id",
      "updates": { "label": "New Label", "type": "email", "required": true }
    }
  ],
  "explanation": "Brief description of all changes made"
}

RULES:
- Only include arrays that have entries (empty arrays can be omitted)
- For new field_id, use format: field_[timestamp]_[random] (make up plausible values)
- "move down" = DECREASE y, "move up" = INCREASE y
- "move left" = DECREASE x, "move right" = INCREASE x
- Small nudge = 10-15pt, medium = 25-40pt, large = 50+pt
- Keep values in bounds (x: 0-612, y: 0-792)
- For new fields, pick the most appropriate section_id from the existing sections
- Valid types: text, email, phone, date, number, textarea, signature, checkbox, checkbox_group, checkbox_grid, radio, select, file_upload
- Return ONLY the JSON, no other text`;

    messageContent.push({ type: 'text', text: claudePrompt });

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        ...(uploadedPdfBase64 ? { 'anthropic-beta': 'pdfs-2024-09-25' } : {}),
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: messageContent }],
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API error:', claudeResponse.status, errorText);
      return NextResponse.json(
        { error: `Claude API error: ${errorText.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const claudeData = await claudeResponse.json();
    const claudeContent = claudeData.content[0];

    if (!claudeContent || claudeContent.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected Claude response' }, { status: 500 });
    }

    // Parse response
    let result: {
      position_adjustments?: Array<{ field_id: string; positions: Array<{ page: number; x: number; y: number; width: number; height: number; font_size: number }> }>;
      new_fields?: Array<{ field_id: string; label: string; type: string; required: boolean; section_id: string; position: { page: number; x: number; y: number; width: number; height: number; font_size: number } }>;
      delete_fields?: string[];
      field_changes?: Array<{ field_id: string; updates: Record<string, any> }>;
      explanation: string;
    };

    try {
      let jsonText = claudeContent.text.trim();
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) jsonText = codeBlockMatch[1].trim();
      if (!jsonText.startsWith('{')) {
        const s = jsonText.indexOf('{');
        const e = jsonText.lastIndexOf('}');
        if (s !== -1 && e !== -1) jsonText = jsonText.slice(s, e + 1);
      }
      result = JSON.parse(jsonText.trim());
    } catch (e) {
      return NextResponse.json(
        { error: `Failed to parse response. Preview: ${claudeContent.text.slice(0, 300)}` },
        { status: 500 }
      );
    }

    // Apply all changes
    const updatedPositionMap = { ...currentPositionMap };
    const updatedSections = JSON.parse(JSON.stringify(currentSections));
    let positionsUpdated = 0;
    let fieldsAdded = 0;
    let fieldsDeleted = 0;
    let fieldsChanged = 0;

    for (const adj of (result.position_adjustments || [])) {
      if (updatedPositionMap[adj.field_id]) {
        updatedPositionMap[adj.field_id] = {
          ...updatedPositionMap[adj.field_id],
          positions: adj.positions.map(p => ({
            page: p.page,
            x: clamp(p.x, 0, 612),
            y: clamp(p.y, 0, 792),
            width: clamp(p.width, 10, 600),
            height: clamp(p.height, 5, 200),
            font_size: clamp(p.font_size, 6, 24),
          })),
        };
        positionsUpdated++;
      }
    }

    for (const nf of (result.new_fields || [])) {
      updatedPositionMap[nf.field_id] = {
        label: nf.label,
        positions: [{
          page: nf.position.page,
          x: clamp(nf.position.x, 0, 612),
          y: clamp(nf.position.y, 0, 792),
          width: clamp(nf.position.width, 10, 600),
          height: clamp(nf.position.height, 5, 200),
          font_size: clamp(nf.position.font_size, 6, 24),
        }],
      };

      const targetSection = updatedSections.find((s: any) => s.section_id === nf.section_id);
      if (targetSection) {
        targetSection.fields.push({
          field_id: nf.field_id,
          label: nf.label,
          type: nf.type,
          required: nf.required || false,
          order: targetSection.fields.length,
        });
        fieldsAdded++;
      } else if (updatedSections.length > 0) {
        updatedSections[updatedSections.length - 1].fields.push({
          field_id: nf.field_id,
          label: nf.label,
          type: nf.type,
          required: nf.required || false,
          order: updatedSections[updatedSections.length - 1].fields.length,
        });
        fieldsAdded++;
      }
    }

    for (const delId of (result.delete_fields || [])) {
      delete updatedPositionMap[delId];
      for (const section of updatedSections) {
        const before = section.fields.length;
        section.fields = section.fields.filter((f: any) => f.field_id !== delId);
        if (section.fields.length < before) fieldsDeleted++;
      }
    }

    for (const change of (result.field_changes || [])) {
      for (const section of updatedSections) {
        const field = section.fields.find((f: any) => f.field_id === change.field_id);
        if (field) {
          Object.assign(field, change.updates);
          if (change.updates.label && updatedPositionMap[change.field_id]) {
            updatedPositionMap[change.field_id].label = change.updates.label;
          }
          fieldsChanged++;
          break;
        }
      }
    }

    // Save position map
    const { error: packetUpdateError } = await supabase
      .from('form_packets')
      .update({
        field_position_map: updatedPositionMap,
        updated_at: new Date().toISOString(),
      })
      .eq('packet_id', packetData.packet_id);

    if (packetUpdateError) {
      return NextResponse.json(
        { error: `Failed to save positions: ${packetUpdateError.message}` },
        { status: 500 }
      );
    }

    // Save form definition if fields were modified
    if (fieldsAdded > 0 || fieldsDeleted > 0 || fieldsChanged > 0) {
      const { error: formUpdateError } = await supabase
        .from('form_definitions')
        .update({
          sections: updatedSections,
          updated_at: new Date().toISOString(),
        })
        .eq('form_id', formId);

      if (formUpdateError) {
        return NextResponse.json(
          { error: `Positions saved but form update failed: ${formUpdateError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      positions_updated: positionsUpdated,
      fields_added: fieldsAdded,
      fields_deleted: fieldsDeleted,
      fields_changed: fieldsChanged,
      explanation: result.explanation,
    });
  } catch (error) {
    console.error('Adjust error:', error);
    return NextResponse.json(
      { error: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, val)) * 10) / 10;
}

/**
 * GET: Return current position map + field summary
 * Add ?raw=true to get the raw position_map JSON for export/import
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<any>> {
  try {
    const { id: formId } = await params;
    const supabase = createServerSupabaseClient();

    const url = new URL(request.url);
    const rawExport = url.searchParams.get('raw') === 'true';

    const { data: packetData, error: packetError } = await supabase
      .from('form_packets')
      .select('packet_id, packet_name, field_position_map, template_pdf_base64')
      .eq('master_form_id', formId)
      .single();

    if (packetError || !packetData) {
      return NextResponse.json({ has_packet: false }, { status: 200 });
    }

    const positionMap: FieldPositionMap = packetData.field_position_map || {};

    // Raw export: return the position map as-is for editing
    if (rawExport) {
      return NextResponse.json({
        position_map: positionMap,
        field_count: Object.keys(positionMap).length,
        note: 'Edit this JSON and import it back. Coordinate system: origin at BOTTOM-LEFT, x=0-612 (left to right), y=0-792 (bottom to top). Pages are 0-indexed.',
      });
    }

    return NextResponse.json({
      has_packet: true,
      packet_id: packetData.packet_id,
      packet_name: packetData.packet_name,
      has_template: !!packetData.template_pdf_base64,
      field_count: Object.keys(positionMap).length,
      fields: Object.entries(positionMap).map(([fieldId, entry]) => ({
        field_id: fieldId,
        label: entry.label,
        position_count: entry.positions.length,
        positions: entry.positions.map(p => ({
          page: p.page + 1,
          x: Math.round(p.x),
          y: Math.round(p.y),
          width: Math.round(p.width),
          height: Math.round(p.height),
          font_size: p.font_size,
        })),
      })),
    });
  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json({ error: 'Failed to fetch position data' }, { status: 500 });
  }
}
