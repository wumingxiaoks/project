import crypto from 'node:crypto';
import { env } from './env';

/**
 * AES-256-GCM for encrypting provider credentials at rest.
 * The master key comes from SECRETS_KEY (any string >= 16 chars).
 * We derive a 32-byte key with a fixed-salt scrypt; this is sufficient
 * because SECRETS_KEY is already a high-entropy secret in production.
 */
const masterKey = crypto.scryptSync(env.SECRETS_KEY, 'vghub-secrets-v1', 32);

export function encryptJSON(data: unknown): string {
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

export function decryptJSON<T = unknown>(payload: string): T {
  const [ivHex, tagHex, ctHex] = payload.split(':');
  if (!ivHex || !tagHex || !ctHex) {
    throw new Error('invalid encrypted payload');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString('utf8')) as T;
}

/** Mask a secret string for display: "abcd1234xxxx" → "abcd••••••34". */
export function maskSecret(s: string | undefined | null): string {
  if (!s) return '';
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}••••${s.slice(-2)}`;
}
