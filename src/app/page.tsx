import Link from 'next/link';
import { CreateJobForm } from '@/components/CreateJobForm';
import { JobList } from '@/components/JobList';
import { listCredentials } from '@/lib/credentials';
import { describeProviders } from '@/lib/providers';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const providers = describeProviders();
  const credentials = await listCredentials();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Video Gen Hub
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Unified frontend for Replicate, Kling, MiniMax Hailuo image/text
            to video APIs. Manage multiple credentials per provider.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {providers.map((p) => {
              const count = credentials.filter(
                (c) => c.provider === p.id,
              ).length;
              return (
                <span
                  key={p.id}
                  className={
                    'rounded-full border px-2 py-1 ' +
                    (count > 0
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500')
                  }
                >
                  {p.name} · {count}
                </span>
              );
            })}
          </div>
          <Link
            href="/settings"
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            Settings →
          </Link>
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
            <Link href="/jobs" className="text-xs text-brand-600 hover:underline">
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
