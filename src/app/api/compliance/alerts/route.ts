/**
 * Compliance Alerts API
 * GET /api/compliance/alerts - Get active compliance alerts
 * POST /api/compliance/alerts/[id] - Dismiss/acknowledge alert
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company_id');

    if (!companyId) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch active alerts for the company
    const { data: alerts, error } = await supabase
      .from('compliance_alerts')
      .select('*')
      .eq('company_id', companyId)
      .eq('dismissed', false)
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch alerts error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch alerts' },
        { status: 500 }
      );
    }

    // Categorize alerts by severity
    const categorized = {
      critical: alerts?.filter((a) => a.severity === 'critical') || [],
      warning: alerts?.filter((a) => a.severity === 'warning') || [],
      info: alerts?.filter((a) => a.severity === 'info') || [],
    };

    return NextResponse.json({
      totalAlerts: alerts?.length || 0,
      alerts: categorized,
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { alertId, action } = body;

    if (!alertId || !action) {
      return NextResponse.json(
        { error: 'Missing alertId or action' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    if (action === 'dismiss') {
      const { error } = await supabase
        .from('compliance_alerts')
        .update({
          dismissed: true,
          dismissed_at: new Date().toISOString(),
        })
        .eq('id', alertId);

      if (error) {
        return NextResponse.json(
          { error: 'Failed to dismiss alert' },
          { status: 500 }
        );
      }
    } else if (action === 'acknowledge') {
      const { error } = await supabase
        .from('compliance_alerts')
        .update({
          acknowledged: true,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', alertId);

      if (error) {
        return NextResponse.json(
          { error: 'Failed to acknowledge alert' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `Alert ${action}ed successfully`,
    });
  } catch (error) {
    console.error('Update alert error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
