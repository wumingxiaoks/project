import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, schema } from './db';
import { env } from './env';
import { jobsQueue } from './queue';
import { getProvider } from './providers';
import {
  getCredentialPayload,
  getDefaultCredentialId,
} from './credentials';
import type {
  GenerateInput,
  JobMode,
  ProviderId,
  TaskStatus,
} from './providers/types';
import { uploadFromUrl } from './storage';

export interface CreateJobInput {
  provider: ProviderId;
  credentialId?: string;
  model: string;
  mode: JobMode;
  prompt?: string;
  negativePrompt?: string;
  inputImageAssetId?: string;
  inputVideoAssetId?: string;
  inputAudioAssetId?: string;
  params?: Record<string, unknown>;
}

export async function createJob(input: CreateJobInput) {
  const id = nanoid(12);
  const credentialId =
    input.credentialId ?? (await getDefaultCredentialId(input.provider));
  if (!credentialId) {
    throw new Error(
      `No credential configured for provider ${input.provider}. Add one in Settings first.`,
    );
  }
  const [row] = await db
    .insert(schema.jobs)
    .values({
      id,
      provider: input.provider,
      credentialId,
      model: input.model,
      mode: input.mode,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      inputImageAssetId: input.inputImageAssetId,
      inputVideoAssetId: input.inputVideoAssetId,
      inputAudioAssetId: input.inputAudioAssetId,
      params: { ...(input.params ?? {}), model: input.model },
      status: 'queued',
    })
    .returning();

  await jobsQueue.add(
    'start',
    { type: 'start', jobId: id },
    { removeOnComplete: 100, removeOnFail: 100 },
  );
  return row;
}

export async function getJob(id: string) {
  const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return row ?? null;
}

export async function listJobs(limit = 50) {
  return db
    .select()
    .from(schema.jobs)
    .orderBy(schema.jobs.createdAt)
    .limit(limit);
}

export async function updateJobStatus(
  id: string,
  patch: Partial<typeof schema.jobs.$inferInsert>,
) {
  await db
    .update(schema.jobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.jobs.id, id));
}

async function getAssetUrl(assetId: string | null | undefined) {
  if (!assetId) return undefined;
  const [row] = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.id, assetId));
  return row?.url;
}

export async function startJob(jobId: string) {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.status !== 'queued') return;

  const provider = getProvider(job.provider);
  const credentialId =
    job.credentialId ?? (await getDefaultCredentialId(job.provider));
  if (!credentialId) {
    await updateJobStatus(jobId, {
      status: 'failed',
      error: `No credential configured for provider ${job.provider}`,
      finishedAt: new Date(),
    });
    return;
  }
  const credential = await getCredentialPayload(credentialId);
  if (!credential) {
    await updateJobStatus(jobId, {
      status: 'failed',
      error: `Credential ${credentialId} not found`,
      finishedAt: new Date(),
    });
    return;
  }

  const imageUrl = await getAssetUrl(job.inputImageAssetId);
  const videoUrl = await getAssetUrl(job.inputVideoAssetId);
  const audioUrl = await getAssetUrl(job.inputAudioAssetId);

  const input: GenerateInput = {
    jobId: job.id,
    mode: job.mode as JobMode,
    prompt: job.prompt ?? undefined,
    negativePrompt: job.negativePrompt ?? undefined,
    imageUrl,
    videoUrl,
    audioUrl,
    params: (job.params ?? {}) as Record<string, unknown>,
    webhookUrl: `${env.APP_BASE_URL}/api/webhooks/${job.provider}?jobId=${job.id}&secret=${env.WEBHOOK_SECRET}`,
    credential,
  };

  try {
    const result = await provider.generate(input);
    await updateJobStatus(jobId, {
      status: 'running',
      providerTaskId: result.providerTaskId,
      providerRaw: result.raw ?? {},
      progress: 5,
    });
    await jobsQueue.add(
      'poll',
      { type: 'poll', jobId, attempt: 0 },
      {
        delay: 5000,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  } catch (err) {
    await updateJobStatus(jobId, {
      status: 'failed',
      error: (err as Error).message,
      finishedAt: new Date(),
    });
  }
}

export async function applyTaskStatus(jobId: string, status: TaskStatus) {
  const job = await getJob(jobId);
  if (!job) return;
  if (job.status === 'succeeded' || job.status === 'failed') return;

  if (status.state === 'succeeded') {
    let outputAssetId: string | undefined;
    if (status.videoUrl) {
      try {
        const uploaded = await uploadFromUrl(status.videoUrl, {
          prefix: `results/${job.provider}`,
        });
        const assetId = nanoid(12);
        await db.insert(schema.assets).values({
          id: assetId,
          kind: 'video',
          mimeType: uploaded.mimeType.startsWith('video/')
            ? uploaded.mimeType
            : 'video/mp4',
          bytes: uploaded.bytes,
          s3Key: uploaded.key,
          url: uploaded.url,
          sourceUrl: status.videoUrl,
        });
        outputAssetId = assetId;
      } catch (err) {
        console.error('[jobs] mirror video failed', err);
      }
    }
    await updateJobStatus(jobId, {
      status: 'succeeded',
      progress: 100,
      outputAssetId,
      providerRaw: status.raw ?? {},
      finishedAt: new Date(),
    });
    return;
  }

  if (status.state === 'failed') {
    await updateJobStatus(jobId, {
      status: 'failed',
      error: status.error ?? 'provider reported failure',
      providerRaw: status.raw ?? {},
      finishedAt: new Date(),
    });
    return;
  }

  if (status.state === 'canceled') {
    await updateJobStatus(jobId, {
      status: 'canceled',
      finishedAt: new Date(),
    });
    return;
  }

  await updateJobStatus(jobId, {
    status: 'running',
    progress: Math.max(job.progress, status.progress ?? job.progress),
  });
}

export async function pollJob(jobId: string, attempt = 0) {
  const job = await getJob(jobId);
  if (!job) return;
  if (!job.providerTaskId) return;
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled') {
    return;
  }
  const provider = getProvider(job.provider);
  const credential = job.credentialId
    ? await getCredentialPayload(job.credentialId)
    : null;
  if (!credential) {
    await updateJobStatus(jobId, {
      status: 'failed',
      error: `Credential for job ${jobId} not found (was it deleted?)`,
      finishedAt: new Date(),
    });
    return;
  }
  try {
    const status = await provider.getStatus(job.providerTaskId, credential);
    await applyTaskStatus(jobId, status);
  } catch (err) {
    console.error(`[poll] job ${jobId} failed`, err);
  }

  const fresh = await getJob(jobId);
  if (!fresh) return;
  if (fresh.status === 'succeeded' || fresh.status === 'failed' || fresh.status === 'canceled') {
    return;
  }
  // Back off: 5s, 10s, 15s, capped 30s, until ~30 minutes.
  const next = attempt + 1;
  const delay = Math.min(5000 + attempt * 5000, 30000);
  if (next > 240) {
    await updateJobStatus(jobId, {
      status: 'failed',
      error: 'timed out waiting for provider',
      finishedAt: new Date(),
    });
    return;
  }
  await jobsQueue.add(
    'poll',
    { type: 'poll', jobId, attempt: next },
    { delay, removeOnComplete: 100, removeOnFail: 100 },
  );
}
