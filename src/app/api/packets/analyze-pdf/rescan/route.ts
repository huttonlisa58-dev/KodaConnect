import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  extractPages,
  callClaudeWithRetry,
  callClaudeForPages,
  pageResultsToFields,
  type AnalyzedField,
} from '@/lib/pdf-analyze-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutes for re-scanning a few pages

/**
 * POST /api/packets/analyze-pdf/rescan
 *
 * Re-scans specific pages of a PDF with user feedback about missed fields.
 * Used when the AI extraction missed fields during initial import.
 *
 * FormData:
 *   - file: PDF file
 *   - pages: JSON array of 1-indexed page numbers to re-scan
 *   - userComment: User's description of missing fields
 *   - existingFieldLabels: JSON array of already-detected field labels
 *   - companyId: Company ID for auth
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = createServerSupabaseClient();
    const formData = await request.formData();

    const file = formData.get('file') as File | null;
    const pagesJson = formData.get('pages') as string;
    const userComment = formData.get('userComment') as string;
    const existingLabelsJson = formData.get('existingFieldLabels') as string;
    const companyId = formData.get('companyId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });
    }
    if (!pagesJson || !userComment) {
      return NextResponse.json({ error: 'Pages and user comment are required' }, { status: 400 });
    }

    const pages: number[] = JSON.parse(pagesJson);
    const existingFieldLabels: string[] = existingLabelsJson ? JSON.parse(existingLabelsJson) : [];

    if (pages.length === 0) {
      return NextResponse.json({ error: 'At least one page number is required' }, { status: 400 });
    }

    // Get API key from company settings
    const { data: company } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .single();

    const apiKey = company?.settings?.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
    }

    // Read PDF buffer
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Extract just the pages we need to re-scan
    const batchPdfBase64 = await extractPages(pdfBuffer, pages);

    // Build context for Claude
    const context = `This is a RE-SCAN of specific pages from a form packet. The initial extraction missed some fields. Please be extra thorough and look for every possible fillable field.`;

    // Call Claude with the user's feedback
    const pageResults = await callClaudeWithRetry(
      (key) => callClaudeForPages(
        key,
        batchPdfBase64,
        pages,
        context,
        userComment,
        existingFieldLabels
      ),
      apiKey,
      2 // fewer retries for re-scan
    );

    // Convert to AnalyzedField array
    const fields = pageResultsToFields(pageResults);

    console.log(`Re-scan complete: found ${fields.length} fields on pages [${pages.join(', ')}]`);

    return NextResponse.json({
      success: true,
      fields,
      pageResults, // Include raw results for debugging
    });
  } catch (error) {
    console.error('Re-scan error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Re-scan failed' },
      { status: 500 }
    );
  }
}
