/**
 * ERP Webhook Receiver
 * POST: Receives webhook events from AxisCare/HHAeXchange
 * Validates webhook signature and processes event
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Verify webhook signature
 * Different ERP systems use different signature algorithms
 */
function verifyWebhookSignature(
  provider: string,
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    let expectedSignature: string;

    if (provider === 'axiscare') {
      // AxisCare uses HMAC-SHA256
      expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    } else if (provider === 'hhaexchange') {
      // HHAeXchange uses HMAC-SHA256 with base64 encoding
      expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('base64');
    } else {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Process webhook event
 */
async function processWebhookEvent(
  provider: string,
  eventType: string,
  data: unknown
): Promise<void> {
  // In production, would trigger appropriate sync based on event type
  // For now, just log the event

  switch (eventType) {
    case 'employee.created':
    case 'employee.updated':
      console.log(`${provider} employee event:`, eventType, data);
      // Trigger caregiver sync
      break;

    case 'caregiver.created':
    case 'caregiver.updated':
      console.log(`${provider} caregiver event:`, eventType, data);
      // Trigger caregiver sync
      break;

    case 'client.created':
    case 'client.updated':
    case 'patient.created':
    case 'patient.updated':
      console.log(`${provider} patient event:`, eventType, data);
      // Trigger patient sync
      break;

    case 'credential.updated':
    case 'credential.created':
      console.log(`${provider} credential event:`, eventType, data);
      // Trigger credential sync
      break;

    case 'schedule.created':
    case 'schedule.updated':
      console.log(`${provider} schedule event:`, eventType, data);
      // Trigger schedule sync
      break;

    default:
      console.log(`Unknown event type: ${eventType}`, data);
  }
}

/**
 * POST /api/webhooks/erp
 * Receive and process ERP webhook
 * Expected headers:
 * - X-ERP-Provider: axiscare | hhaexchange
 * - X-Webhook-Signature: signature
 * Expected body:
 * - event: string (event type)
 * - data: object (event data)
 */
export async function POST(request: NextRequest) {
  try {
    // Get provider from header
    const provider = request.headers.get('X-ERP-Provider')?.toLowerCase();
    const signature = request.headers.get('X-Webhook-Signature');

    if (!provider || !['axiscare', 'hhaexchange'].includes(provider)) {
      return NextResponse.json(
        { error: 'Invalid or missing X-ERP-Provider header' },
        { status: 400 }
      );
    }

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing X-Webhook-Signature header' },
        { status: 401 }
      );
    }

    // Get webhook secret from environment
    const secretKey = process.env[`ERP_${provider.toUpperCase()}_WEBHOOK_SECRET`];
    if (!secretKey) {
      console.error(`Missing webhook secret for ${provider}`);
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    // Read request body
    const body = await request.json() as {
      event: string;
      data: unknown;
    };

    // Verify signature
    const bodyText = JSON.stringify(body);
    if (!verifyWebhookSignature(provider, bodyText, signature, secretKey)) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    // Process event
    await processWebhookEvent(provider, body.event, body.data);

    return NextResponse.json({
      success: true,
      message: 'Webhook processed',
      event: body.event,
      provider,
    });
  } catch (error) {
    console.error('Webhook processing error:', error);

    // Always return 200 to prevent webhook retry storms
    // but log the error
    return NextResponse.json({
      success: false,
      error: 'Internal error processing webhook',
    }, { status: 200 });
  }
}

/**
 * GET /api/webhooks/erp
 * Health check for webhook endpoint
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    message: 'ERP webhook endpoint is active',
    timestamp: new Date().toISOString(),
  });
}
