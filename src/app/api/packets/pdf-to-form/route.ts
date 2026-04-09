import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const buildPrompt = (formName: string, company: string) => `You are a KodaConnect form specialist. Analyze this PDF form and generate a complete KodaConnect JSON package.

Return a JSON object with this EXACT structure:

{
  "form_package": {
    "version": "1.0",
    "form_name": "EXACT form title from document",
    "company": "${company}",
    "render_mode": "generated",
    "total_pages": <number>,
    "page_sizes": {"1": [612.0, 792.0]},
    "coordinate_system": "top-left"
  },
  "sub_forms": [
    {
      "id": "snake_case_unique_id",
      "name": "Section Name",
      "pages": [1],
      "always_show": true,
      "fields": [
        {
          "id": "form_id__field_name",
          "type": "text|textarea|date|time|phone|email|number|radio|checkbox|checkbox_group|select|signature",
          "label": "Exact field label",
          "entity": "employee|patient|shared",
          "page": 1,
          "pos": {"x": 0, "y": 0, "w": 0, "h": 0},
          "required": true,
          "options": [{"value": "val", "label": "Label"}],
          "show_if": {"field": "other_field_id", "equals": "value"},
          "always_render": true,
          "default_today": true,
          "auto_fill_from": "profile",
          "signer_role": "hr_admin"
        }
      ]
    }
  ]
}

RULES:
1. Detect EVERY field in the form - text boxes, checkboxes, radio buttons, signatures, dates
2. Group fields by logical sections
3. entity: patient=member/client, employee=caregiver/attendant/staff, shared=visit data
4. For radio/select: add options array AND always_render:true
5. For conditional fields: add show_if pointing to the triggering field
6. For signature date fields: add default_today:true
7. For name/address/phone: add auto_fill_from:"profile"
8. For supervisor/reviewer only fields: add signer_role:"hr_admin"
9. IDs must be unique snake_case: prefix__fieldname
10. Return ONLY valid JSON. No markdown backticks, no explanation text.`;

async function analyzePdfWithClaude(pdfBase64: string, formName: string, company: string): Promise<any> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          } as any,
          {
            type: 'text',
            text: buildPrompt(formName, company),
          },
        ],
      },
    ],
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No response from Claude');
  }

  let text = textContent.text.trim();
  
  // Strip markdown code blocks if present
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  // Find JSON object
  const startIdx = text.indexOf('{');
  const endIdx = text.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('No JSON object found in Claude response');
  }
  
  const jsonStr = text.substring(startIdx, endIdx + 1);

  let pkg: any;
  try {
    pkg = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse JSON from Claude: ${e}`);
  }

  // Validate and fix structure
  if (!pkg.form_package || !pkg.sub_forms) {
    throw new Error('Claude response missing form_package or sub_forms');
  }

  // Fix form_package
  pkg.form_package.version = pkg.form_package.version || '1.0';
  pkg.form_package.company = pkg.form_package.company || company;
  pkg.form_package.render_mode = pkg.form_package.render_mode || 'generated';
  pkg.form_package.coordinate_system = 'top-left';
  pkg.form_package.total_pages = pkg.form_package.total_pages || 1;

  if (!pkg.form_package.page_sizes) {
    pkg.form_package.page_sizes = {};
    for (let i = 1; i <= pkg.form_package.total_pages; i++) {
      pkg.form_package.page_sizes[String(i)] = [612.0, 792.0];
    }
  }

  const safeId = (pkg.form_package.form_name || formName)
    .toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/, '');

  // Fix each sub_form and field
  for (let sfIdx = 0; sfIdx < pkg.sub_forms.length; sfIdx++) {
    const sf = pkg.sub_forms[sfIdx];

    if (!sf.id) sf.id = `${safeId}_section_${sfIdx + 1}`;
    if (!sf.name) sf.name = `Section ${sfIdx + 1}`;
    if (!Array.isArray(sf.pages)) sf.pages = [typeof sf.pages === 'number' ? sf.pages : 1];
    if (sf.always_show === undefined) sf.always_show = true;

    sf.fields = (sf.fields || []).map((field: any, fIdx: number) => {
      if (!field.id) field.id = `${sf.id}__field_${fIdx + 1}`;
      if (!field.label) field.label = `Field ${fIdx + 1}`;
      if (!field.type) field.type = 'text';
      if (!field.entity || !['employee','patient','shared','caregiver','unknown','agency','physician'].includes(field.entity)) {
        field.entity = 'shared';
      }
      if (typeof field.page !== 'number' || field.page < 1) {
        field.page = sf.pages[0] || 1;
      }
      if (!field.pos || typeof field.pos !== 'object') {
        field.pos = { x: 0, y: 0, w: 0, h: 0 };
      } else {
        field.pos = {
          x: Number(field.pos.x) || 0,
          y: Number(field.pos.y) || 0,
          w: Number(field.pos.w) || 0,
          h: Number(field.pos.h) || 0,
        };
      }
      if (typeof field.required !== 'boolean') {
        field.required = false;
      }
      return field;
    });
  }

  return pkg;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { pdf_base64, document_name, company = 'Complete Homecare' } = body;

    if (!pdf_base64) {
      return NextResponse.json({ error: 'pdf_base64 is required' }, { status: 400 });
    }

    if (!document_name) {
      return NextResponse.json({ error: 'document_name is required' }, { status: 400 });
    }

    console.log(`[pdf-to-form] Analyzing: "${document_name}"`);

    const jsonPackage = await analyzePdfWithClaude(pdf_base64, document_name, company);

    const totalFields = jsonPackage.sub_forms.reduce(
      (sum: number, sf: any) => sum + (sf.fields?.length || 0), 0
    );

    console.log(`[pdf-to-form] Done: ${jsonPackage.sub_forms.length} sections, ${totalFields} fields`);

    return NextResponse.json({
      success: true,
      json_package: jsonPackage,
      page_count: jsonPackage.form_package.total_pages,
      field_count: totalFields,
      section_count: jsonPackage.sub_forms.length,
    });

  } catch (error) {
    console.error('[pdf-to-form] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze PDF' },
      { status: 500 }
    );
  }
}
