import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getJob } from '@/lib/jobs';
import { getProvider } from '@/lib/providers';
import { getCredentialPayload } from '@/lib/credentials';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let inputImage: typeof schema.assets.$inferSelect | null = null;
  let inputVideo: typeof schema.assets.$inferSelect | null = null;
  let output: typeof schema.assets.$inferSelect | null = null;

  if (job.inputImageAssetId) {
    const [a] = await db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.id, job.inputImageAssetId));
    inputImage = a ?? null;
  }
  if (job.inputVideoAssetId) {
    const [a] = await db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.id, job.inputVideoAssetId));
    inputVideo = a ?? null;
  }
  if (job.outputAssetId) {
    const [a] = await db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.id, job.outputAssetId));
    output = a ?? null;
  }

  return NextResponse.json({
    job,
    assets: { inputImage, inputVideo, output },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (job.providerTaskId && job.credentialId) {
    try {
      const provider = getProvider(job.provider);
      const credential = await getCredentialPayload(job.credentialId);
      if (credential && provider.cancel) {
        await provider.cancel(job.providerTaskId, credential);
      }
    } catch (err) {
      console.warn('[cancel] provider cancel failed', err);
    }
  }
  await db
    .update(schema.jobs)
    .set({ status: 'canceled', finishedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.jobs.id, id));
  return NextResponse.json({ ok: true });
}
