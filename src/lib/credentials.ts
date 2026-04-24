import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, schema } from './db';
import { decryptJSON, encryptJSON, maskSecret } from './crypto';
import { getProvider } from './providers';
import type {
  CredentialPayload,
  ProviderId,
} from './providers/types';

export interface CredentialSummary {
  id: string;
  provider: ProviderId;
  label: string;
  isDefault: boolean;
  config: Record<string, string | undefined>;
  secretsMasked: Record<string, string>;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

function toSummary(row: typeof schema.credentials.$inferSelect): CredentialSummary {
  const secrets = decryptJSON<Record<string, string>>(row.secretEncrypted);
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(secrets)) masked[k] = maskSecret(v);
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    isDefault: row.isDefault === 'true',
    config: (row.config ?? {}) as Record<string, string | undefined>,
    secretsMasked: masked,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastTestOk: row.lastTestOk === null ? null : row.lastTestOk === 'true',
    lastTestMessage: row.lastTestMessage ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCredentials(): Promise<CredentialSummary[]> {
  const rows = await db.select().from(schema.credentials);
  return rows.map(toSummary);
}

export async function listCredentialsByProvider(
  provider: ProviderId,
): Promise<CredentialSummary[]> {
  const rows = await db
    .select()
    .from(schema.credentials)
    .where(eq(schema.credentials.provider, provider));
  return rows.map(toSummary);
}

export async function getCredentialPayload(
  id: string,
): Promise<CredentialPayload | null> {
  const [row] = await db
    .select()
    .from(schema.credentials)
    .where(eq(schema.credentials.id, id));
  if (!row) return null;
  const secrets = decryptJSON<Record<string, string>>(row.secretEncrypted);
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    config: (row.config ?? {}) as Record<string, string | undefined>,
    secrets,
  };
}

async function unsetDefault(provider: ProviderId) {
  await db
    .update(schema.credentials)
    .set({ isDefault: 'false', updatedAt: new Date() })
    .where(eq(schema.credentials.provider, provider));
}

export interface CredentialInput {
  provider: ProviderId;
  label: string;
  config?: Record<string, string | undefined>;
  secrets: Record<string, string>;
  isDefault?: boolean;
}

function validateFields(input: CredentialInput) {
  const provider = getProvider(input.provider);
  for (const f of provider.credentialFields) {
    if (f.required) {
      const v = f.secret ? input.secrets[f.key] : (input.config ?? {})[f.key];
      if (!v || !String(v).trim()) {
        throw new Error(`Missing required field "${f.label}" (${f.key})`);
      }
    }
  }
}

export async function createCredential(
  input: CredentialInput,
): Promise<CredentialSummary> {
  validateFields(input);
  if (input.isDefault) await unsetDefault(input.provider);
  const id = nanoid(12);
  const [row] = await db
    .insert(schema.credentials)
    .values({
      id,
      provider: input.provider,
      label: input.label,
      isDefault: input.isDefault ? 'true' : 'false',
      secretEncrypted: encryptJSON(input.secrets),
      config: (input.config ?? {}) as Record<string, unknown>,
    })
    .returning();
  return toSummary(row);
}

export async function updateCredential(
  id: string,
  patch: Partial<CredentialInput> & { id?: never },
): Promise<CredentialSummary> {
  const [current] = await db
    .select()
    .from(schema.credentials)
    .where(eq(schema.credentials.id, id));
  if (!current) throw new Error('not found');
  const next: Partial<typeof schema.credentials.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.label !== undefined) next.label = patch.label;
  if (patch.config !== undefined)
    next.config = patch.config as Record<string, unknown>;
  if (patch.secrets !== undefined) {
    const prev = decryptJSON<Record<string, string>>(current.secretEncrypted);
    const merged: Record<string, string> = { ...prev };
    for (const [k, v] of Object.entries(patch.secrets)) {
      if (v !== undefined && v !== '') merged[k] = v;
    }
    next.secretEncrypted = encryptJSON(merged);
  }
  if (patch.isDefault !== undefined) {
    if (patch.isDefault) await unsetDefault(current.provider);
    next.isDefault = patch.isDefault ? 'true' : 'false';
  }
  const [row] = await db
    .update(schema.credentials)
    .set(next)
    .where(eq(schema.credentials.id, id))
    .returning();
  return toSummary(row);
}

export async function deleteCredential(id: string) {
  await db.delete(schema.credentials).where(eq(schema.credentials.id, id));
}

export async function testCredential(id: string): Promise<{ ok: boolean; message: string }> {
  const cred = await getCredentialPayload(id);
  if (!cred) return { ok: false, message: 'credential not found' };
  const provider = getProvider(cred.provider);
  const res = await provider.testCredential(cred);
  await db
    .update(schema.credentials)
    .set({
      lastTestedAt: new Date(),
      lastTestOk: res.ok ? 'true' : 'false',
      lastTestMessage: res.message,
      updatedAt: new Date(),
    })
    .where(eq(schema.credentials.id, id));
  return res;
}

export async function getDefaultCredentialId(
  provider: ProviderId,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.credentials)
    .where(
      and(
        eq(schema.credentials.provider, provider),
        eq(schema.credentials.isDefault, 'true'),
      ),
    );
  if (row) return row.id;
  // Fallback: any credential for this provider.
  const [any] = await db
    .select()
    .from(schema.credentials)
    .where(eq(schema.credentials.provider, provider))
    .limit(1);
  return any?.id ?? null;
}
