import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { env } from '@/lib/env';
import { applyTaskStatus } from '@/lib/jobs';
import { getProvider } from '@/lib/providers';
import type { ProviderId } from '@/lib/providers/types';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerRaw } = await params;
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!['replicate', 'kling', 'minimax'].includes(providerRaw)) {
    return NextResponse.json({ error: 'unknown provider' }, { status: 400 });
  }
  const provider = getProvider(providerRaw as ProviderId);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  const parsed = await provider.parseWebhook?.(headers, body);
  if (!parsed) {
    return NextResponse.json({ error: 'could not parse' }, { status: 400 });
  }

  // Try hint from query (we set jobId when building webhook URL).
  const hintedJobId = url.searchParams.get('jobId');
  let jobId = hintedJobId;
  if (!jobId) {
    const [row] = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.providerTaskId, parsed.providerTaskId));
    jobId = row?.id ?? null;
  }
  if (!jobId) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 });
  }

  await applyTaskStatus(jobId, parsed.status);
  return NextResponse.json({ ok: true });
}
