import type {
  CredentialFieldSpec,
  CredentialPayload,
  GenerateInput,
  GenerateResult,
  ModelDescriptor,
  TaskStatus,
  VideoProvider,
} from './types';

/**
 * MiniMax Hailuo video adapter.
 * Docs: https://platform.minimaxi.com/document/video_generation
 */

const DEFAULT_API_BASE = 'https://api.minimaxi.chat';

const MODELS: ModelDescriptor[] = [
  {
    id: 'MiniMax-Hailuo-02',
    label: 'Hailuo 02',
    modes: ['image-to-video', 'text-to-video'],
  },
  { id: 'I2V-01-Director', label: 'I2V-01 Director', modes: ['image-to-video'] },
  { id: 'T2V-01-Director', label: 'T2V-01 Director', modes: ['text-to-video'] },
  { id: 'S2V-01', label: 'Subject Reference (S2V-01)', modes: ['image-to-video'] },
];

const CREDENTIAL_FIELDS: CredentialFieldSpec[] = [
  {
    key: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true,
    secret: true,
    placeholder: 'eyJhbGciOi...',
    helpText: 'https://platform.minimaxi.com',
  },
  {
    key: 'groupId',
    label: 'Group ID',
    type: 'text',
    required: false,
    secret: false,
    helpText: 'Required when retrieving files from some regions.',
  },
  {
    key: 'apiBase',
    label: 'API Base',
    type: 'url',
    required: false,
    secret: false,
    defaultValue: DEFAULT_API_BASE,
  },
];

function getKey(cred: CredentialPayload): string {
  const k = cred.secrets.apiKey;
  if (!k) throw new Error('MiniMax apiKey missing');
  return k;
}

function baseUrl(cred: CredentialPayload): string {
  return (cred.config.apiBase as string) || DEFAULT_API_BASE;
}

async function mmFetch(
  path: string,
  cred: CredentialPayload,
  init?: RequestInit,
) {
  const res = await fetch(`${baseUrl(cred)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getKey(cred)}`,
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
  credentialFields: CREDENTIAL_FIELDS,

  async generate(input): Promise<GenerateResult> {
    const params = (input.params ?? {}) as Record<string, unknown>;
    const model = (params.model as string) ?? 'MiniMax-Hailuo-02';
    const body: Record<string, unknown> = {
      model,
      prompt: input.prompt ?? '',
    };
    if (typeof params.duration === 'number') body.duration = params.duration;
    if (typeof params.resolution === 'string') body.resolution = params.resolution;
    if (input.mode === 'image-to-video') {
      if (!input.imageUrl) throw new Error('imageUrl required');
      body.first_frame_image = await urlToDataUri(input.imageUrl);
    }
    if (input.webhookUrl) body.callback_url = input.webhookUrl;

    const data = await mmFetch('/v1/video_generation', input.credential, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { providerTaskId: data.task_id, raw: data };
  },

  async getStatus(providerTaskId, credential): Promise<TaskStatus> {
    const data = await mmFetch(
      `/v1/query/video_generation?task_id=${encodeURIComponent(providerTaskId)}`,
      credential,
    );
    const status = data?.status as string | undefined;
    const state = mapState(status);
    let videoUrl: string | undefined;
    if (state === 'succeeded' && data?.file_id) {
      const gid = credential.config.groupId as string | undefined;
      const file = await mmFetch(
        `/v1/files/retrieve?file_id=${encodeURIComponent(data.file_id)}${
          gid ? `&GroupId=${gid}` : ''
        }`,
        credential,
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
      status: { state: mapState(data?.status), raw: data },
    };
  },

  async testCredential(credential) {
    try {
      // Cheap: list files with limit=1. If auth is bad, status_code will be non-zero.
      await mmFetch('/v1/files/list?limit=1', credential);
      return { ok: true, message: 'OK' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
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
