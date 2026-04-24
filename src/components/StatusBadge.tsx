interface Props {
  status: string;
  progress?: number;
}

const COLORS: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-600 border-slate-200',
  running: 'bg-brand-50 text-brand-700 border-brand-200',
  succeeded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  canceled: 'bg-amber-50 text-amber-700 border-amber-200',
};

export function StatusBadge({ status, progress }: Props) {
  const cls = COLORS[status] ?? COLORS.queued;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {status}
      {status === 'running' && typeof progress === 'number' && (
        <span className="opacity-70">{progress}%</span>
      )}
    </span>
  );
}
