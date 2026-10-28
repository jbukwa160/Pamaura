"use client";
// Editor of the theme's section texts (BG / RO), grouped by page.
import { useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import type { TextChange, TextField, TextGroup } from "@/lib/admin/theme-texts";
import { saveThemeTextsAction } from "@/app/admin/_actions/theme-texts";
import { Badge, Card, Empty, SaveBar, cx, useEditor } from "@/components/admin/ui";

type Values = Record<string, { bg: string; ro: string }>;

const plain = (v: string) => v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const isHtml = (f: TextField) => f.type === "richtext" || f.type === "inline_richtext";

function TextBox({ value, onChange, field, lang, placeholder }: { value: string; onChange: (v: string) => void; field: TextField; lang: string; placeholder?: string }) {
  const long = isHtml(field) || field.type === "textarea" || value.length > 70;
  const common = {
    value,
    placeholder,
    "aria-label": `${field.label} (${lang})`,
    className: cx("field text-[0.95rem]", isHtml(field) && "font-mono text-sm"),
  };
  return long ? <textarea {...common} rows={Math.min(8, Math.max(2, Math.ceil(value.length / 70)))} onChange={(e) => onChange(e.target.value)} /> : <input {...common} onChange={(e) => onChange(e.target.value)} />;
}

export function TextsEditor({ groups }: { groups: TextGroup[] }) {
  const initial = useMemo(() => {
    const v: Values = {};
    for (const g of groups) for (const s of g.sections) for (const f of s.fields) v[f.scope] = { bg: f.bg, ro: f.ro };
    return v;
  }, [groups]);

  const ed = useEditor<Values>(initial, async (value) => {
    const changes: TextChange[] = [];
    for (const [scope, v] of Object.entries(value)) {
      const before = initial[scope];
      const c: TextChange = { scope };
      if (v.bg !== before.bg) c.bg = v.bg;
      if (v.ro !== before.ro) c.ro = v.ro;
      if (c.bg !== undefined || c.ro !== undefined) changes.push(c);
    }
    return saveThemeTextsAction(changes);
  });

  const [groupKey, setGroupKey] = useState(groups[0]?.key ?? "");
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const shown = query
    ? groups
        .map((g) => ({
          ...g,
          sections: g.sections
            .map((s) => ({ ...s, fields: s.fields.filter((f) => `${ed.value[f.scope]?.bg} ${ed.value[f.scope]?.ro} ${f.label}`.toLowerCase().includes(query)) }))
            .filter((s) => s.fields.length),
        }))
        .filter((g) => g.sections.length)
    : groups.filter((g) => g.key === groupKey);

  const set = (scope: string, lang: "bg" | "ro", v: string) => ed.setValue((prev) => ({ ...prev, [scope]: { ...prev[scope], [lang]: v } }));
  const reset = (f: TextField) => ed.setValue((prev) => ({ ...prev, [f.scope]: { bg: f.bgOriginal, ro: f.roOriginal } }));

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-3">
        <label className="flex min-w-64 flex-1 items-center rounded-[0.875rem] border-2 border-line bg-white focus-within:border-sky">
          <Search className="ml-3 h-5 w-5 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Търсете текст във всички страници…" className="w-full bg-transparent px-3 py-2.5 outline-none focus-visible:outline-none" aria-label="Търсене на текст" />
        </label>
      </div>
      {!query ? (
        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Страница">
          {groups.map((g) => (
            <button key={g.key} type="button" role="tab" aria-selected={g.key === groupKey} onClick={() => setGroupKey(g.key)} className={cx("chip", g.key === groupKey && "!border-ink !bg-ink !text-white")}>
              {g.label}
            </button>
          ))}
        </div>
      ) : null}

      {shown.length ? (
        <div className="space-y-6">
          {shown.map((g) => (
            <div key={g.key} className="space-y-4">
              <div>
                <h2 className="text-xl font-black">{g.label}</h2>
                {g.usage ? <p className="text-sm text-muted">{g.usage}</p> : null}
              </div>
              {g.sections.map((s) => (
                <Card key={s.id} title={s.title} description={s.kind}>
                  <div className="space-y-5">
                    {s.fields.map((f) => {
                      const v = ed.value[f.scope];
                      const changed = v.bg !== f.bgOriginal || v.ro !== f.roOriginal;
                      return (
                        <div key={f.scope} className="rounded-2xl border border-line p-4">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-extrabold">{f.label}</span>
                            {isHtml(f) ? <Badge>HTML</Badge> : null}
                            {changed ? <Badge tone="sun">променен</Badge> : null}
                            {changed ? (
                              <button type="button" onClick={() => reset(f)} className="ml-auto inline-flex items-center gap-1 text-sm font-bold text-sky hover:underline">
                                <RotateCcw className="h-3.5 w-3.5" /> Върни оригинала
                              </button>
                            ) : null}
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="block">
                              <span className="mb-1 block text-xs font-black text-muted">БГ</span>
                              <TextBox value={v.bg} field={f} lang="БГ" onChange={(x) => set(f.scope, "bg", x)} />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs font-black text-muted">RO</span>
                              <TextBox value={v.ro} field={f} lang="RO" placeholder={v.bg} onChange={(x) => set(f.scope, "ro", x)} />
                            </label>
                          </div>
                          {v.bg !== f.bgOriginal && v.ro === f.roOriginal && plain(f.roOriginal) ? (
                            <p className="mt-2 text-sm font-bold text-ink-soft">Сменихте българския текст — проверете дали и румънският трябва да се промени.</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Няма намерени текстове">Опитайте с друга дума.</Empty>
      )}
      <SaveBar dirty={ed.dirty} pending={ed.pending} status={ed.status} onSave={ed.submit} onReset={ed.reset} />
    </>
  );
}
