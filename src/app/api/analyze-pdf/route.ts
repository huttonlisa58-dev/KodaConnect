import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getAnthropicClient, deduplicateFields, DetectedField } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large PDFs

// Generate document summary from first page
async function generateDocumentSummary(
  imageBase64: string,
  documentName: string
): Promise<string> {
  const client = getAnthropicClient();

  const SUMMARY_PROMPT = `You are analyzing a document form. Based on the document image and its name "${documentName}", provide a clear, concise summary that explains:

1. What this document is for (its purpose)
2. Who needs to fill it out
3. What key information will be collected
4. Any important notes about the document

Write the summary in 2-3 paragraphs, using plain language that an applicant would easily understand. The summary should help someone understand what they're about to fill out before they begin.

Return ONLY the summary text, no JSON or formatting.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: SUMMARY_PROMPT,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (textContent && textContent.type === 'text') {
      return textContent.text.trim();
    }
  } catch (e) {
    console.error('Failed to generate document summary:', e);
  }

  return `This is the ${documentName} form. Please review the document and fill out all required fields.`;
}

// Analyze a single page image
async function analyzePageImage(
  imageBase64: string,
  pageNumber: number
): Promise<{ page: number; fields: Array<{ label: string; type: string; required: boolean; options?: string[] }> }> {
  const client = getAnthropicClient();

  const FIELD_DETECTION_PROMPT = `You are analyzing a PDF form page to detect all fillable fields.

For each field you detect, identify:
1. The field label/name (what it's asking for)
2. The field type (text, date, phone, email, ssn, checkbox, signature, initial, textarea, radio, checkbox_group, number, currency)
3. Whether it appears to be required (marked with * or "required")
4. Any options if it's a multiple choice field

Common fields to look for:
- Name fields (First Name, Last Name, Full Name, Applicant Name, etc.)
- Contact info (Phone, Email, Address, City, State, ZIP)
- Identity info (SSN, Date of Birth, Gender)
- Employment info (Employer, Position, Start Date, Salary)
- Checkboxes (Yes/No questions, acknowledgments)
- Signatures and initials with dates
- Date fields
- Emergency contact info
- Medical/health information

Return a JSON array of detected fields. Example format:
[
  {"label": "First Name", "type": "text", "required": true},
  {"label": "Social Security Number", "type": "ssn", "required": true},
  {"label": "Date of Birth", "type": "date", "required": true},
  {"label": "I agree to the terms", "type": "checkbox", "required": true},
  {"label": "Applicant Signature", "type": "signature", "required": true},
  {"label": "Employment Status", "type": "radio", "required": true, "options": ["Full-time", "Part-time", "Contract"]}
]

Only return the JSON array, no other text. If no fields are detected on this page, return an empty array [].`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: FIELD_DETECTION_PROMPT,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return { page: pageNumber, fields: [] };
    }

    const jsonMatch = textContent.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const fields = JSON.parse(jsonMatch[0]);
      return { page: pageNumber, fields };
    }
  } catch (e) {
    console.error(`Failed to analyze page ${pageNumber}:`, e);
  }

  return { page: pageNumber, fields: [] };
}

export async function POST(request: NextRequest) {
  try {
    console.log('PDF Analysis API called');

    // Check Anthropic API key first
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY environment variable is not set');
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { template_id, page_images } = body;

    console.log('Received analysis request for template:', template_id);
    console.log('Number of pages:', page_images?.length);

    // page_images is an array of { page: number, image: string (base64) }
    if (!template_id || !page_images || !Array.isArray(page_images)) {
      return NextResponse.json(
        { error: 'template_id and page_images array are required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Verify template exists
    const { data: template, error: templateError } = await supabase
      .from('document_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Analyze each page (process in batches to avoid rate limits)
    const rawFieldsByPage: Array<{ page: number; fields: Array<{ label: string; type: string; required: boolean; options?: string[] }> }> = [];

    console.log(`Starting analysis of ${page_images.length} pages...`);

    for (const { page, image } of page_images) {
      console.log(`Analyzing page ${page}...`);
      try {
        const result = await analyzePageImage(image, page);
        rawFieldsByPage.push(result);
        console.log(`Page ${page} analyzed, found ${result.fields.length} fields`);
      } catch (pageError) {
        console.error(`Error analyzing page ${page}:`, pageError);
        // Continue with other pages even if one fails
        rawFieldsByPage.push({ page, fields: [] });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // De-duplicate fields across all pages
    const deduplicatedFields = deduplicateFields(rawFieldsByPage);

    // Generate document summary from first page
    console.log('Generating document summary...');
    let documentSummary = '';
    if (page_images.length > 0) {
      documentSummary = await generateDocumentSummary(
        page_images[0].image,
        template.name
      );
      console.log('Summary generated:', documentSummary.substring(0, 100) + '...');
    }

    // Store the detection results
    const detectionResult = {
      template_id,
      total_pages: page_images.length,
      detected_fields: deduplicatedFields,
      raw_fields_by_page: rawFieldsByPage,
      status: 'pending_review',
      created_at: new Date().toISOString(),
    };

    // Store in a new table or as JSON in document_templates
    const { error: updateError } = await supabase
      .from('document_templates')
      .update({
        detected_fields: detectionResult,
        summary: documentSummary,
        summary_approved: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', template_id);

    if (updateError) {
      console.error('Failed to save detection results:', updateError);
      return NextResponse.json(
        { error: 'Failed to save detection results' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      template_id,
      total_pages: page_images.length,
      total_fields_detected: rawFieldsByPage.reduce((sum, p) => sum + p.fields.length, 0),
      unique_fields: deduplicatedFields.length,
      fields: deduplicatedFields,
      summary: documentSummary,
    });

  } catch (error) {
    console.error('PDF analysis error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
