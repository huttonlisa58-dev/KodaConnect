/**
 * ERP Configuration API
 * GET: Retrieve ERP config for a company
 * POST: Save ERP configuration
 * POST /test: Test ERP connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { ERPConfig, ERPValidationError } from '@/lib/erp/types';
import { AxisCareAdapter } from '@/lib/erp/axiscare';
import { HHAeXchangeAdapter } from '@/lib/erp/hhaexchange';
import { CSVImportAdapter } from '@/lib/erp/csv-import';

export const dynamic = 'force-dynamic';

/**
 * GET /api/erp/config
 * Get ERP configuration for a company
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id');

    if (!companyId) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    // In production, fetch from Supabase
    // For now, return placeholder
    return NextResponse.json({
      success: true,
      config: {
        provider: null,
        connected: false,
        last_synced: null,
      },
    });
  } catch (error) {
    console.error('ERP config fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/erp/config
 * Save ERP configuration
 * Body: { company_id, provider, config: {...} }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      company_id: string;
      provider: string;
      config: Record<string, unknown>;
    };

    const { company_id, provider, config } = body;

    if (!company_id || !provider) {
      return NextResponse.json(
        { error: 'company_id and provider are required' },
        { status: 400 }
      );
    }

    if (!['axiscare', 'hhaexchange', 'csv_import'].includes(provider)) {
      return NextResponse.json(
        { error: 'Invalid provider. Must be: axiscare, hhaexchange, or csv_import' },
        { status: 400 }
      );
    }

    // In production, would validate and save to Supabase
    // For now, just return success
    return NextResponse.json({
      success: true,
      message: 'ERP configuration saved',
      config: {
        company_id,
        provider,
        configured_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('ERP config save error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/erp/config/test
 * Test connection to ERP system
 * Body: { provider, config: {...} }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as {
      provider: string;
      config: ERPConfig;
    };

    const { provider, config } = body;

    if (!provider || !config) {
      return NextResponse.json(
        { error: 'provider and config are required' },
        { status: 400 }
      );
    }

    let adapter;

    try {
      switch (provider) {
        case 'axiscare':
          adapter = new AxisCareAdapter();
          await adapter.connect(config);
          break;

        case 'hhaexchange':
          adapter = new HHAeXchangeAdapter();
          await adapter.connect(config);
          break;

        case 'csv_import':
          adapter = new CSVImportAdapter();
          await adapter.connect(config);
          break;

        default:
          return NextResponse.json(
            { error: 'Invalid provider' },
            { status: 400 }
          );
      }

      const isConnected = adapter.isConnected();

      return NextResponse.json({
        success: true,
        connected: isConnected,
        provider,
        message: isConnected ? 'Connection successful' : 'Connection failed',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return NextResponse.json({
        success: false,
        connected: false,
        provider,
        error: errorMessage,
      }, { status: 400 });
    }
  } catch (error) {
    console.error('ERP test connection error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
