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
    if (msg.includes('unverified') || msg.includes('not a verified') || msg.includes('Trial') || msg.includes('60203') || msg.includes('21608')) {
      console.warn('Twilio trial - dev bypass for:', to);
      return { success: true, sid: 'dev_bypass', dev_mode: true };
    }
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
  } catch (error) {
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
