"use client";
// Small inputs for the product / collection editors.
import { useId, useState } from "react";
import { X } from "lucide-react";
import { cx, type BgRo } from "../ui";

/** Bulgarian and Romanian side by side, for short texts (option names and values). */
export function PairInput({ value, onChange, label, placeholder, invalid }: { value: BgRo; onChange: (v: BgRo) => void; label: string; placeholder?: string; invalid?: boolean }) {
  const box = "flex min-w-0 items-center rounded-[0.875rem] border-2 bg-white focus-within:border-sky";
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      <div className={cx(box, invalid && !value.bg.trim() ? "border-brand" : "border-line")}>
        <span className="pl-3 text-xs font-black text-muted" aria-hidden>
          БГ
        </span>
        <input
          value={value.bg}
          maxLength={255}
          placeholder={placeholder}
          aria-label={`${label} (БГ)`}
          onChange={(e) => onChange({ ...value, bg: e.target.value })}
          className="w-full min-w-0 bg-transparent px-2.5 py-2 outline-none focus-visible:outline-none"
        />
      </div>
      <div className={cx(box, "border-line")}>
        <span className="pl-3 text-xs font-black text-muted" aria-hidden>
          RO
        </span>
        <input
          value={value.ro}
          maxLength={255}
          placeholder={value.bg || "превод"}
          aria-label={`${label} (RO)`}
          onChange={(e) => onChange({ ...value, ro: e.target.value })}
          className="w-full min-w-0 bg-transparent px-2.5 py-2 outline-none placeholder:text-muted/50 focus-visible:outline-none"
        />
      </div>
    </div>
  );
}

/** Tags as chips; Enter or comma adds one, Backspace in the empty box removes the last. */
export function TagsInput({ value, onChange, suggestions = [], label }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; label: string }) {
  const [text, setText] = useState("");
  const listId = useId();
  const add = (raw: string) => {
    const next = [...value];
    for (const part of raw.split(",")) {
      const t = part.trim().slice(0, 255);
      if (t && !next.some((x) => x.toLowerCase() === t.toLowerCase())) next.push(t);
    }
    if (next.length !== value.length) onChange(next);
    setText("");
  };
  return (
    <div className="rounded-[0.875rem] border-2 border-line bg-white p-2 focus-within:border-sky">
      {value.length ? (
        <ul className="mb-1 flex flex-wrap gap-1.5" aria-label={label}>
          {value.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full bg-canvas py-0.5 pl-3 pr-1 text-sm font-bold">
              {t}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-white hover:text-ink" aria-label={`Премахни етикета ${t}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        list={listId}
        value={text}
        aria-label={`${label}: нов етикет`}
        placeholder="Нов етикет + Enter"
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) add(v);
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (text.trim()) add(text);
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (text.trim()) add(text);
        }}
        className="w-full bg-transparent px-1.5 py-1 outline-none focus-visible:outline-none"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}

/** Round icon button with an accessible name. */
export function IconButton({
  onClick,
  label,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cx(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 bg-white transition disabled:cursor-not-allowed disabled:opacity-35",
        danger ? "border-brand-soft text-brand-dark hover:border-brand" : "border-line text-ink hover:border-ink",
      )}
    >
      {children}
    </button>
  );
}
