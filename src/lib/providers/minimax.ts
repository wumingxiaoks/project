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
 * MiniMax Hailuo video adapter.
 * Docs: https://platform.minimaxi.com/document/video_generation
 *
 * Two-step: create task -> poll status -> fetch file url.
 */

const MODELS: ModelDescriptor[] = [
  {
    id: 'MiniMax-Hailuo-02',
    label: 'Hailuo 02',
    modes: ['image-to-video', 'text-to-video'],
  },
  {
    id: 'I2V-01-Director',
    label: 'I2V-01 Director',
    modes: ['image-to-video'],
  },
  {
    id: 'T2V-01-Director',
    label: 'T2V-01 Director',
    modes: ['text-to-video'],
  },
  {
    id: 'S2V-01',
    label: 'Subject Reference (S2V-01)',
    modes: ['image-to-video'],
  },
];

async function mmFetch(path: string, init?: RequestInit) {
  const key = env.MINIMAX_API_KEY;
  if (!key) throw new ProviderNotConfiguredError('minimax');
  const res = await fetch(`${env.MINIMAX_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
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
  if (!res.ok) {
    throw new Error(`MiniMax ${path} ${res.status}: ${text}`);
  }
  const code = json?.base_resp?.status_code;
  if (code !== undefined && code !== 0) {
    throw new Error(
      `MiniMax ${path} status_code=${code}: ${json?.base_resp?.status_msg ?? text}`,
    );
  }
  return json;
}

async function urlToDataUri(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch image ${url} ${res.status}`);
  const mime = res.headers.get('content-type') ?? 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export const minimaxProvider: VideoProvider = {
  id: 'minimax',
  name: 'MiniMax Hailuo',
  models: MODELS,
  isConfigured: () => Boolean(env.MINIMAX_API_KEY),

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const params = (input.params ?? {}) as Record<string, unknown>;
    const model = (params.model as string) ?? 'MiniMax-Hailuo-02';
    const body: Record<string, unknown> = {
      model,
      prompt: input.prompt ?? '',
    };
    if (typeof params.duration === 'number') body.duration = params.duration;
    if (typeof params.resolution === 'string') body.resolution = params.resolution;

    if (input.mode === 'image-to-video') {
      if (!input.imageUrl) throw new Error('imageUrl required for image-to-video');
      body.first_frame_image = await urlToDataUri(input.imageUrl);
    }
    if (input.webhookUrl) body.callback_url = input.webhookUrl;

    const data = await mmFetch('/v1/video_generation', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { providerTaskId: data.task_id, raw: data };
  },

  async getStatus(providerTaskId: string): Promise<TaskStatus> {
    const data = await mmFetch(
      `/v1/query/video_generation?task_id=${encodeURIComponent(providerTaskId)}`,
    );
    const status = data?.status as string | undefined;
    const state = mapState(status);
    let videoUrl: string | undefined;
    if (state === 'succeeded' && data?.file_id) {
      const file = await mmFetch(
        `/v1/files/retrieve?file_id=${encodeURIComponent(data.file_id)}${
          env.MINIMAX_GROUP_ID ? `&GroupId=${env.MINIMAX_GROUP_ID}` : ''
        }`,
      );
      videoUrl = file?.file?.download_url ?? file?.file?.backup_download_url;
    }
    return {
      state,
      progress: state === 'succeeded' ? 100 : state === 'running' ? 50 : 0,
      videoUrl,
      raw: data,
    };
  },

  async parseWebhook(_headers, body) {
    const data = body as any;
    const taskId = data?.task_id;
    if (!taskId) return null;
    return {
      providerTaskId: taskId,
      status: {
        state: mapState(data?.status),
        raw: data,
      },
    };
  },
};

function mapState(s: string | undefined): TaskStatus['state'] {
  switch (s) {
    case 'Queueing':
    case 'Preparing':
      return 'queued';
    case 'Processing':
      return 'running';
    case 'Success':
      return 'succeeded';
    case 'Fail':
      return 'failed';
    default:
      return 'queued';
  }
}
