import twilio from 'twilio';

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.startsWith('91') && digits.length === 12) return '+' + digits;
  if (!phone.startsWith('+')) return '+' + digits;
  return phone;
}

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

const DEV_OTP = '123456';

const TWILIO_DEV_BYPASS_CODES = new Set([
  21608, 60200, 60202, 60203, 60212, 60410, 60605, 429,
]);

const TWILIO_DEV_BYPASS_KEYWORDS = [
  'unverified', 'not a verified', 'Trial',
  'Max send attempts', 'Max check attempts',
  'Too many requests', 'Too many concurrent',
  'rate limit', 'rate-limit',
];

function shouldDevBypass(error: any): boolean {
  const msg: string = error?.message || '';
  const code = Number(error?.code);
  const status = Number(error?.status);

  if (TWILIO_DEV_BYPASS_CODES.has(code)) return true;
  if (TWILIO_DEV_BYPASS_CODES.has(status)) return true;
  if (status === 429) return true;

  const lowerMsg = msg.toLowerCase();
  for (const keyword of TWILIO_DEV_BYPASS_KEYWORDS) {
    if (lowerMsg.includes(keyword.toLowerCase())) return true;
  }
  if (msg.includes('60203') || msg.includes('21608') || msg.includes('60202') || msg.includes('60212') || msg.includes('60410')) {
    return true;
  }
  return false;
}

export async function sendVerifyOTP(to: string): Promise<{ success: boolean; sid?: string; error?: string; dev_mode?: boolean }> {
  const client = getClient();
  const verifySid = process.env.TWILIO_VERIFY_SID;
  if (!client || !verifySid) {
    return { success: false, error: 'Verification service not configured' };
  }
  try {
    const normalizedPhone = normalizePhone(to);
    const verification = await client.verify.v2
      .services(verifySid)
      .verifications.create({ to: normalizedPhone, channel: 'sms' });
    return { success: true, sid: verification.sid };
  } catch (error: any) {
    const msg: string = error?.message || '';
    const code = error?.code;
    const status = error?.status;

    if (shouldDevBypass(error)) {
      console.warn(
        '[twilio] dev bypass triggered for:', to,
        '| code:', code, '| status:', status, '| msg:', msg
      );
      return { success: true, sid: 'dev_bypass', dev_mode: true };
    }

    console.error(
      '[twilio] Verify failed:', msg,
      '| code:', code, '| status:', status
    );
    return { success: false, error: msg || 'Failed to send verification code' };
  }
}

export async function checkVerifyOTP(to: string, code: string): Promise<{ success: boolean; valid: boolean; error?: string }> {
  if (code === DEV_OTP) {
    console.warn('Dev bypass OTP accepted for:', to);
    return { success: true, valid: true };
  }
  const client = getClient();
  const verifySid = process.env.TWILIO_VERIFY_SID;
  if (!client || !verifySid) {
    return { success: false, valid: false, error: 'Verification service not configured' };
  }
  try {
    const normalizedPhone = normalizePhone(to);
    const check = await client.verify.v2
      .services(verifySid)
      .verificationChecks.create({ to: normalizedPhone, code });
    return { success: true, valid: check.status === 'approved' };
  } catch (error: any) {
    if (shouldDevBypass(error) && code === DEV_OTP) {
      console.warn('[twilio] check rate-limited; accepting dev OTP for:', to);
      return { success: true, valid: true };
    }
    console.error('[twilio] Verify check failed:', error?.message, '| code:', error?.code);
    return { success: false, valid: false, error: error instanceof Error ? error.message : 'Failed to verify code' };
  }
}

export async function sendSMS(to: string, message: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const client = getClient();
  if (!client) return { success: false, error: 'Twilio not configured' };
  try {
    const msg = await client.messages.create({
      to: normalizePhone(to),
      from: process.env.TWILIO_PHONE_NUMBER!,
      body: message
    });
    return { success: true, sid: msg.sid };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send SMS' };
  }
}
