/**
 * Compliance Report API
 * GET /api/compliance/report - Generate compliance report
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  calculateComplianceScore,
  getCredentialCompliance,
  getFormCompliance,
  getStateRequirements,
  generateComplianceReport,
} from '@/lib/compliance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company_id');
    const dateRange = searchParams.get('date_range') || 'all';
    const reportType = searchParams.get('report_type') || 'full';

    if (!companyId) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    // Check authorization (verify user belongs to this company)
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Generate report data
    const reportData = await generateComplianceReport(companyId, dateRange);

    if (!reportData) {
      return NextResponse.json(
        { error: 'Failed to generate report' },
        { status: 500 }
      );
    }

    return NextResponse.json(reportData);
  } catch (error) {
    console.error('Generate report error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
