'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JobMode, ProviderId } from '@/lib/providers/types';

interface ProviderInfo {
  id: ProviderId;
  name: string;
  models: { id: string; label: string; modes: JobMode[] }[];
}

interface CredentialSummary {
  id: string;
  provider: ProviderId;
  label: string;
  isDefault: boolean;
  lastTestOk: boolean | null;
}

interface Props {
  providers: ProviderInfo[];
}

export function CreateJobForm({ providers }: Props) {
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [credsLoaded, setCredsLoaded] = useState(false);

  const loadCreds = useCallback(async () => {
    const res = await fetch('/api/credentials');
    if (res.ok) {
      const d = await res.json();
      setCredentials(d.credentials);
    }
    setCredsLoaded(true);
  }, []);
  useEffect(() => {
    loadCreds();
  }, [loadCreds]);

  const [providerId, setProviderId] = useState<ProviderId>(providers[0].id);
  const provider = providers.find((p) => p.id === providerId)!;

  const credsForProvider = useMemo(
    () => credentials.filter((c) => c.provider === providerId),
    [credentials, providerId],
  );

  const [credentialId, setCredentialId] = useState<string>('');
  useEffect(() => {
    if (credsForProvider.length === 0) {
      setCredentialId('');
      return;
    }
    if (credsForProvider.find((c) => c.id === credentialId)) return;
    const def = credsForProvider.find((c) => c.isDefault);
    setCredentialId((def ?? credsForProvider[0]).id);
  }, [credsForProvider, credentialId]);

  const [modelId, setModelId] = useState(provider.models[0]?.id ?? '');
  const model = provider.models.find((m) => m.id === modelId);

  const modeOptions = useMemo(
    () => model?.modes ?? ['image-to-video', 'text-to-video'],
    [model],
  );
  const [mode, setMode] = useState<JobMode>(
    (modeOptions[0] as JobMode) ?? 'image-to-video',
  );

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [aspect, setAspect] = useState('16:9');
  const [imageAssetId, setImageAssetId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoAssetId, setVideoAssetId] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [characterOrientation, setCharacterOrientation] = useState<'image' | 'video'>(
    'video',
  );
  const [keepOriginalSound, setKeepOriginalSound] = useState(true);
  const [quality, setQuality] = useState<'std' | 'pro'>('std');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onProviderChange(id: ProviderId) {
    setProviderId(id);
    const p = providers.find((pp) => pp.id === id)!;
    const m = p.models[0];
    setModelId(m?.id ?? '');
    const firstMode = (m?.modes?.[0] as JobMode) ?? 'image-to-video';
    setMode(firstMode);
  }

  function onModelChange(id: string) {
    setModelId(id);
    const m = provider.models.find((mm) => mm.id === id);
    const firstMode = (m?.modes?.[0] as JobMode) ?? 'image-to-video';
    setMode(firstMode);
  }

  async function uploadFile(
    file: File,
    kind: 'image' | 'video',
  ): Promise<{ id: string; url: string }> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    const res = await fetch('/api/uploads', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return { id: data.asset.id, url: data.asset.url };
  }

  async function onImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { id, url } = await uploadFile(file, 'image');
      setImageAssetId(id);
      setImagePreview(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function onVideoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVideo(true);
    setError(null);
    try {
      const { id, url } = await uploadFile(file, 'video');
      setVideoAssetId(id);
      setVideoPreview(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadingVideo(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!credentialId) {
      setError(
        `No credential configured for ${provider.name}. Add one in Settings.`,
      );
      return;
    }
    if ((mode === 'image-to-video' || mode === 'act') && !imageAssetId) {
      setError('Please upload a character image first.');
      return;
    }
    if (mode === 'act' && !videoAssetId) {
      setError('Please upload a reference motion video first.');
      return;
    }
    setSubmitting(true);
    try {
      const params: Record<string, unknown> = {
        duration,
        aspect_ratio: aspect,
        quality,
      };
      if (mode === 'act') {
        params.character_orientation = characterOrientation;
        params.keep_original_sound = keepOriginalSound;
      }
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerId,
          credentialId,
          model: modelId,
          mode,
          prompt,
          negativePrompt: negativePrompt || undefined,
          inputImageAssetId: imageAssetId ?? undefined,
          inputVideoAssetId: mode === 'act' ? videoAssetId ?? undefined : undefined,
          params,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? (await res.text()));
      }
      const data = await res.json();
      router.push(`/jobs/${data.job.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Provider">
          <select
            className="input"
            value={providerId}
            onChange={(e) => onProviderChange(e.target.value as ProviderId)}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Credential">
          {credsLoaded && credsForProvider.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No credentials for {provider.name}.{' '}
              <Link href="/settings" className="underline">
                Add one in Settings →
              </Link>
            </div>
          ) : (
            <select
              className="input"
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value)}
              required
            >
              {credsForProvider.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.isDefault ? ' (default)' : ''}
                  {c.lastTestOk === false ? ' — last test failed' : ''}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Model">
          <select
            className="input"
            value={modelId}
            onChange={(e) => onModelChange(e.target.value)}
          >
            {provider.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mode">
          <select
            className="input"
            value={mode}
            onChange={(e) => setMode(e.target.value as JobMode)}
          >
            {modeOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Duration (seconds)">
          <input
            className="input"
            type="number"
            min={1}
            max={10}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </Field>
        <Field label="Aspect ratio">
          <select
            className="input"
            value={aspect}
            onChange={(e) => setAspect(e.target.value)}
          >
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
            <option value="4:3">4:3</option>
          </select>
        </Field>
      </div>

      {(mode === 'image-to-video' || mode === 'act') && (
        <Field label={mode === 'act' ? 'Character image' : 'Source image'}>
          <div className="flex items-start gap-4">
            <label className="flex h-32 w-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500 hover:border-brand-400 hover:bg-brand-50">
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreview}
                  alt="preview"
                  className="h-full w-full rounded-lg object-cover"
                />
              ) : uploading ? (
                <span>Uploading…</span>
              ) : (
                <span>Click to upload</span>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onImageSelected}
              />
            </label>
            <p className="text-xs text-slate-500">
              {mode === 'act'
                ? 'JPG / PNG. Person should be clearly visible (head + torso), area ≥ 5% of frame, aspect between 1:2.5 and 2.5:1, ≤10MB.'
                : 'JPG / PNG / WebP. Stored in your S3 bucket, then sent to the provider as a URL.'}
            </p>
          </div>
        </Field>
      )}

      {mode === 'act' && (
        <>
          <Field label="Reference motion video">
            <div className="flex items-start gap-4">
              <label className="flex h-32 w-48 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500 hover:border-brand-400 hover:bg-brand-50">
                {videoPreview ? (
                  <video
                    src={videoPreview}
                    muted
                    className="h-full w-full rounded-lg object-cover"
                  />
                ) : uploadingVideo ? (
                  <span>Uploading…</span>
                ) : (
                  <span>Click to upload video</span>
                )}
                <input
                  type="file"
                  accept="video/mp4,video/quicktime"
                  className="hidden"
                  onChange={onVideoSelected}
                />
              </label>
              <p className="text-xs text-slate-500">
                MP4 / MOV, single-shot, one realistic person (upper or full
                body, head visible), 3–30 seconds, ≤100MB. The character in
                your image will perform the same actions as this video.
              </p>
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Character orientation">
              <select
                className="input"
                value={characterOrientation}
                onChange={(e) =>
                  setCharacterOrientation(e.target.value as 'image' | 'video')
                }
              >
                <option value="video">
                  match reference video (up to 30s, better for complex motion)
                </option>
                <option value="image">
                  match character image (up to 10s, better for camera moves)
                </option>
              </select>
            </Field>
            <Field label="Quality">
              <select
                className="input"
                value={quality}
                onChange={(e) => setQuality(e.target.value as 'std' | 'pro')}
              >
                <option value="std">std (cost-effective)</option>
                <option value="pro">pro (higher quality)</option>
              </select>
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={keepOriginalSound}
              onChange={(e) => setKeepOriginalSound(e.target.checked)}
            />
            Keep original audio from reference video
          </label>
        </>
      )}

      <Field label="Prompt">
        <textarea
          className="input min-h-[80px]"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A cinematic tracking shot, the person waves hand and smiles..."
        />
      </Field>

      <Field label="Negative prompt (optional)">
        <input
          className="input"
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          placeholder="blurry, distorted, extra limbs"
        />
      </Field>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="btn-primary"
          disabled={submitting || uploading || !credentialId}
        >
          {submitting ? 'Submitting…' : 'Generate video'}
        </button>
        {!credentialId && credsLoaded && (
          <span className="text-xs text-slate-500">
            Add a {provider.name} credential to enable
          </span>
        )}
      </div>

      <style>{`
        .input {
          width: 100%;
          border: 1px solid rgb(226 232 240);
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 14px;
          background: white;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .input:focus {
          border-color: #3478ff;
          box-shadow: 0 0 0 3px rgba(52, 120, 255, 0.15);
        }
        .btn-primary {
          background: #1f58ef;
          color: white;
          padding: 9px 18px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
        }
        .btn-primary:disabled {
          background: #94a3b8;
          cursor: not-allowed;
        }
        .btn-primary:not(:disabled):hover {
          background: #1944d1;
        }
      `}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
