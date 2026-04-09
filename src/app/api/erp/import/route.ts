/**
 * CSV/Excel Import API
 * POST: Upload and parse CSV/Excel file
 * PUT: Confirm import with final column mapping
 */

import { NextRequest, NextResponse } from 'next/server';
import { CSVImportAdapter, suggestColumnMapping } from '@/lib/erp/csv-import';
import { CSVImportPreview, CSVImportResult } from '@/lib/erp/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/erp/import
 * Upload and parse CSV file
 * Returns preview with detected columns and suggested mapping
 * Body: FormData with file
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const importType = formData.get('type') as string || 'caregivers';

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!['caregivers', 'patients', 'credentials'].includes(importType)) {
      return NextResponse.json(
        { error: 'Invalid import type. Must be: caregivers, patients, or credentials' },
        { status: 400 }
      );
    }

    // Read file content
    const content = await file.text();

    // Create CSV adapter
    const adapter = new CSVImportAdapter();
    await adapter.connect({
      provider: 'csv_import',
      custom_headers: {
        'x-file-name': file.name,
      },
    });

    // Parse CSV
    const records = await adapter.parseCSV(content, {
      delimiter: ',',
      hasHeader: true,
    });

    // Get preview
    const preview = adapter.getPreview(5);

    // Suggest column mapping
    const suggestedMapping = suggestColumnMapping(
      preview.columns.map((c) => c.header),
      importType as 'caregivers' | 'patients'
    );

    return NextResponse.json({
      success: true,
      preview: {
        ...preview,
        import_type: importType,
        suggested_mapping: suggestedMapping,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('CSV import error:', errorMessage);

    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 400 });
  }
}

/**
 * PUT /api/erp/import
 * Confirm import with final column mapping
 * Body: { column_mapping: {...}, file_content: string }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as {
      file_content: string;
      column_mapping: Record<string, string>;
      import_type?: string;
      company_id?: string;
    };

    const {
      file_content,
      column_mapping,
      import_type = 'caregivers',
      company_id,
    } = body;

    if (!file_content || !column_mapping) {
      return NextResponse.json(
        { error: 'file_content and column_mapping are required' },
        { status: 400 }
      );
    }

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    // Create CSV adapter
    const adapter = new CSVImportAdapter();
    await adapter.connect({ provider: 'csv_import' });

    // Parse CSV
    await adapter.parseCSV(file_content, {
      delimiter: ',',
      hasHeader: true,
    });

    // Set column mapping
    adapter.setColumnMapping(column_mapping);

    // Validate data
    const validation = await adapter.validateImportData();

    if (validation.invalid > 0) {
      return NextResponse.json({
        success: false,
        validation_result: validation,
        message: `Validation failed: ${validation.invalid} invalid records`,
      }, { status: 400 });
    }

    // Import data
    const result = await adapter.importData();

    // In production, would also insert into Supabase
    // For now, just return the result

    return NextResponse.json({
      success: true,
      import_result: {
        ...result,
        company_id,
        import_type,
        imported_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('CSV import confirm error:', errorMessage);

    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 500 });
  }
}
