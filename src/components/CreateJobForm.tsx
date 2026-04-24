'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JobMode, ProviderId } from '@/lib/providers/types';

interface ProviderInfo {
  id: ProviderId;
  name: string;
  configured: boolean;
  models: { id: string; label: string; modes: JobMode[] }[];
}

interface Props {
  providers: ProviderInfo[];
}

export function CreateJobForm({ providers }: Props) {
  const [providerId, setProviderId] = useState<ProviderId>(
    providers.find((p) => p.configured)?.id ?? providers[0].id,
  );
  const provider = providers.find((p) => p.id === providerId)!;

  const [modelId, setModelId] = useState(provider.models[0]?.id ?? '');
  const model = provider.models.find((m) => m.id === modelId);

  const modeOptions = useMemo(() => {
    return model?.modes ?? ['image-to-video', 'text-to-video'];
  }, [model]);
  const [mode, setMode] = useState<JobMode>(
    (modeOptions[0] as JobMode) ?? 'image-to-video',
  );

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [aspect, setAspect] = useState('16:9');
  const [imageAssetId, setImageAssetId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
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

  async function onImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'image');
      const res = await fetch('/api/uploads', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setImageAssetId(data.asset.id);
      setImagePreview(data.asset.url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'image-to-video' && !imageAssetId) {
      setError('Please upload an image first.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerId,
          model: modelId,
          mode,
          prompt,
          negativePrompt: negativePrompt || undefined,
          inputImageAssetId: imageAssetId ?? undefined,
          params: {
            duration,
            aspect_ratio: aspect,
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
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
              <option key={p.id} value={p.id} disabled={!p.configured}>
                {p.name} {p.configured ? '' : '(not configured)'}
              </option>
            ))}
          </select>
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

      {mode === 'image-to-video' && (
        <Field label="Source image">
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
              JPG / PNG / WebP. Stored in your S3 bucket, then sent to the
              provider as a URL.
            </p>
          </div>
        </Field>
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
          disabled={submitting || uploading}
        >
          {submitting ? 'Submitting…' : 'Generate video'}
        </button>
        <span className="text-xs text-slate-500">
          {provider.configured
            ? 'Ready'
            : `Set ${provider.name} API keys in .env to enable`}
        </span>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
