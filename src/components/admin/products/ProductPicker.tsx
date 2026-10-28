"use client";
// Chosen products in order (move up / down, remove) and a search box that adds more.
import { useId, useState } from "react";
import { ArrowDown, ArrowUp, ImageOff, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "../ui";
import { IconButton } from "./inputs";
import type { PickerProduct } from "./types";

export function ProductThumb({ src, size = "h-11 w-11" }: { src: string; size?: string }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-canvas`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-4 w-4 text-muted" />}
    </span>
  );
}

export function ProductPicker({
  products,
  value,
  onChange,
  exclude = [],
  emptyText = "Няма избрани продукти.",
  label = "Продукти",
}: {
  products: PickerProduct[];
  value: number[];
  onChange: (ids: number[]) => void;
  exclude?: number[];
  emptyText?: string;
  label?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const byId = new Map(products.map((p) => [p.id, p]));
  const chosen = value.map((id) => byId.get(id)).filter((p): p is PickerProduct => !!p);
  const term = q.trim().toLocaleLowerCase("bg");
  const candidates = products
    .filter((p) => !value.includes(p.id) && !exclude.includes(p.id) && (!term || p.title.toLocaleLowerCase("bg").includes(term) || p.handle.includes(term)))
    .slice(0, 8);
  const move = (i: number, d: number) => {
    const next = [...value];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = (id: number) => {
    onChange([...value, id]);
    setQ("");
    setActive(0);
  };
  return (
    <div>
      {chosen.length ? (
        <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line" aria-label={label}>
          {chosen.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 bg-white px-3 py-2">
              <span className="w-5 shrink-0 text-right text-xs font-black text-muted">{i + 1}</span>
              <ProductThumb src={p.thumb} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{p.title}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span className="truncate">/{p.handle}</span>
                  {!p.visible ? <Badge tone="sun">не се вижда в сайта</Badge> : null}
                </span>
              </span>
              <span className="flex gap-1">
                <IconButton onClick={() => move(i, -1)} disabled={i === 0} label={`Премести „${p.title}“ нагоре`}>
                  <ArrowUp className="h-4 w-4" />
                </IconButton>
                <IconButton onClick={() => move(i, 1)} disabled={i === chosen.length - 1} label={`Премести „${p.title}“ надолу`}>
                  <ArrowDown className="h-4 w-4" />
                </IconButton>
                <IconButton danger onClick={() => onChange(value.filter((x) => x !== p.id))} label={`Премахни „${p.title}“`}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-2xl border-2 border-dashed border-line bg-canvas px-4 py-4 text-center text-sm text-muted">{emptyText}</p>
      )}
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          role="combobox"
          aria-expanded={open && candidates.length > 0}
          aria-controls={listId}
          aria-label={`${label}: добави продукт`}
          aria-activedescendant={open && candidates[active] ? `${listId}-${candidates[active].id}` : undefined}
          value={q}
          placeholder="Търсете продукт, за да го добавите…"
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, candidates.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              if (open && candidates[active]) {
                e.preventDefault();
                add(candidates[active].id);
              }
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="field !pl-10"
        />
        {open && candidates.length ? (
          <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-2xl border border-line bg-white p-1 shadow-lift">
            {candidates.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${p.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => add(p.id)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 ${i === active ? "bg-cream" : ""}`}
              >
                <ProductThumb src={p.thumb} size="h-9 w-9" />
                <span className="min-w-0 flex-1 truncate font-bold">{p.title}</span>
                {!p.visible ? <Badge tone="sun">скрит</Badge> : null}
                <Plus className="h-4 w-4 shrink-0 text-muted" />
              </li>
            ))}
          </ul>
        ) : null}
        {open && term && !candidates.length ? (
          <p className="absolute z-20 mt-1 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-muted shadow-lift">Няма намерени продукти.</p>
        ) : null}
      </div>
    </div>
  );
}
