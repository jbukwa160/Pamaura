"use client";
// Checkbox list with a search box, for choosing products or collections (e.g. what a discount code applies to).
import { useId, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { cx } from "../ui";

export interface PickItem {
  id: number;
  title: string;
  hint?: string;
}

export function PickList({ items, value, onChange, label, empty = "Няма нищо за избиране." }: { items: PickItem[]; value: number[]; onChange: (ids: number[]) => void; label: string; empty?: string }) {
  const [q, setQ] = useState("");
  const id = useId();
  const chosen = useMemo(() => new Set(value), [value]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => i.title.toLowerCase().includes(t) || (i.hint ?? "").toLowerCase().includes(t)) : items;
  }, [items, q]);
  const toggle = (itemId: number) => onChange(chosen.has(itemId) ? value.filter((v) => v !== itemId) : [...value, itemId]);
  const picked = items.filter((i) => chosen.has(i.id));

  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="rounded-2xl border-2 border-line bg-white">
      {picked.length ? (
        <div className="flex flex-wrap gap-1.5 border-b border-line p-3" aria-label={`Избрани: ${label}`}>
          {picked.map((p) => (
            <button key={p.id} type="button" onClick={() => toggle(p.id)} className="chip !py-1 text-xs" aria-label={`Махни ${p.title}`}>
              {p.title} <X className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      ) : null}
      <label className="flex items-center gap-2 border-b border-line px-3">
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Търсене…" aria-label={`Търсене: ${label}`} className="w-full bg-transparent py-2.5 outline-none focus-visible:outline-none" />
      </label>
      <span id={id} className="sr-only">
        {label}
      </span>
      <ul className="max-h-72 overflow-y-auto p-1.5" aria-labelledby={id}>
        {shown.map((i) => (
          <li key={i.id}>
            <label className={cx("flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-cream", chosen.has(i.id) && "bg-sky-soft")}>
              <input type="checkbox" checked={chosen.has(i.id)} onChange={() => toggle(i.id)} className="h-5 w-5 shrink-0 accent-brand" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{i.title}</span>
                {i.hint ? <span className="block truncate text-xs text-muted">{i.hint}</span> : null}
              </span>
            </label>
          </li>
        ))}
        {!shown.length ? <li className="px-2.5 py-3 text-sm text-muted">Нищо не съвпада с „{q}“.</li> : null}
      </ul>
    </div>
  );
}
