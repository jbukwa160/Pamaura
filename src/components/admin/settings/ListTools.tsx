// Small building blocks for the admin list pages (search box, pages, notices). No client code: usable from server pages.
import Link from "next/link";
import { AlertTriangle, CircleCheck, Info, Search } from "lucide-react";

// ui.tsx is a client module: its helpers cannot be called while rendering on the server.
const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** A GET search form: keeps the other query parameters as hidden fields. */
export function SearchBar({
  action,
  q,
  placeholder,
  keep = {},
}: {
  action: string;
  q: string;
  placeholder: string;
  keep?: Record<string, string | undefined>;
}) {
  return (
    <form className="mb-5 flex gap-2" action={action} role="search">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="flex flex-1 items-center rounded-[0.875rem] border-2 border-line bg-white focus-within:border-sky">
        <Search className="ml-3 h-5 w-5 shrink-0 text-muted" />
        <input name="q" defaultValue={q} maxLength={100} placeholder={placeholder} className="w-full bg-transparent px-3 py-2.5 outline-none focus-visible:outline-none" aria-label="Търсене" />
      </label>
      <button className="btn btn-ghost h-12 px-5">Търси</button>
    </form>
  );
}

/** "← Предишна · Следваща →" under a list. */
export function Pager({ page, pages, total, noun, href }: { page: number; pages: number; total: number; noun: string; href: (page: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-5 flex flex-wrap items-center justify-between gap-3" aria-label="Страници">
      <span className="text-sm font-bold text-muted">
        {total} {noun} · страница {page} от {pages}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="btn btn-ghost h-10 px-4 text-sm">
            ← Предишна
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className="btn btn-ghost h-10 px-4 text-sm">
            Следваща →
          </Link>
        ) : null}
      </span>
    </nav>
  );
}

const NOTICE = {
  info: { box: "bg-sky-soft text-ink", icon: Info },
  warn: { box: "bg-sun-soft text-ink", icon: AlertTriangle },
  danger: { box: "bg-brand-soft text-brand-dark", icon: AlertTriangle },
  ok: { box: "bg-mint-soft text-ink", icon: CircleCheck },
} as const;

/** A coloured explanation box (same look as the dashboard warnings). */
export function Notice({ tone = "info", children, className }: { tone?: keyof typeof NOTICE; children: React.ReactNode; className?: string }) {
  const { box, icon: Icon } = NOTICE[tone];
  return (
    <div className={cx("flex items-start gap-2.5 rounded-2xl p-4 text-[0.95rem] font-semibold", box, className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Names of .env.local variables with a set / missing mark. Never the values. */
export function EnvNames({ vars }: { vars: { name: string; set: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {vars.map((v) => (
        <li key={v.name}>
          <code className={cx("inline-block rounded-lg px-2 py-0.5 text-xs font-bold", v.set ? "bg-mint-soft text-mint" : "bg-brand-soft text-brand-dark")} title={v.set ? "попълнена" : "липсва"}>
            {v.set ? "✓" : "✗"} {v.name}
          </code>
        </li>
      ))}
    </ul>
  );
}
