'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { StatusBadge } from './StatusBadge';

interface JobRow {
  id: string;
  provider: string;
  model: string;
  mode: string;
  status: string;
  progress: number;
  createdAt: string;
}

export function JobList() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch('/api/jobs');
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setJobs(data.jobs);
      } catch {
        /* noop */
      }
    }
    load();
    const id = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!jobs) return <p className="text-xs text-slate-400">Loading…</p>;
  if (jobs.length === 0)
    return <p className="text-xs text-slate-400">No jobs yet.</p>;

  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {jobs.slice(0, 12).map((j) => (
        <li key={j.id}>
          <Link
            href={`/jobs/${j.id}`}
            className="flex items-center justify-between gap-2 py-2 hover:bg-slate-50"
          >
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-slate-700">
                {j.provider} · {j.model}
              </div>
              <div className="truncate text-[11px] text-slate-400">
                {j.mode} · {new Date(j.createdAt).toLocaleString()}
              </div>
            </div>
            <StatusBadge status={j.status} progress={j.progress} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
