'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from './StatusBadge';

interface JobData {
  job: {
    id: string;
    provider: string;
    credentialId: string | null;
    model: string;
    mode: string;
    status: string;
    progress: number;
    prompt: string | null;
    negativePrompt: string | null;
    error: string | null;
    params: Record<string, unknown>;
    providerTaskId: string | null;
    createdAt: string;
    finishedAt: string | null;
  };
  assets: {
    inputImage: { url: string; mimeType: string } | null;
    inputVideo: { url: string; mimeType: string } | null;
    output: { url: string; mimeType: string } | null;
  };
}

export function JobDetail({ jobId }: { jobId: string }) {
  const [data, setData] = useState<JobData | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) return;
      const d = await res.json();
      if (alive) setData(d);
    }
    load();
    const id = setInterval(() => {
      if (
        !data ||
        data.job.status === 'queued' ||
        data.job.status === 'running'
      ) {
        load();
      }
    }, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [jobId, data]);

  async function cancel() {
    setCancelling(true);
    await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
    setCancelling(false);
  }

  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;
  const { job, assets } = data;

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <StatusBadge status={job.status} progress={job.progress} />
          <div className="text-sm">
            <div className="text-slate-500">
              Created {new Date(job.createdAt).toLocaleString()}
            </div>
            {job.finishedAt && (
              <div className="text-slate-500">
                Finished {new Date(job.finishedAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
        {(job.status === 'queued' || job.status === 'running') && (
          <button
            onClick={cancel}
            disabled={cancelling}
            className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            {cancelling ? 'Canceling…' : 'Cancel'}
          </button>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {assets.inputImage && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Input image
            </h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assets.inputImage.url}
              alt="input"
              className="w-full rounded-md"
            />
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Output
          </h3>
          {assets.output ? (
            <video
              src={assets.output.url}
              controls
              className="w-full rounded-md bg-black"
            />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-200 text-sm text-slate-400">
              {job.status === 'failed'
                ? 'Generation failed'
                : 'Waiting for result…'}
            </div>
          )}
          {assets.output && (
            <a
              href={assets.output.url}
              download
              className="mt-2 inline-block text-xs text-brand-600 hover:underline"
            >
              Download video →
            </a>
          )}
        </div>
      </div>

      {job.prompt && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Prompt
          </h3>
          <p className="whitespace-pre-wrap text-sm">{job.prompt}</p>
          {job.negativePrompt && (
            <>
              <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Negative prompt
              </h4>
              <p className="whitespace-pre-wrap text-sm text-slate-600">
                {job.negativePrompt}
              </p>
            </>
          )}
        </div>
      )}

      {job.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="mb-1 font-semibold">Error</div>
          <pre className="whitespace-pre-wrap break-all text-xs">
            {job.error}
          </pre>
        </div>
      )}

      <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
          Debug info
        </summary>
        <pre className="mt-3 overflow-auto rounded-md bg-slate-50 p-3 text-[11px] leading-relaxed">
          {JSON.stringify(job, null, 2)}
        </pre>
      </details>
    </div>
  );
}
