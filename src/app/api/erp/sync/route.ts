/**
 * ERP Sync API
 * POST: Trigger a sync for a company
 * GET: Get sync status/history
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSyncManager } from '@/lib/erp/sync';
import { AxisCareAdapter } from '@/lib/erp/axiscare';
import { HHAeXchangeAdapter } from '@/lib/erp/hhaexchange';
import { ERPConfig } from '@/lib/erp/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/erp/sync
 * Trigger a sync for a company
 * Body: { company_id, provider, config, sync_type }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      company_id: string;
      provider: string;
      config?: ERPConfig;
      sync_type?: 'full' | 'caregivers' | 'patients' | 'credentials' | 'schedule';
      date_range?: { start_date: string; end_date: string };
    };

    const {
      company_id,
      provider,
      config,
      sync_type = 'full',
      date_range,
    } = body;

    if (!company_id || !provider) {
      return NextResponse.json(
        { error: 'company_id and provider are required' },
        { status: 400 }
      );
    }

    // Create appropriate adapter
    let adapter;

    try {
      switch (provider) {
        case 'axiscare':
          if (!config) {
            return NextResponse.json(
              { error: 'config is required for AxisCare' },
              { status: 400 }
            );
          }
          adapter = new AxisCareAdapter();
          await adapter.connect(config);
          break;

        case 'hhaexchange':
          if (!config) {
            return NextResponse.json(
              { error: 'config is required for HHAeXchange' },
              { status: 400 }
            );
          }
          adapter = new HHAeXchangeAdapter();
          await adapter.connect(config);
          break;

        default:
          return NextResponse.json(
            { error: 'Invalid provider' },
            { status: 400 }
          );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({
        success: false,
        error: `Failed to connect to ${provider}: ${errorMessage}`,
      }, { status: 400 });
    }

    // Create sync manager
    const syncManager = createSyncManager();

    try {
      let result;

      switch (sync_type) {
        case 'caregivers':
          result = await syncManager.syncCaregivers(adapter, company_id);
          break;

        case 'patients':
          result = await syncManager.syncPatients(adapter, company_id);
          break;

        case 'credentials':
          result = await syncManager.syncCredentials(adapter, company_id);
          break;

        case 'schedule':
          if (!date_range) {
            return NextResponse.json(
              { error: 'date_range is required for schedule sync' },
              { status: 400 }
            );
          }
          result = await syncManager.syncSchedule(adapter, company_id, date_range);
          break;

        case 'full':
        default:
          result = await syncManager.runFullSync(adapter, company_id, date_range);
          break;
      }

      await adapter.disconnect();

      return NextResponse.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({
        success: false,
        error: errorMessage,
      }, { status: 500 });
    }
  } catch (error) {
    console.error('ERP sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/erp/sync
 * Get sync status/history for a company
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id');
    const limit = request.nextUrl.searchParams.get('limit') || '10';

    if (!companyId) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    // In production, would fetch from Supabase sync_log table
    // For now, return placeholder
    return NextResponse.json({
      success: true,
      company_id: companyId,
      sync_history: [],
      message: 'No sync history found',
    });
  } catch (error) {
    console.error('ERP sync history fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
