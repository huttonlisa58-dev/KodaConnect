import { NextRequest, NextResponse } from 'next/server';
import { checkAndSendNotifications } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/check
 * Trigger notification check (can be called by cron)
 * Checks credential expiry alerts, form completion reminders
 * Sends notifications respecting quiet hours and rate limits
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Validate cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && (!authHeader || authHeader !== `Bearer ${cronSecret}`)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Run notification checks
    const result = await checkAndSendNotifications();

    return NextResponse.json({
      success: true,
      summary: {
        totalSent: result.totalSent,
        totalErrors: result.totalErrors.length,
      },
      details: {
        credentialAlerts: {
          sent: result.credentialAlerts.sent,
          errors: result.credentialAlerts.errors,
        },
        formReminders: {
          sent: result.formReminders.sent,
          errors: result.formReminders.errors,
        },
        onboardingNudges: {
          sent: result.onboardingNudges.sent,
          errors: result.onboardingNudges.errors,
        },
      },
      errors: result.totalErrors,
    });
  } catch (error) {
    console.error('Error in POST /api/notifications/check:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
