import { PDFDocument } from 'pdf-lib';

// US Letter: 612 x 792 points
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

/**
 * Field types we support
 */
export type FieldType = 'text' | 'email' | 'phone' | 'date' | 'number' | 'textarea' | 'signature' | 'checkbox' | 'checkbox_group' | 'checkbox_grid' | 'radio' | 'select' | 'file_upload';
export type FieldEntity = 'patient' | 'caregiver' | 'emergency_contact' | 'physician' | 'agency' | 'insurance' | 'shared' | 'unknown';

/**
 * What Claude returns per page-batch analysis
 */
export interface ClaudePageResult {
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
export interface AnalyzedField {
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

/** Simple delay helper */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract specific pages from a PDF into a new smaller PDF, returned as base64.
 * Pages are 1-indexed (matching Claude's page numbering).
 */
export async function extractPages(pdfBuffer: Buffer, pages: number[]): Promise<string> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const newDoc = await PDFDocument.create();

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
export async function callClaudeWithRetry<T>(
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
        const waitSec = 15 * Math.pow(2, attempt);
        console.log(`Rate limit hit, retrying in ${waitSec}s (attempt ${attempt + 1}/${maxRetries})...`);
        await sleep(waitSec * 1000);
      } else if (!isRateLimit) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Call Claude to extract fields from specific pages, with optional user hints.
 */
export async function callClaudeForPages(
  apiKey: string,
  batchPdfBase64: string,
  originalPageNumbers: number[],
  context: string,
  userHint?: string,
  existingFieldLabels?: string[]
): Promise<ClaudePageResult[]> {
  const pagesStr = originalPageNumbers.join(', ');

  const pageMapping = originalPageNumbers.map((origPage, idx) =>
    `PDF page ${idx + 1} in this document = original page ${origPage}`
  ).join('\n');

  let userFeedback = '';
  if (userHint) {
    userFeedback = `\n\nIMPORTANT USER FEEDBACK: The user reviewed the initial extraction and noted: "${userHint}"\nPlease look VERY carefully for these fields. Pay close attention to blank lines, underscored spaces, and checkbox squares that may have been missed.`;
  }
  if (existingFieldLabels && existingFieldLabels.length > 0) {
    userFeedback += `\n\nAlready detected fields (may need correction): ${existingFieldLabels.join(', ')}`;
  }

  const prompt = `You are an expert form field extractor. I will show you a PDF document containing specific pages from a larger form packet.

PAGE MAPPING:
${pageMapping}

${context}${userFeedback}

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
- For grids (like Activities of Daily Living), extract the full row/column structure AND individual cell_positions
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
    "grid_tables": [
      {
        "name": "Activities of Daily Living",
        "type": "activity_grid",
        "rows": [{ "row_id": "bathing", "label": "Bathing" }],
        "columns": [{ "col_id": "independent", "label": "Independent" }],
        "pos": [5, 40, 90, 30],
        "cell_positions": [
          { "row_id": "bathing", "col_id": "independent", "pos": [20, 45, 8, 3] }
        ]
      }
    ],
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
 * Convert percentage positions to PDF points
 */
export function percentToPdfPoints(pos: [number, number, number, number]): {
  x: number; y: number; width: number; height: number;
} {
  const [xPct, yPct, wPct, hPct] = pos;
  const x = (xPct / 100) * PAGE_WIDTH;
  const width = (wPct / 100) * PAGE_WIDTH;
  const height = (hPct / 100) * PAGE_HEIGHT;
  const y = PAGE_HEIGHT - (yPct / 100) * PAGE_HEIGHT - height;
  return { x, y, width, height };
}

export function mapEntity(entityStr?: string): FieldEntity | undefined {
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

export function mapFieldType(claudeType: string): FieldType {
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

export function parseJson(text: string): any {
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

  return JSON.parse(jsonText);
}

/**
 * Convert Claude page results into AnalyzedField array
 */
export function pageResultsToFields(pageResults: ClaudePageResult[]): AnalyzedField[] {
  const fields: AnalyzedField[] = [];

  for (const pageResult of pageResults) {
    // Add regular fields
    for (const field of pageResult.fields) {
      let position: { x: number; y: number; width: number; height: number } | undefined;
      if (field.pos && Array.isArray(field.pos) && field.pos.length === 4) {
        position = percentToPdfPoints(field.pos as [number, number, number, number]);
      }

      fields.push({
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

    // Add grid/table fields
    for (const grid of pageResult.grid_tables || []) {
      let position: { x: number; y: number; width: number; height: number } | undefined;
      if (grid.pos && Array.isArray(grid.pos) && grid.pos.length === 4) {
        position = percentToPdfPoints(grid.pos as [number, number, number, number]);
      }

      // Convert cell positions from percentages to PDF points
      const cellPositions = grid.cell_positions?.map(cp => ({
        row_id: cp.row_id,
        col_id: cp.col_id,
        position: percentToPdfPoints(cp.pos as [number, number, number, number]),
      }));

      fields.push({
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

  return fields;
}
