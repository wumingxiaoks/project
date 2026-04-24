export type ProviderId = 'replicate' | 'kling' | 'minimax';

export type JobMode =
  | 'image-to-video'
  | 'text-to-video'
  | 'act'
  | 'talking-head';

/** Describes a field that the UI should render for a credential. */
export interface CredentialFieldSpec {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  secret: boolean;
  placeholder?: string;
  defaultValue?: string;
  helpText?: string;
}

/**
 * A credential is a named set of fields (some secret) that lets us call
 * a specific provider. Secret fields live inside `secrets`; non-secret
 * fields (e.g. API base URL, region) live inside `config`.
 */
export interface CredentialPayload {
  id: string;
  provider: ProviderId;
  label: string;
  config: Record<string, string | undefined>;
  secrets: Record<string, string | undefined>;
}

export interface GenerateInput {
  jobId: string;
  mode: JobMode;
  prompt?: string;
  negativePrompt?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  params?: Record<string, unknown>;
  webhookUrl?: string;
  credential: CredentialPayload;
}

export interface GenerateResult {
  providerTaskId: string;
  raw?: Record<string, unknown>;
}

export type TaskState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export interface TaskStatus {
  state: TaskState;
  progress?: number;
  videoUrl?: string;
  error?: string;
  raw?: Record<string, unknown>;
}

export interface ModelDescriptor {
  id: string;
  label: string;
  modes: JobMode[];
  description?: string;
}

export interface VideoProvider {
  id: ProviderId;
  name: string;
  models: ModelDescriptor[];
  credentialFields: CredentialFieldSpec[];
  generate(input: GenerateInput): Promise<GenerateResult>;
  getStatus(
    providerTaskId: string,
    credential: CredentialPayload,
  ): Promise<TaskStatus>;
  cancel?(
    providerTaskId: string,
    credential: CredentialPayload,
  ): Promise<void>;
  parseWebhook?(
    headers: Record<string, string>,
    body: unknown,
  ): Promise<{ providerTaskId: string; status: TaskStatus } | null>;
  /** Lightweight auth check; used by the "Test" button in the UI. */
  testCredential(credential: CredentialPayload): Promise<{ ok: boolean; message: string }>;
}

export class ProviderAuthError extends Error {
  constructor(provider: ProviderId, msg: string) {
    super(`[${provider}] ${msg}`);
    this.name = 'ProviderAuthError';
  }
}
