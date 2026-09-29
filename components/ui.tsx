import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-white/[0.07] bg-white/[0.03] shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur-sm ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionHeader({
  step,
  title,
  hint,
  right,
}: {
  step: string;
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4 sm:px-6">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[11px] font-medium tracking-widest text-amber-400/90">{step}</span>
        <div>
          <h2 className="font-display text-lg font-semibold text-zinc-100">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-zinc-500">{hint}</p> : null}
        </div>
      </div>
      {right}
    </header>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const Icon = {
  play: (c = "h-4 w-4") => (
    <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10.2-6.5a1 1 0 0 0 0-1.68L9.54 4.66A1 1 0 0 0 8 5.5Z" />
    </svg>
  ),
  stop: (c = "h-4 w-4") => (
    <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  ),
  download: (c = "h-4 w-4") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 21h16" />
    </svg>
  ),
  retry: (c = "h-4 w-4") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  ),
  upload: (c = "h-4 w-4") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 17V7" />
      <path d="m7 12 5-5 5 5" />
      <path d="M4 21h16" />
    </svg>
  ),
  waveform: (c = "h-5 w-5") => (
    <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3" y="10" width="2" height="4" rx="1" />
      <rect x="7" y="7" width="2" height="10" rx="1" />
      <rect x="11" y="4" width="2" height="16" rx="1" />
      <rect x="15" y="8" width="2" height="8" rx="1" />
      <rect x="19" y="10" width="2" height="4" rx="1" />
    </svg>
  ),
  chevron: (c = "h-4 w-4") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  sparkle: (c = "h-4 w-4") => (
    <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2c.6 4.9 2.2 7.1 4.3 8.5 1.5 1 3.4 1.4 5.7 1.5-4.9.6-7.1 2.2-8.5 4.3-1 1.5-1.4 3.4-1.5 5.7-.6-4.9-2.2-7.1-4.3-8.5-1.5-1-3.4-1.4-5.7-1.5 4.9-.6 7.1-2.2 8.5-4.3 1-1.5 1.4-3.4 1.5-5.7Z" />
    </svg>
  ),
  file: (c = "h-4 w-4") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
    </svg>
  ),
  check: (c = "h-3.5 w-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 13 4 4L19 7" />
    </svg>
  ),
};

export function StatusDot({ status }: { status: "pending" | "generating" | "done" | "error" }) {
  const styles: Record<string, string> = {
    pending: "bg-zinc-600",
    generating: "bg-amber-400 animate-pulse-soft",
    done: "bg-emerald-400",
    error: "bg-rose-500",
  };
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${styles[status]}`} aria-label={status} />;
}

export function Badge({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "amber" | "emerald" | "rose" | "violet" }) {
  const tones: Record<string, string> = {
    zinc: "border-white/10 bg-white/[0.06] text-zinc-300",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    rose: "border-rose-400/20 bg-rose-400/10 text-rose-300",
    violet: "border-violet-400/20 bg-violet-400/10 text-violet-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}
