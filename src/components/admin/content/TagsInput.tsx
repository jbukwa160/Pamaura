"use client";
// Tags as removable chips; Enter or a comma adds the typed tag. Suggests the tags already in use.
import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { TAG_MAX } from "./types";

export function TagsInput({ value, onChange, suggestions = [], max = 30 }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; max?: number }) {
  const [text, setText] = useState("");
  const id = useId();
  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((t) => t.trim().replace(/\s+/g, " ").slice(0, TAG_MAX))
      .filter(Boolean);
    const next = [...value];
    for (const t of parts) if (next.length < max && !next.some((x) => x.toLowerCase() === t.toLowerCase())) next.push(t);
    if (next.length !== value.length) onChange(next);
    setText("");
  };
  const unused = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-[0.875rem] border-2 border-line bg-white px-2 py-1.5 focus-within:border-sky">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-sky-soft py-1 pl-3 pr-1 text-sm font-bold">
            {t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white" aria-label={`Премахни етикета ${t}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          value={text}
          list={`${id}-tags`}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) add(text);
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => text.trim() && add(text)}
          placeholder={value.length ? "" : "Напишете етикет и натиснете Enter"}
          maxLength={TAG_MAX}
          aria-label="Нов етикет"
          className="min-w-40 flex-1 bg-transparent px-1.5 py-1 outline-none focus-visible:outline-none"
        />
        <datalist id={`${id}-tags`}>
          {unused.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      {unused.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted">Използвани досега:</span>
          {unused.slice(0, 12).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-0.5 font-bold hover:border-ink">
              <Plus className="h-3 w-3" /> {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
