import { createServerSupabaseClient } from '@/lib/supabase';
import { sendSMS, normalizePhone } from '@/lib/twilio';

export interface NotificationRule {
  id: string;
  company_id: string;
  type: 'credential_expiry' | 'form_reminder' | 'onboarding_nudge';
  enabled: boolean;
  quiet_hours_start: number; // 0-23 hour
  quiet_hours_end: number; // 0-23 hour
  created_at: string;
  updated_at: string;
}

/**
 * Check if current time is within quiet hours (9 PM - 8 AM)
 */
export function isQuietHours(quietStart: number = 21, quietEnd: number = 8): boolean {
  const now = new Date();
  const hour = now.getHours();

  // If quiet end is earlier than quiet start (wraps around midnight)
  if (quietEnd <= quietStart) {
    return hour >= quietStart || hour < quietEnd;
  }

  return hour >= quietStart && hour < quietEnd;
}

/**
 * Get notification rules for a company
 */
export async function getNotificationRules(companyId: string): Promise<NotificationRule[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('notification_rules')
    .select('*')
    .eq('company_id', companyId);

  if (error) {
    console.error('Failed to get notification rules:', error);
    return [];
  }

  return data || [];
}

/**
 * Interpolate template variables
 * e.g., "Hi {{name}}, your {{credential}} expires on {{date}}"
 */
export function interpolateTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] || match;
  });
}

/**
 * Send credential expiry alerts for credentials expiring in X days
 */
export async function sendCredentialExpiryAlerts(
  daysOut: number[] = [7, 14, 30]
): Promise<{ sent: number; errors: string[] }> {
  const supabase = createServerSupabaseClient();
  const errors: string[] = [];
  let sent = 0;

  try {
    // Get all companies with enabled credential expiry notifications
    const { data: companies } = await supabase
      .from('notification_rules')
      .select('company_id')
      .eq('type', 'credential_expiry')
      .eq('enabled', true);

    if (!companies || companies.length === 0) {
      return { sent, errors };
    }

    const companyIds = [...new Set(companies.map(c => c.company_id))];

    for (const companyId of companyIds) {
      // For each day threshold
      for (const dayThreshold of daysOut) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + dayThreshold);
        const targetDateStr = targetDate.toISOString().split('T')[0];

        // Find caregivers with credentials expiring
        const { data: caregivers } = await supabase
          .from('caregivers')
          .select('id, full_name, phone, company_id')
          .eq('company_id', companyId)
          .eq('is_active', true);

        if (!caregivers) continue;

        for (const caregiver of caregivers) {
          // Check if has credentials expiring on this date
          const { data: credentials } = await supabase
            .from('caregiver_credentials')
            .select('credential_name, expiry_date')
            .eq('caregiver_id', caregiver.id)
            .gte('expiry_date', targetDateStr)
            .lt('expiry_date', new Date(targetDate.getTime() + 86400000).toISOString().split('T')[0]);

          if (!credentials || credentials.length === 0) continue;

          // Check quiet hours
          const rules = await getNotificationRules(companyId);
          const rule = rules.find(r => r.type === 'credential_expiry');

          if (rule && isQuietHours(rule.quiet_hours_start, rule.quiet_hours_end)) {
            continue;
          }

          // Send notification
          const credList = credentials.map(c => c.credential_name).join(', ');
          const message = interpolateTemplate(
            'Hi {{name}}, your {{credentials}} will expire on {{date}}. Please renew to maintain your profile.',
            {
              name: caregiver.full_name.split(' ')[0],
              credentials: credList,
              date: targetDateStr,
            }
          );

          const smsResult = await sendSMS(normalizePhone(caregiver.phone), message);

          if (smsResult.success) {
            sent++;

            // Log notification
            await supabase.from('notification_log').insert({
              caregiver_id: caregiver.id,
              company_id: companyId,
              type: 'credential_expiry',
              message,
              status: 'sent',
            });
          } else {
            errors.push(`Failed to send credential alert to ${caregiver.full_name}: ${smsResult.error}`);
          }
        }
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending credential expiry alerts:', errorMsg);
    errors.push(errorMsg);
  }

  return { sent, errors };
}

/**
 * Send form completion reminders to caregivers
 */
export async function sendFormReminders(companyId: string): Promise<{ sent: number; errors: string[] }> {
  const supabase = createServerSupabaseClient();
  const errors: string[] = [];
  let sent = 0;

  try {
    // Check if form reminders are enabled for this company
    const { data: rules } = await supabase
      .from('notification_rules')
      .select('*')
      .eq('company_id', companyId)
      .eq('type', 'form_reminder')
      .eq('enabled', true)
      .maybeSingle();

    if (!rules) {
      return { sent, errors };
    }

    // Check quiet hours
    if (isQuietHours(rules.quiet_hours_start, rules.quiet_hours_end)) {
      return { sent, errors };
    }

    // Get caregivers with incomplete forms
    const { data: caregivers } = await supabase
      .from('caregivers')
      .select('id, full_name, phone')
      .eq('company_id', companyId)
      .eq('is_active', true);

    if (!caregivers) {
      return { sent, errors };
    }

    for (const caregiver of caregivers) {
      // Check if has incomplete forms
      const { data: submissions } = await supabase
        .from('submissions')
        .select('id')
        .eq('caregiver_id', caregiver.id)
        .eq('status', 'draft')
        .limit(1);

      if (!submissions || submissions.length === 0) continue;

      // Send reminder
      const message = interpolateTemplate(
        'Hi {{name}}, you have incomplete forms waiting for you. Please complete them at your earliest convenience. Thank you!',
        {
          name: caregiver.full_name.split(' ')[0],
        }
      );

      const smsResult = await sendSMS(normalizePhone(caregiver.phone), message);

      if (smsResult.success) {
        sent++;

        // Log notification
        await supabase.from('notification_log').insert({
          caregiver_id: caregiver.id,
          company_id: companyId,
          type: 'form_reminder',
          message,
          status: 'sent',
        });
      } else {
        errors.push(`Failed to send form reminder to ${caregiver.full_name}: ${smsResult.error}`);
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending form reminders:', errorMsg);
    errors.push(errorMsg);
  }

  return { sent, errors };
}

/**
 * Send onboarding nudges to caregivers who haven't progressed
 */
export async function sendOnboardingNudges(): Promise<{ sent: number; errors: string[] }> {
  const supabase = createServerSupabaseClient();
  const errors: string[] = [];
  let sent = 0;

  try {
    // Get all companies with onboarding nudges enabled
    const { data: companies } = await supabase
      .from('notification_rules')
      .select('company_id')
      .eq('type', 'onboarding_nudge')
      .eq('enabled', true);

    if (!companies || companies.length === 0) {
      return { sent, errors };
    }

    const companyIds = [...new Set(companies.map(c => c.company_id))];

    for (const companyId of companyIds) {
      // Check quiet hours
      const rules = await getNotificationRules(companyId);
      const rule = rules.find(r => r.type === 'onboarding_nudge');

      if (rule && isQuietHours(rule.quiet_hours_start, rule.quiet_hours_end)) {
        continue;
      }

      // Find caregivers who haven't completed onboarding in last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: caregivers } = await supabase
        .from('caregivers')
        .select('id, full_name, phone')
        .eq('company_id', companyId)
        .eq('onboarding_completed', false)
        .lt('created_at', sevenDaysAgo.toISOString());

      if (!caregivers || caregivers.length === 0) continue;

      for (const caregiver of caregivers) {
        const message = interpolateTemplate(
          'Hi {{name}}, we noticed you haven\'t completed your onboarding yet. We\'re here to help! Reply to start your application process.',
          {
            name: caregiver.full_name.split(' ')[0],
          }
        );

        const smsResult = await sendSMS(normalizePhone(caregiver.phone), message);

        if (smsResult.success) {
          sent++;

          // Log notification
          await supabase.from('notification_log').insert({
            caregiver_id: caregiver.id,
            company_id: companyId,
            type: 'onboarding_nudge',
            message,
            status: 'sent',
          });
        } else {
          errors.push(`Failed to send onboarding nudge to ${caregiver.full_name}: ${smsResult.error}`);
        }
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending onboarding nudges:', errorMsg);
    errors.push(errorMsg);
  }

  return { sent, errors };
}

/**
 * Main function to check and send all pending notifications
 * Call this from a cron job or scheduled task
 */
export async function checkAndSendNotifications(): Promise<{
  credentialAlerts: { sent: number; errors: string[] };
  formReminders: { sent: number; errors: string[] };
  onboardingNudges: { sent: number; errors: string[] };
  totalSent: number;
  totalErrors: string[];
}> {
  const credentialAlerts = await sendCredentialExpiryAlerts([7, 14, 30]);

  const supabase = createServerSupabaseClient();
  const { data: companies } = await supabase.from('companies').select('id');
  const formRemindersResults: Array<{ sent: number; errors: string[] }> = [];

  if (companies) {
    for (const company of companies) {
      const result = await sendFormReminders(company.id);
      formRemindersResults.push(result);
    }
  }

  const onboardingNudges = await sendOnboardingNudges();

  const totalSent =
    credentialAlerts.sent +
    formRemindersResults.reduce((sum, r) => sum + r.sent, 0) +
    onboardingNudges.sent;

  const totalErrors = [
    ...credentialAlerts.errors,
    ...formRemindersResults.flatMap(r => r.errors),
    ...onboardingNudges.errors,
  ];

  return {
    credentialAlerts,
    formReminders: {
      sent: formRemindersResults.reduce((sum, r) => sum + r.sent, 0),
      errors: formRemindersResults.flatMap(r => r.errors),
    },
    onboardingNudges,
    totalSent,
    totalErrors,
  };
}
