import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JobDetail } from '@/components/JobDetail';
import { getJob } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl">{job.id}</h1>
          <p className="text-xs text-slate-500">
            {job.provider} · {job.model} · {job.mode}
          </p>
        </div>
        <Link href="/" className="text-sm text-brand-600 hover:underline">
          ← back
        </Link>
      </div>
      <JobDetail jobId={job.id} />
    </main>
  );
}
