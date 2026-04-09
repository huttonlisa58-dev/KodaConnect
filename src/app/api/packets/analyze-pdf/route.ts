import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PDFDocument } from 'pdf-lib';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — needed for multi-batch Claude API calls with rate limit delays

/**
 * Field types we support
 */
type FieldType = 'text' | 'email' | 'phone' | 'date' | 'number' | 'textarea' | 'signature' | 'checkbox' | 'checkbox_group' | 'checkbox_grid' | 'radio' | 'select' | 'file_upload';
type FieldEntity = 'patient' | 'caregiver' | 'emergency_contact' | 'physician' | 'agency' | 'insurance' | 'shared' | 'unknown';

/**
 * What Claude returns per page-batch analysis
 */
interface ClaudePageResult {
  page_number: number;
  sub_form_name: string;
  is_continuation: boolean;
  has_legal_text: boolean;
  legal_text_content?: string;
  fields: {
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
    help_text?: string;
    entity?: string;
    options?: Array<{ value: string; label: string }>;
    rows?: Array<{ row_id: string; label: string }>;
    columns?: Array<{ col_id: string; label: string }>;
    pos: [number, number, number, number]; // [x%, y%, width%, height%]
  }[];
  grid_tables: {
    name: string;
    type: 'activity_grid' | 'schedule_grid' | 'checkbox_matrix' | 'safety_checklist' | 'generic_table';
    rows: Array<{ row_id: string; label: string }>;
    columns: Array<{ col_id: string; label: string }>;
    pos: [number, number, number, number];
    cell_positions?: Array<{
      row_id: string;
      col_id: string;
      pos: [number, number, number, number];
    }>;
  }[];
  boilerplate: string[];
  reference_only: boolean;
}

/**
 * Analyzed field for the output
 */
interface AnalyzedField {
  extracted_id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  help_text?: string;
  options?: Array<{ value: string; label: string }>;
  rows?: Array<{ row_id: string; label: string }>;
  columns?: Array<{ col_id: string; label: string }>;
  page_number: number;
  position?: { x: number; y: number; width: number; height: number };
  entity?: FieldEntity;
  cell_positions?: Array<{
    row_id: string;
    col_id: string;
    position: { x: number; y: number; width: number; height: number };
  }>;
}

/**
 * Analyzed sub-form output
 */
interface AnalyzedSubForm {
  sub_form_id: string;
  name: string;
  page_count: number;
  page_numbers: number[];
  fields: AnalyzedField[];
  legal_text?: string;
  boilerplate_sections: string[];
  reference_only: boolean;
}

// US Letter: 612 x 792 points
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

/** Simple delay helper */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const packetName = formData.get('packetName') as string;
    const companyId = formData.get('companyId') as string;

    if (!file) {
      return NextResponse.json({ error: 'PDF file is required' }, { status: 400 });
    }
    if (!file.type.includes('pdf')) {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }
    if (!packetName) {
      return NextResponse.json({ error: 'packetName is required' }, { status: 400 });
    }

    const claudeApiKey = process.env.ANTHROPIC_API_KEY;
    if (!claudeApiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const pdfBase64 = fileBuffer.toString('base64');

    // Load PDF with pdf-lib to get actual page count and enable page splitting
    const fullPdfDoc = await PDFDocument.load(fileBuffer);
    const actualPageCount = fullPdfDoc.getPageCount();
    console.log(`PDF loaded: ${actualPageCount} pages, ${fileBuffer.length} bytes`);

    // ====================================
    // PHASE 1: Get structure overview (sends full PDF once)
    // ====================================
    const overviewResult = await callClaudeWithRetry(
      apiKey => callClaudeForOverview(apiKey, pdfBase64),
      claudeApiKey
    );
    const pageGroups = overviewResult.page_groups || [];
    console.log(`Overview: ${pageGroups.length} page groups detected`);

    // ====================================
    // PHASE 2: Process pages in batches — send ONLY the needed pages per call
    // ====================================
    const batches = createPageBatches(actualPageCount, pageGroups);
    const allPageResults: ClaudePageResult[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      // Extract just the pages this batch needs into a small PDF
      const batchPdfBase64 = await extractPages(fileBuffer, batch.pages);
      console.log(`Batch ${i + 1}/${batches.length}: pages ${batch.pages.join(', ')} (${Math.round(Buffer.from(batchPdfBase64, 'base64').length / 1024)}KB)`);

      // Wait between batches to respect rate limits (3s since we now send small page-split PDFs)
      if (i > 0) {
        console.log('Waiting 3s between batches...');
        await sleep(3000);
      }

      const batchResults = await callClaudeWithRetry(
        apiKey => callClaudeForPages(apiKey, batchPdfBase64, batch.pages, batch.context),
        claudeApiKey
      );
      allPageResults.push(...batchResults);
    }

    // ====================================
    // PHASE 3: Stitch page results into sub-forms
    // ====================================
    const analyzedSubForms = stitchIntoSubForms(allPageResults);

    // Store analysis in Supabase
    const supabase = createServerSupabaseClient();
    const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (companyId) {
      const { error: insertError } = await supabase.from('packet_analyses').insert({
        analysis_id: analysisId,
        company_id: companyId,
        packet_name: packetName,
        page_count: actualPageCount,
        analyzed_data: { subforms: analyzedSubForms },
        created_at: new Date().toISOString(),
      });
      if (insertError) console.warn('Could not store analysis:', insertError);
    }

    const isSimple = analyzedSubForms.length <= 1 && actualPageCount <= 3;

    return NextResponse.json({
      success: true,
      analysis_id: analysisId,
      packet_name: packetName,
      page_count: actualPageCount,
      document_type: isSimple ? 'simple' : 'packet',
      is_simple: isSimple,
      subforms: analyzedSubForms,
    });
  } catch (error) {
    console.error('PDF analysis error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to analyze PDF: ${message}` }, { status: 500 });
  }
}

/**
 * Extract specific pages from a PDF into a new smaller PDF, returned as base64.
 * Pages are 1-indexed (matching Claude's page numbering).
 */
async function extractPages(pdfBuffer: Buffer, pages: number[]): Promise<string> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const newDoc = await PDFDocument.create();

  // Convert 1-indexed page numbers to 0-indexed
  const pageIndices = pages
    .map(p => p - 1)
    .filter(p => p >= 0 && p < srcDoc.getPageCount());

  const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  const newPdfBytes = await newDoc.save();
  return Buffer.from(newPdfBytes).toString('base64');
}

/**
 * Retry wrapper with exponential backoff for rate limit errors
 */
async function callClaudeWithRetry<T>(
  fn: (apiKey: string) => Promise<T>,
  apiKey: string,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(apiKey);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isRateLimit = lastError.message.includes('rate_limit') ||
                          lastError.message.includes('429') ||
                          lastError.message.includes('overloaded');

      if (isRateLimit && attempt < maxRetries) {
        // Exponential backoff: 15s, 30s, 60s
        const waitSec = 15 * Math.pow(2, attempt);
        console.log(`Rate limit hit, retrying in ${waitSec}s (attempt ${attempt + 1}/${maxRetries})...`);
        await sleep(waitSec * 1000);
      } else if (!isRateLimit) {
        throw lastError; // Non-rate-limit errors throw immediately
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Phase 1: Quick overview call to get page count and sub-form structure
 */
async function callClaudeForOverview(apiKey: string, pdfBase64: string): Promise<{
  total_pages: number;
  page_groups: Array<{ name: string; pages: number[]; has_legal_text: boolean }>;
}> {
  const prompt = `You are a form analyzer. I will show you a PDF document. Give me a quick overview:

1. How many pages total?
2. What distinct forms/sections does this document contain?
3. Which pages belong to which form?
4. Which sections contain mostly legal/policy text (vs. fillable fields)?

Return ONLY valid JSON:
{
  "total_pages": 15,
  "page_groups": [
    { "name": "Client Intake Form", "pages": [1, 2], "has_legal_text": false },
    { "name": "Client Service Agreement", "pages": [3, 4, 5, 6, 7], "has_legal_text": true },
    { "name": "Client Notice of Direct Care Worker Status", "pages": [8], "has_legal_text": true },
    { "name": "Keeping Your Home and Valuables Safe", "pages": [9], "has_legal_text": true }
  ]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude overview API error (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data.content[0]?.text || '';
  return parseJson(text);
}

/**
 * Phase 2: Detailed field extraction for a batch of pages.
 * Receives a SMALL PDF containing only the batch pages (not the full document).
 */
async function callClaudeForPages(
  apiKey: string,
  batchPdfBase64: string,
  originalPageNumbers: number[],
  context: string
): Promise<ClaudePageResult[]> {
  const pagesStr = originalPageNumbers.join(', ');

  // The batch PDF has pages re-numbered starting from 1,
  // but we tell Claude the original page numbers
  const pageMapping = originalPageNumbers.map((origPage, idx) =>
    `PDF page ${idx + 1} in this document = original page ${origPage}`
  ).join('\n');

  const prompt = `You are an expert form field extractor. I will show you a PDF document containing specific pages from a larger form packet.

PAGE MAPPING:
${pageMapping}

${context}

For each page, extract:
1. ALL fillable fields (text inputs, checkboxes, signature lines, date fields, etc.)
2. Any grid/table structures (e.g., "Activities of Daily Living" matrix, schedule tables, checkbox grids)
3. Legal/policy text content (the actual text, not just a label)
4. Whether the page is a continuation of a sub-form from the previous page

ENTITY TYPES - Tag each field with who provides the data:
- "patient" = patient, client, consumer, applicant
- "caregiver" = caregiver, employee, staff, worker, aide
- "emergency_contact" = emergency contact, next of kin
- "physician" = physician, doctor, prescriber
- "agency" = agency, company, organization (office-filled)
- "insurance" = insurance, Medicaid, Medicare
- "shared" = truly shared between entities
- "unknown" = cannot determine

CRITICAL RULES:
- Look for EVERY blank line, underscored space, checkbox, or signature line
- Fields in tables need individual extraction — each cell that can be filled is a field
- For grids (like Activities of Daily Living), extract the full row/column structure
- Position [x%, y%, width%, height%] = percentage from left edge, top edge OF THAT PAGE
- Typical field heights: text ~3%, textarea ~8-12%, signature ~6-8%, checkbox ~2%
- When you see _____ (underscores) or blank lines, those ARE fields
- IMPORTANT: Use the ORIGINAL page numbers in your response (not the re-numbered pages in this PDF)

Return ONLY valid JSON array:
[
  {
    "page_number": ${originalPageNumbers[0]},
    "sub_form_name": "Client Intake Form",
    "is_continuation": false,
    "has_legal_text": false,
    "legal_text_content": null,
    "fields": [
      { "label": "Name of Client", "type": "text", "required": false, "entity": "patient", "pos": [15, 18, 40, 3] },
      { "label": "Date", "type": "date", "required": false, "entity": "shared", "pos": [60, 18, 25, 3] }
    ],
    "grid_tables": [],
    "boilerplate": [],
    "reference_only": false
  }
]`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: batchPdfBase64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error for pages ${pagesStr}: ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data.content[0]?.text || '';

  if (data.stop_reason === 'max_tokens') {
    console.warn(`Claude response truncated for pages ${pagesStr}`);
  }

  return parseJson(text);
}

/**
 * Create page batches for processing (respecting sub-form boundaries)
 * Uses larger batches (up to 5 pages) to reduce total API calls
 */
function createPageBatches(
  pageCount: number,
  pageGroups: Array<{ name: string; pages: number[]; has_legal_text: boolean }>
): Array<{ pages: number[]; context: string }> {
  const batches: Array<{ pages: number[]; context: string }> = [];

  if (pageGroups.length > 0) {
    for (const group of pageGroups) {
      const pages = group.pages;
      // Use batches of up to 5 pages to reduce total API calls
      for (let i = 0; i < pages.length; i += 5) {
        const batchPages = pages.slice(i, i + 5);
        const context = `These pages belong to "${group.name}".${
          group.has_legal_text ? ' This section contains legal/policy text - extract the full text content.' : ''
        }${i > 0 ? ' This is a continuation of the same sub-form.' : ''}`;
        batches.push({ pages: batchPages, context });
      }
    }
  } else {
    // Fallback: batches of 3
    for (let i = 1; i <= pageCount; i += 3) {
      const batchPages: number[] = [];
      for (let p = i; p <= Math.min(i + 2, pageCount); p++) {
        batchPages.push(p);
      }
      batches.push({ pages: batchPages, context: '' });
    }
  }

  return batches;
}

/**
 * Stitch page-by-page results into coherent sub-forms
 */
function stitchIntoSubForms(pageResults: ClaudePageResult[]): AnalyzedSubForm[] {
  const sorted = [...pageResults].sort((a, b) => a.page_number - b.page_number);

  const subForms: AnalyzedSubForm[] = [];
  let currentSubForm: AnalyzedSubForm | null = null;

  for (const pageResult of sorted) {
    const startNewSubForm = !pageResult.is_continuation || !currentSubForm ||
      (currentSubForm && currentSubForm.name !== pageResult.sub_form_name);

    if (startNewSubForm) {
      if (currentSubForm) {
        subForms.push(currentSubForm);
      }

      currentSubForm = {
        sub_form_id: `subform_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: pageResult.sub_form_name,
        page_count: 1,
        page_numbers: [pageResult.page_number],
        fields: [],
        legal_text: pageResult.has_legal_text ? (pageResult.legal_text_content || '') : undefined,
        boilerplate_sections: pageResult.boilerplate || [],
        reference_only: pageResult.reference_only || false,
      };
    } else if (currentSubForm) {
      currentSubForm.page_count++;
      currentSubForm.page_numbers.push(pageResult.page_number);
      if (pageResult.has_legal_text && pageResult.legal_text_content) {
        currentSubForm.legal_text = (currentSubForm.legal_text || '') + '\n\n' + pageResult.legal_text_content;
      }
      currentSubForm.boilerplate_sections.push(...(pageResult.boilerplate || []));
    }

    if (!currentSubForm) continue;

    // Add regular fields
    for (const field of pageResult.fields) {
      let position: { x: number; y: number; width: number; height: number } | undefined;
      if (field.pos && Array.isArray(field.pos) && field.pos.length === 4) {
        position = percentToPdfPoints(field.pos as [number, number, number, number]);
      }

      currentSubForm.fields.push({
        extracted_id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        label: field.label,
        type: mapFieldType(field.type),
        required: false,
        placeholder: field.placeholder,
        help_text: field.help_text,
        options: field.options,
        rows: field.rows,
        columns: field.columns,
        page_number: pageResult.page_number,
        position,
        entity: mapEntity(field.entity),
      });
    }

    // Add grid/table fields as checkbox_grid type
    for (const grid of pageResult.grid_tables || []) {
      let position: { x: number; y: number; width: number; height: number } | undefined;
      if (grid.pos && Array.isArray(grid.pos) && grid.pos.length === 4) {
        position = percentToPdfPoints(grid.pos as [number, number, number, number]);
      }

      // Convert cell positions from percentages to PDF points (safely)
      let cellPositions: Array<{ row_id: string; col_id: string; position: { x: number; y: number; width: number; height: number } }> | undefined;
      try {
        if (grid.cell_positions && Array.isArray(grid.cell_positions)) {
          cellPositions = grid.cell_positions
            .filter((cp: any) => cp?.pos && Array.isArray(cp.pos) && cp.pos.length === 4)
            .map((cp: any) => ({
              row_id: cp.row_id,
              col_id: cp.col_id,
              position: percentToPdfPoints(cp.pos as [number, number, number, number]),
            }));
        }
      } catch (e) {
        console.warn('Failed to parse cell_positions for grid:', grid.name, e);
      }

      currentSubForm.fields.push({
        extracted_id: `grid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        label: grid.name,
        type: 'checkbox_grid',
        required: false,
        rows: grid.rows,
        columns: grid.columns,
        page_number: pageResult.page_number,
        position,
        entity: 'patient',
        cell_positions: cellPositions,
      });
    }
  }

  if (currentSubForm) {
    subForms.push(currentSubForm);
  }

  return subForms;
}

/**
 * Convert percentage positions to PDF points
 */
function percentToPdfPoints(pos: [number, number, number, number]): {
  x: number; y: number; width: number; height: number;
} {
  const [xPct, yPct, wPct, hPct] = pos;
  const x = (xPct / 100) * PAGE_WIDTH;
  const width = (wPct / 100) * PAGE_WIDTH;
  const height = (hPct / 100) * PAGE_HEIGHT;
  // PDF origin is bottom-left; Claude gives top-left percentages
  const y = PAGE_HEIGHT - (yPct / 100) * PAGE_HEIGHT - height;
  return { x, y, width, height };
}

function mapEntity(entityStr?: string): FieldEntity | undefined {
  if (!entityStr) return undefined;
  const e = entityStr.toLowerCase().trim();
  if (e === 'patient' || e === 'client' || e === 'consumer') return 'patient';
  if (e === 'caregiver' || e === 'employee' || e === 'staff') return 'caregiver';
  if (e === 'emergency_contact' || e === 'emergency contact') return 'emergency_contact';
  if (e === 'physician' || e === 'doctor') return 'physician';
  if (e === 'agency' || e === 'company') return 'agency';
  if (e === 'insurance') return 'insurance';
  if (e === 'shared') return 'shared';
  return 'unknown';
}

function mapFieldType(claudeType: string): FieldType {
  const type = claudeType.toLowerCase().trim();
  if (type.includes('email')) return 'email';
  if (type.includes('phone') || type.includes('tel')) return 'phone';
  if (type.includes('date')) return 'date';
  if (type.includes('number') || type.includes('numeric')) return 'number';
  if (type.includes('textarea') || type.includes('multiline')) return 'textarea';
  if (type.includes('signature') || type.includes('sign')) return 'signature';
  if (type.includes('checkbox') && type.includes('group')) return 'checkbox_group';
  if (type.includes('checkbox') && type.includes('grid')) return 'checkbox_grid';
  if (type.includes('checkbox')) return 'checkbox';
  if (type.includes('radio')) return 'radio';
  if (type.includes('select') || type.includes('dropdown')) return 'select';
  if (type.includes('file') || type.includes('upload')) return 'file_upload';
  return 'text';
}

function parseJson(text: string): any {
  let jsonText = text.trim();

  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }

  if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
    const jsonStart = Math.min(
      jsonText.indexOf('{') === -1 ? Infinity : jsonText.indexOf('{'),
      jsonText.indexOf('[') === -1 ? Infinity : jsonText.indexOf('[')
    );
    const jsonEnd = Math.max(jsonText.lastIndexOf('}'), jsonText.lastIndexOf(']'));
    if (jsonStart !== Infinity && jsonEnd !== -1) {
      jsonText = jsonText.slice(jsonStart, jsonEnd + 1);
    }
  }

  return JSON.parse(jsonText.trim());
}
