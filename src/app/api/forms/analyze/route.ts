import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getAnthropicClient } from '@/lib/anthropic';
import { PDFDocument } from 'pdf-lib';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large PDFs

/**
 * POST /api/forms/analyze
 * Analyze a PDF to extract field definitions
 * Sends the PDF directly to Claude's API using native document support
 * (no canvas/pdfjs-dist rendering needed — works in serverless environments)
 */
export async function POST(request: NextRequest) {
  try {
    // Check Anthropic API key first
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY environment variable is not set');
      return NextResponse.json(
        { error: 'Anthropic API key not configured. Please set ANTHROPIC_API_KEY in your environment variables.' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const companyId = formData.get('company_id') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      );
    }

    if (!companyId) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const buffer = await file.arrayBuffer();

    // Load PDF to get page count
    const pdfDoc = await PDFDocument.load(buffer);
    const pageCount = pdfDoc.getPageCount();

    // Convert PDF buffer to base64 for Claude's native document support
    const pdfBase64 = Buffer.from(buffer).toString('base64');

    // Use Claude to analyze the PDF directly (native PDF support, no canvas needed)
    const client = getAnthropicClient();

    const FORM_ANALYSIS_PROMPT = `Analyze this PDF document thoroughly. This document likely contains BOTH static content (policy text, legal language, instructions) AND fillable fields (signature lines, name fields, date fields, etc.).

Your job is to extract EVERYTHING — both the readable text content AND the fillable form fields — organized into logical sections.

IMPORTANT RULES:
- Preserve ALL document text content. Do NOT summarize or skip sections of text.
- Each section should have a "content" field containing the FULL text of that section exactly as written in the document.
- Include bullet points, sub-items, and all formatting details in the content.
- Only the sections that contain actual fillable fields (like signature lines, name blanks, date blanks) should have entries in the "fields" array.
- Sections that are purely informational text should have an empty "fields" array.

Return a JSON object with this structure:
{
  "form_name": "Document Title",
  "doc_number": "Document number if visible (e.g., Doc. No: XTC-LGL08_rev.04)",
  "description": "Brief description of what this document is",
  "sections": [
    {
      "title": "Section Heading",
      "content": "The FULL text content of this section, preserving all paragraphs, bullet points, and details. Use \\n for line breaks and \\n\\n for paragraph breaks. Use • for bullet points and ○ for sub-bullets.",
      "summary": "A 2-3 sentence plain-language summary of this section for mobile quick-review mode. Write it so a caregiver can understand the key points without reading the full text.",
      "fields": []
    },
    {
      "title": "Acknowledgment Section",
      "content": "The text of the acknowledgment section that appears before the signature fields.",
      "summary": "A 2-3 sentence summary of what you are acknowledging by signing.",
      "fields": [
        {
          "label": "Print Name",
          "type": "text",
          "required": true
        },
        {
          "label": "Signature",
          "type": "signature",
          "required": true
        },
        {
          "label": "Date",
          "type": "date",
          "required": true
        }
      ]
    }
  ]
}

Return ONLY valid JSON, no other text.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16384,
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
            },
            {
              type: 'text',
              text: FORM_ANALYSIS_PROMPT,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { error: 'Failed to analyze PDF' },
        { status: 500 }
      );
    }

    // Parse the JSON response
    let formAnalysis;
    try {
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      formAnalysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse form analysis:', parseError);
      return NextResponse.json(
        { error: 'Failed to parse form analysis from PDF' },
        { status: 500 }
      );
    }

    // Transform to FormDefinition structure
    const formId = `form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const formDefinition = {
      form_id: formId,
      form_name: formAnalysis.form_name || file.name.replace('.pdf', ''),
      doc_number: formAnalysis.doc_number || undefined,
      version: '1.0',
      company_id: companyId,
      description: formAnalysis.description,
      status: 'draft',
      sections: (formAnalysis.sections || []).map((section: any, sectionIndex: number) => ({
        section_id: `section_${sectionIndex}`,
        title: section.title,
        description: section.description,
        content: section.content || undefined,
        summary: section.summary || undefined,
        order: sectionIndex,
        fields: (section.fields || []).map((field: any, fieldIndex: number) => ({
          field_id: `field_${sectionIndex}_${fieldIndex}`,
          label: field.label,
          type: field.type || 'text',
          required: field.required || false,
          placeholder: field.placeholder,
          help_text: field.help_text,
          order: fieldIndex,
          ...(field.options && { options: field.options }),
        })),
      })),
      created_at: now,
      updated_at: now,
    };

    return NextResponse.json({
      success: true,
      form_definition: formDefinition,
      pages_analyzed: pageCount,
      total_pages: pageCount,
    });
  } catch (error) {
    console.error('Form analysis error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
