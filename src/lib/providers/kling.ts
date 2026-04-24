import crypto from 'node:crypto';
import { env } from '../env';
import type {
  GenerateInput,
  GenerateResult,
  ModelDescriptor,
  TaskStatus,
  VideoProvider,
} from './types';
import { ProviderNotConfiguredError } from './types';

/**
 * Kling (Kuaishou) adapter.
 * Docs: https://app.klingai.com/global/dev/document-api
 *
 * Auth: JWT (HS256) with AccessKey as `iss`, signed with SecretKey,
 * short TTL (~30 min), sent as `Authorization: Bearer <jwt>`.
 */

const MODELS: ModelDescriptor[] = [
  {
    id: 'kling-v2-1',
    label: 'Kling v2.1',
    modes: ['image-to-video', 'text-to-video'],
  },
  {
    id: 'kling-v2-1-master',
    label: 'Kling v2.1 Master (higher quality)',
    modes: ['image-to-video', 'text-to-video'],
  },
  {
    id: 'kling-v1-6',
    label: 'Kling v1.6',
    modes: ['image-to-video', 'text-to-video'],
  },
];

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(): string {
  const ak = env.KLING_ACCESS_KEY;
  const sk = env.KLING_SECRET_KEY;
  if (!ak || !sk) throw new ProviderNotConfiguredError('kling');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: ak,
    exp: now + 1800,
    nbf: now - 5,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;
  const sig = crypto.createHmac('sha256', sk).update(signingInput).digest();
  return `${signingInput}.${base64url(sig)}`;
}

async function klingFetch(path: string, init?: RequestInit) {
  const token = signJwt();
  const res = await fetch(`${env.KLING_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok || (json && json.code && json.code !== 0)) {
    throw new Error(`Kling ${path} ${res.status}: ${text}`);
  }
  return json;
}

export const klingProvider: VideoProvider = {
  id: 'kling',
  name: 'Kling',
  models: MODELS,
  isConfigured: () => Boolean(env.KLING_ACCESS_KEY && env.KLING_SECRET_KEY),

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const params = (input.params ?? {}) as Record<string, unknown>;
    const modelName = (params.model as string) ?? 'kling-v2-1';
    const duration = String(params.duration ?? '5');
    const mode = (params.quality as string) ?? 'std';
    const aspectRatio = (params.aspect_ratio as string) ?? '16:9';

    if (input.mode === 'image-to-video') {
      if (!input.imageUrl) throw new Error('imageUrl required for image-to-video');
      const body: Record<string, unknown> = {
        model_name: modelName,
        image: input.imageUrl,
        prompt: input.prompt ?? '',
        negative_prompt: input.negativePrompt ?? '',
        cfg_scale: params.cfg_scale ?? 0.5,
        mode,
        duration,
      };
      if (input.webhookUrl) body.callback_url = input.webhookUrl;
      const data = await klingFetch('/v1/videos/image2video', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return { providerTaskId: data.data.task_id, raw: data };
    }

    if (input.mode === 'text-to-video') {
      const body: Record<string, unknown> = {
        model_name: modelName,
        prompt: input.prompt ?? '',
        negative_prompt: input.negativePrompt ?? '',
        cfg_scale: params.cfg_scale ?? 0.5,
        mode,
        aspect_ratio: aspectRatio,
        duration,
      };
      if (input.webhookUrl) body.callback_url = input.webhookUrl;
      const data = await klingFetch('/v1/videos/text2video', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return { providerTaskId: data.data.task_id, raw: data };
    }

    throw new Error(`Kling does not support mode: ${input.mode}`);
  },

  async getStatus(providerTaskId: string): Promise<TaskStatus> {
    const data = await klingFetch(
      `/v1/videos/image2video/${providerTaskId}`,
    ).catch(() => klingFetch(`/v1/videos/text2video/${providerTaskId}`));
    const status = data?.data?.task_status as string | undefined;
    const state = mapState(status);
    const videoUrl: string | undefined =
      data?.data?.task_result?.videos?.[0]?.url;
    return {
      state,
      progress: state === 'succeeded' ? 100 : state === 'running' ? 50 : 0,
      videoUrl,
      error: data?.data?.task_status_msg,
      raw: data,
    };
  },

  async parseWebhook(_headers, body) {
    const data = body as any;
    const taskId = data?.data?.task_id ?? data?.task_id;
    if (!taskId) return null;
    const status = data?.data?.task_status ?? data?.task_status;
    const videoUrl = data?.data?.task_result?.videos?.[0]?.url;
    return {
      providerTaskId: taskId,
      status: {
        state: mapState(status),
        videoUrl,
        error: data?.data?.task_status_msg,
        raw: data,
      },
    };
  },
};

function mapState(s: string | undefined): TaskStatus['state'] {
  switch (s) {
    case 'submitted':
      return 'queued';
    case 'processing':
      return 'running';
    case 'succeed':
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    default:
      return 'queued';
  }
}
