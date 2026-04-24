import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { StatusBadge } from '@/components/StatusBadge';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const rows = await db
    .select()
    .from(schema.jobs)
    .orderBy(desc(schema.jobs.createdAt))
    .limit(100);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">All jobs</h1>
        <Link href="/" className="text-sm text-brand-600 hover:underline">
          ← new job
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Job</th>
              <th className="px-4 py-2">Provider</th>
              <th className="px-4 py-2">Model</th>
              <th className="px-4 py-2">Mode</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/jobs/${r.id}`} className="text-brand-600">
                    {r.id}
                  </Link>
                </td>
                <td className="px-4 py-2">{r.provider}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{r.model}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{r.mode}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={r.status} progress={r.progress} />
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-slate-400"
                >
                  No jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
