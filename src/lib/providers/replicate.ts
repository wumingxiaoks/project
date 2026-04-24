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
 * Replicate adapter.
 * Model is selected via `params.model` ("owner/name" or "owner/name:version").
 * Docs: https://replicate.com/docs/reference/http
 */

const DEFAULT_MODELS: ModelDescriptor[] = [
  {
    id: 'kwaivgi/kling-v2.1',
    label: 'Kling v2.1 (via Replicate)',
    modes: ['image-to-video', 'text-to-video'],
  },
  {
    id: 'minimax/hailuo-02',
    label: 'MiniMax Hailuo 02 (via Replicate)',
    modes: ['image-to-video', 'text-to-video'],
  },
  {
    id: 'wan-video/wan-2.2-i2v-a14b',
    label: 'Wan 2.2 I2V (Alibaba, open source)',
    modes: ['image-to-video'],
  },
  {
    id: 'bytedance/seedance-1-pro',
    label: 'ByteDance Seedance 1 Pro',
    modes: ['image-to-video', 'text-to-video'],
  },
];

const CREDENTIAL_FIELDS: CredentialFieldSpec[] = [
  {
    key: 'apiToken',
    label: 'API Token',
    type: 'password',
    required: true,
    secret: true,
    placeholder: 'r8_************************',
    helpText: 'https://replicate.com/account/api-tokens',
  },
];

function getToken(cred: CredentialPayload): string {
  const t = cred.secrets.apiToken;
  if (!t) throw new Error('Replicate apiToken is missing');
  return t;
}

async function replicateFetch(
  path: string,
  cred: CredentialPayload,
  init?: RequestInit,
) {
  const token = getToken(cred);
  const res = await fetch(`https://api.replicate.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=0',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Replicate ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

function parseModel(ref: string) {
  const [ownerName, version] = ref.split(':');
  const [owner, name] = ownerName.split('/');
  return { owner, name, version };
}

function buildInput(input: GenerateInput): Record<string, unknown> {
  const { mode, prompt, negativePrompt, imageUrl, params } = input;
  const extra = (params ?? {}) as Record<string, unknown>;
  const { model: _m, version: _v, ...rest } = extra;
  void _m;
  void _v;
  const base: Record<string, unknown> = { ...rest };
  if (prompt) base.prompt = prompt;
  if (negativePrompt) base.negative_prompt = negativePrompt;
  if (imageUrl && (mode === 'image-to-video' || mode === 'act')) {
    base.image = imageUrl;
    base.start_image = imageUrl;
    base.first_frame_image = imageUrl;
  }
  return base;
}

export const replicateProvider: VideoProvider = {
  id: 'replicate',
  name: 'Replicate',
  models: DEFAULT_MODELS,
  credentialFields: CREDENTIAL_FIELDS,

  async generate(input): Promise<GenerateResult> {
    const params = (input.params ?? {}) as Record<string, unknown>;
    const modelRef = (params.model as string) ?? DEFAULT_MODELS[0].id;
    const { owner, name, version } = parseModel(modelRef);
    const body: Record<string, unknown> = { input: buildInput(input) };
    if (input.webhookUrl) {
      body.webhook = input.webhookUrl;
      body.webhook_events_filter = ['completed'];
    }
    let data: any;
    if (version) {
      body.version = version;
      data = await replicateFetch('/v1/predictions', input.credential, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    } else {
      data = await replicateFetch(
        `/v1/models/${owner}/${name}/predictions`,
        input.credential,
        { method: 'POST', body: JSON.stringify(body) },
      );
    }
    return { providerTaskId: data.id, raw: data };
  },

  async getStatus(providerTaskId, credential): Promise<TaskStatus> {
    const data: any = await replicateFetch(
      `/v1/predictions/${providerTaskId}`,
      credential,
    );
    const state = mapState(data.status);
    return {
      state,
      progress: state === 'succeeded' ? 100 : state === 'running' ? 50 : 0,
      videoUrl: extractVideoUrl(data.output),
      error: data.error ?? undefined,
      raw: data,
    };
  },

  async cancel(providerTaskId, credential) {
    await replicateFetch(
      `/v1/predictions/${providerTaskId}/cancel`,
      credential,
      { method: 'POST' },
    );
  },

  async parseWebhook(_headers, body) {
    const data = body as any;
    if (!data?.id) return null;
    return {
      providerTaskId: data.id,
      status: {
        state: mapState(data.status),
        videoUrl: extractVideoUrl(data.output),
        error: data.error ?? undefined,
        raw: data,
      },
    };
  },

  async testCredential(credential) {
    try {
      // Calling /v1/account is a very cheap auth check.
      await replicateFetch('/v1/account', credential);
      return { ok: true, message: 'OK' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  },
};

function mapState(s: string | undefined): TaskStatus['state'] {
  switch (s) {
    case 'starting':
    case 'queued':
      return 'queued';
    case 'processing':
      return 'running';
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'canceled';
    default:
      return 'queued';
  }
}

function extractVideoUrl(output: unknown): string | undefined {
  if (!output) return undefined;
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    const last = output[output.length - 1];
    if (typeof last === 'string') return last;
  }
  if (typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    for (const key of ['video', 'url', 'output']) {
      const v = obj[key];
      if (typeof v === 'string') return v;
    }
  }
  return undefined;
}
