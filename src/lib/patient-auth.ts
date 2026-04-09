/**
 * Patient Authentication Utilities
 * Handles JWT token verification for patient API routes
 */

import jwt from 'jsonwebtoken';

interface PatientTokenPayload {
  patientId: string;
  phone: string;
  iat?: number;
  exp?: number;
}

/**
 * Verify patient JWT token
 */
export async function verifyPatientToken(token: string): Promise<PatientTokenPayload | null> {
  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, secret) as PatientTokenPayload;
    return decoded;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

/**
 * Generate patient JWT token
 */
export function generatePatientToken(patientId: string, phone: string): string {
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  return jwt.sign(
    { patientId, phone },
    secret,
    { expiresIn: '7d' }
  );
}

/**
 * Decode token without verification (use with caution)
 */
export function decodePatientToken(token: string): PatientTokenPayload | null {
  try {
    const decoded = jwt.decode(token) as PatientTokenPayload;
    return decoded;
  } catch (error) {
    console.error('Token decode error:', error);
    return null;
  }
}
