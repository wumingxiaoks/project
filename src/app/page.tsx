import Link from 'next/link';
import { CreateJobForm } from '@/components/CreateJobForm';
import { JobList } from '@/components/JobList';
import { listProviders } from '@/lib/providers';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const providers = listProviders();
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Video Gen Hub
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Unified frontend for Replicate, Kling, MiniMax Hailuo image/text
            to video APIs.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {providers.map((p) => (
            <span
              key={p.id}
              className={
                'rounded-full border px-2 py-1 ' +
                (p.configured
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500')
              }
            >
              {p.name} {p.configured ? '●' : '○'}
            </span>
          ))}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">New job</h2>
          <CreateJobForm providers={providers} />
        </section>
        <aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent jobs</h2>
            <Link
              href="/jobs"
              className="text-xs text-brand-600 hover:underline"
            >
              view all →
            </Link>
          </div>
          <JobList />
        </aside>
      </div>

      <footer className="mt-16 text-center text-xs text-slate-400">
        Self-hosted. Your keys stay on your server.
      </footer>
    </main>
  );
}
