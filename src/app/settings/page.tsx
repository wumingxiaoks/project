import Link from 'next/link';
import { CredentialManager } from '@/components/CredentialManager';
import { describeProviders } from '@/lib/providers';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const providers = describeProviders();
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage provider credentials. Secrets are encrypted at rest using{' '}
            <code>SECRETS_KEY</code>. Add multiple credentials per provider and
            switch between them when creating a job.
          </p>
        </div>
        <Link href="/" className="text-sm text-brand-600 hover:underline">
          ← back
        </Link>
      </div>
      <CredentialManager providers={providers} />
    </main>
  );
}
