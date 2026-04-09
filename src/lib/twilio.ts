import twilio from 'twilio';
import { normalizePhone } from './phone-utils';

// Re-export normalizePhone for backward compatibility with server-side imports
export { normalizePhone } from './phone-utils';

// Lazy-initialize Twilio client to avoid build-time errors
let _client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (_client) return _client;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (accountSid && authToken) {
    _client = twilio(accountSid, authToken);
  }
  return _client;
}

// Send OTP using Twilio Verify (works on trial accounts without phone verification)
export async function sendVerifyOTP(to: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const client = getClient();
  const verifySid = process.env.TWILIO_VERIFY_SID;
  if (!client || !verifySid) {
    console.error('Twilio Verify not configured');
    return { success: false, error: 'Verification service not configured' };
  }

  try {
    const normalizedPhone = normalizePhone(to);

    const verification = await client.verify.v2
      .services(verifySid)
      .verifications.create({
        to: normalizedPhone,
        channel: 'sms',
      });

    return { success: true, sid: verification.sid };
  } catch (error) {
    console.error('Failed to send Verify OTP:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send verification code'
    };
  }
}

// Check OTP using Twilio Verify
export async function checkVerifyOTP(to: string, code: string): Promise<{ success: boolean; valid: boolean; error?: string }> {
  const client = getClient();
  const verifySid = process.env.TWILIO_VERIFY_SID;
  if (!client || !verifySid) {
    console.error('Twilio Verify not configured');
    return { success: false, valid: false, error: 'Verification service not configured' };
  }

  try {
    const normalizedPhone = normalizePhone(to);

    const verificationCheck = await client.verify.v2
      .services(verifySid)
      .verificationChecks.create({
        to: normalizedPhone,
        code,
      });

    return { success: true, valid: verificationCheck.status === 'approved' };
  } catch (error) {
    console.error('Failed to check Verify OTP:', error);
    return {
      success: false,
      valid: false,
      error: error instanceof Error ? error.message : 'Failed to verify code'
    };
  }
}

// Legacy SMS function (for non-OTP messages)
export async function sendSMS(to: string, message: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const client = getClient();
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!client || !phoneNumber) {
    console.error('Twilio not configured');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const normalizedPhone = normalizePhone(to);

    const result = await client.messages.create({
      body: message,
      from: phoneNumber,
      to: normalizedPhone,
    });

    return { success: true, sid: result.sid };
  } catch (error) {
    console.error('Failed to send SMS:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send SMS'
    };
  }
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
