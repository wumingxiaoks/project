import { klingProvider } from './kling';
import { minimaxProvider } from './minimax';
import { replicateProvider } from './replicate';
import type { ProviderId, VideoProvider } from './types';

export const providers: Record<ProviderId, VideoProvider> = {
  replicate: replicateProvider,
  kling: klingProvider,
  minimax: minimaxProvider,
};

export function getProvider(id: ProviderId): VideoProvider {
  const p = providers[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function listProviders() {
  return Object.values(providers).map((p) => ({
    id: p.id,
    name: p.name,
    configured: p.isConfigured(),
    models: p.models,
  }));
}

export * from './types';
