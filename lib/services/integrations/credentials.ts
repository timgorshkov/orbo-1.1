import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.INTEGRATIONS_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function ensureKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error('INTEGRATIONS_ENCRYPTION_KEY is not set');
  }

  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  if (key.length !== 32) {
    throw new Error('INTEGRATIONS_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }

  return key;
}

export function encryptCredentials(credentials: Record<string, unknown>): string {
  const key = ensureKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const serialized = JSON.stringify(credentials);

  const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptCredentials<T extends Record<string, unknown> = Record<string, unknown>>(encrypted: string | null | undefined): T {
  if (!encrypted) {
    return {} as T;
  }

  const key = ensureKey();
  const buffer = Buffer.from(encrypted, 'base64');

  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}

