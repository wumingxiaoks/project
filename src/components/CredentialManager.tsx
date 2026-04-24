'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CredentialFieldSpec,
  ProviderId,
} from '@/lib/providers/types';

interface ProviderInfo {
  id: ProviderId;
  name: string;
  credentialFields: CredentialFieldSpec[];
}

interface CredentialSummary {
  id: string;
  provider: ProviderId;
  label: string;
  isDefault: boolean;
  config: Record<string, string | undefined>;
  secretsMasked: Record<string, string>;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
}

export function CredentialManager({ providers }: { providers: ProviderInfo[] }) {
  const [creds, setCreds] = useState<CredentialSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProvider, setEditingProvider] = useState<ProviderId | null>(
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/credentials');
    if (res.ok) {
      const d = await res.json();
      setCreds(d.credentials);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byProvider = useMemo(() => {
    const map: Record<string, CredentialSummary[]> = {};
    for (const p of providers) map[p.id] = [];
    for (const c of creds) {
      (map[c.provider] ??= []).push(c);
    }
    return map;
  }, [creds, providers]);

  return (
    <div className="space-y-8">
      {providers.map((p) => (
        <section
          key={p.id}
          className="rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div>
              <h2 className="font-medium">{p.name}</h2>
              <p className="text-xs text-slate-500">
                {byProvider[p.id].length} credential
                {byProvider[p.id].length === 1 ? '' : 's'}
              </p>
            </div>
            <button
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
              onClick={() => {
                setEditingProvider(p.id);
                setEditingId(null);
              }}
            >
              + Add
            </button>
          </header>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <p className="p-4 text-sm text-slate-400">Loading…</p>
            ) : byProvider[p.id].length === 0 ? (
              <p className="p-4 text-sm text-slate-400">
                No credentials yet. Click <em>Add</em> to create one.
              </p>
            ) : (
              byProvider[p.id].map((c) => (
                <CredentialRow
                  key={c.id}
                  cred={c}
                  onEdit={() => {
                    setEditingProvider(c.provider);
                    setEditingId(c.id);
                  }}
                  onChanged={load}
                />
              ))
            )}
          </div>
        </section>
      ))}
      {editingProvider && (
        <CredentialEditor
          provider={providers.find((p) => p.id === editingProvider)!}
          existingId={editingId}
          existing={
            editingId ? creds.find((c) => c.id === editingId) ?? null : null
          }
          onClose={() => {
            setEditingProvider(null);
            setEditingId(null);
          }}
          onSaved={() => {
            setEditingProvider(null);
            setEditingId(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CredentialRow({
  cred,
  onEdit,
  onChanged,
}: {
  cred: CredentialSummary;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

  async function test() {
    setTesting(true);
    setLastResult(null);
    try {
      const res = await fetch(`/api/credentials/${cred.id}/test`, {
        method: 'POST',
      });
      const d = await res.json();
      setLastResult({ ok: d.ok, msg: d.message });
      onChanged();
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete credential "${cred.label}"?`)) return;
    await fetch(`/api/credentials/${cred.id}`, { method: 'DELETE' });
    onChanged();
  }

  async function setDefault() {
    await fetch(`/api/credentials/${cred.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    });
    onChanged();
  }

  const status =
    lastResult ??
    (cred.lastTestOk === null
      ? null
      : { ok: cred.lastTestOk, msg: cred.lastTestMessage ?? '' });

  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{cred.label}</span>
          {cred.isDefault && (
            <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-brand-700">
              default
            </span>
          )}
          {status && (
            <span
              className={
                'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ' +
                (status.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700')
              }
              title={status.msg}
            >
              {status.ok ? 'ok' : 'error'}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500">
          {Object.entries(cred.secretsMasked).map(([k, v]) => (
            <span key={k}>
              <code className="text-slate-400">{k}</code> {v}
            </span>
          ))}
          {Object.entries(cred.config)
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <span key={k}>
                <code className="text-slate-400">{k}</code> {v as string}
              </span>
            ))}
        </div>
        {status && !status.ok && status.msg && (
          <div className="mt-1 truncate text-[11px] text-red-600">{status.msg}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={test}
          disabled={testing}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
        >
          {testing ? 'Testing…' : 'Test'}
        </button>
        {!cred.isDefault && (
          <button
            onClick={setDefault}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs hover:bg-slate-50"
          >
            Set default
          </button>
        )}
        <button
          onClick={onEdit}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs hover:bg-slate-50"
        >
          Edit
        </button>
        <button
          onClick={remove}
          className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function CredentialEditor({
  provider,
  existingId,
  existing,
  onClose,
  onSaved,
}: {
  provider: ProviderInfo;
  existingId: string | null;
  existing: CredentialSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!existingId;

  const defaults = useMemo<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const f of provider.credentialFields) {
      if (f.secret) continue;
      if (existing?.config?.[f.key]) d[f.key] = String(existing.config[f.key]);
      else if (f.defaultValue) d[f.key] = f.defaultValue;
    }
    return d;
  }, [provider, existing]);

  const [label, setLabel] = useState(existing?.label ?? '');
  const [values, setValues] = useState<Record<string, string>>({
    ...defaults,
  });
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const secrets: Record<string, string> = {};
      const config: Record<string, string> = {};
      for (const f of provider.credentialFields) {
        const v = values[f.key] ?? '';
        if (f.secret) {
          if (v) secrets[f.key] = v;
        } else if (v) {
          config[f.key] = v;
        }
      }
      const payload = { label, config, secrets, isDefault };
      const res = await fetch(
        isEdit ? `/api/credentials/${existingId}` : '/api/credentials',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isEdit ? payload : { provider: provider.id, ...payload }),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={save}
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
      >
        <h3 className="mb-1 text-lg font-semibold">
          {isEdit ? 'Edit' : 'Add'} {provider.name} credential
        </h3>
        <p className="mb-5 text-xs text-slate-500">
          Secret fields are stored encrypted. Leave blank to keep current
          value when editing.
        </p>

        <div className="space-y-3">
          <Field label="Label">
            <input
              required
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`e.g. ${provider.name} — main account`}
            />
          </Field>

          {provider.credentialFields.map((f) => (
            <Field
              key={f.key}
              label={`${f.label}${f.required ? ' *' : ''}`}
              hint={f.helpText}
            >
              <input
                className="input"
                type={f.type === 'password' ? 'password' : 'text'}
                value={values[f.key] ?? ''}
                placeholder={
                  f.secret && existing?.secretsMasked?.[f.key]
                    ? existing.secretsMasked[f.key]
                    : f.placeholder
                }
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
              />
            </Field>
          ))}

          <label className="flex items-center gap-2 pt-1 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Use as default for {provider.name}
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
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
        `}</style>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}
