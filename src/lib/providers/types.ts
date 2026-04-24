export type ProviderId = 'replicate' | 'kling' | 'minimax';

export type JobMode =
  | 'image-to-video'
  | 'text-to-video'
  | 'act' // reference-video driven action
  | 'talking-head';

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
}

export interface GenerateResult {
  providerTaskId: string;
  raw?: Record<string, unknown>;
}

export type TaskState = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface TaskStatus {
  state: TaskState;
  progress?: number;
  videoUrl?: string;
  error?: string;
  raw?: Record<string, unknown>;
}

export interface ModelDescriptor {
  id: string; // provider-specific model id
  label: string;
  modes: JobMode[];
  description?: string;
}

export interface VideoProvider {
  id: ProviderId;
  name: string;
  models: ModelDescriptor[];
  isConfigured(): boolean;
  generate(input: GenerateInput): Promise<GenerateResult>;
  getStatus(providerTaskId: string): Promise<TaskStatus>;
  cancel?(providerTaskId: string): Promise<void>;
  parseWebhook?(headers: Record<string, string>, body: unknown): Promise<{
    providerTaskId: string;
    status: TaskStatus;
  } | null>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: ProviderId) {
    super(`Provider ${provider} is not configured. Check environment variables.`);
    this.name = 'ProviderNotConfiguredError';
  }
}
