/**
 * Field-level encryption for PHI (Protected Health Information)
 * Uses AES-256-GCM encryption with authenticated encryption
 * Includes IV in output for stateless decryption
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits

/**
 * Get the encryption key from environment
 * Must be 32 bytes (256 bits) for AES-256
 */
function getEncryptionKey(): Buffer {
  const keyString = process.env.ENCRYPTION_KEY;
  if (!keyString) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  // If the key is a hex string, convert it; otherwise hash it
  let keyBuffer: Buffer;
  if (keyString.length === 64) {
    // Assume it's a hex string (32 bytes = 64 hex chars)
    try {
      keyBuffer = Buffer.from(keyString, 'hex');
      if (keyBuffer.length !== 32) {
        throw new Error('Invalid key length');
      }
    } catch {
      // Not valid hex, fall back to hashing
      keyBuffer = deriveKey(keyString);
    }
  } else {
    // Hash the provided key to derive a proper 256-bit key
    keyBuffer = deriveKey(keyString);
  }

  return keyBuffer;
}

/**
 * Derive a proper 256-bit key from an arbitrary string
 * Uses SHA-256 hashing
 */
function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/**
 * Encrypt PHI data using AES-256-GCM
 * Returns base64-encoded string containing: IV + AuthTag + Ciphertext
 * Format allows stateless decryption since IV is included
 */
export function encryptPHI(data: string): string {
  try {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Combine IV + AuthTag + Ciphertext, encode as base64
    const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);
    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt PHI data encrypted with encryptPHI()
 * Expects base64-encoded string with IV + AuthTag + Ciphertext
 */
export function decryptPHI(encrypted: string): string {
  try {
    const key = getEncryptionKey();

    // Decode from base64
    const combined = Buffer.from(encrypted, 'base64');

    // Extract components
    const iv = combined.slice(0, IV_LENGTH);
    const authTag = combined.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH + AUTH_TAG_LENGTH);

    // Decrypt
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext).toString('utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Create a one-way hash of PHI for searching/matching without storing plaintext
 * Uses SHA-256, can be safely stored in database for identity verification
 */
export function hashPHI(data: string): string {
  const salt = process.env.HASH_SALT || 'default_salt';
  return createHash('sha256')
    .update(data + salt)
    .digest('hex');
}

/**
 * Verify a plaintext value against a stored hash
 * Useful for comparing PHI without decrypting
 */
export function verifyPHIHash(plaintext: string, hash: string): boolean {
  const computedHash = hashPHI(plaintext);
  return computedHash === hash;
}

/**
 * Check if a string appears to be encrypted PHI
 * (base64 encoded with sufficient length)
 */
export function isEncryptedPHI(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  // Encrypted data should be at least IV_LENGTH + AUTH_TAG_LENGTH in decoded form
  const minEncodedLength = Math.ceil(
    ((IV_LENGTH + AUTH_TAG_LENGTH) * 4) / 3
  );
  if (value.length < minEncodedLength) {
    return false;
  }

  // Try to decode from base64
  try {
    Buffer.from(value, 'base64');
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt an object containing PHI fields
 * Only encrypts fields specified in the phiFields array
 */
export function encryptPHIFields<T extends Record<string, unknown>>(
  data: T,
  phiFields: (keyof T)[]
): T {
  const encrypted = { ...data };

  for (const field of phiFields) {
    if (field in encrypted && typeof encrypted[field] === 'string') {
      encrypted[field] = encryptPHI(encrypted[field] as string) as never;
    }
  }

  return encrypted;
}

/**
 * Decrypt an object containing encrypted PHI fields
 * Only decrypts fields specified in the phiFields array
 */
export function decryptPHIFields<T extends Record<string, unknown>>(
  data: T,
  phiFields: (keyof T)[]
): T {
  const decrypted = { ...data };

  for (const field of phiFields) {
    if (field in decrypted && typeof decrypted[field] === 'string') {
      try {
        decrypted[field] = decryptPHI(decrypted[field] as string) as never;
      } catch {
        // If decryption fails, leave field as-is (might not be encrypted)
        console.warn(`Failed to decrypt field: ${String(field)}`);
      }
    }
  }

  return decrypted;
}
