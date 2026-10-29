"use client";
// Automatic discounts (no code): "Bundle & Save" — X% off the whole cart from N items on.
import { Plus, Trash2 } from "lucide-react";
import { saveAutomaticDiscountsAction } from "@/app/admin/_actions/discounts";
import { Badge, SaveBar, TextInput, Toggle, useEditor } from "@/components/admin/ui";

export interface AutoRow {
  id: string;
  title: string;
  enabled: boolean;
  percentage: number;
  min_items: number;
  used: number;
}

type Edit = { id: string; title: string; enabled: boolean; percentage: string; min_items: string; used: number };

export function AutoDiscountsEditor({ rows }: { rows: AutoRow[] }) {
  const ed = useEditor<Edit[]>(
    rows.map((r) => ({ ...r, percentage: String(r.percentage).replace(".", ","), min_items: String(r.min_items) })),
    (value) =>
      saveAutomaticDiscountsAction(
        value.map((r) => ({ id: r.id, title: r.title, enabled: r.enabled, percentage: Number(r.percentage.replace(",", ".")), min_items: Number(r.min_items) })),
      ),
  );
  const set = (i: number, patch: Partial<Edit>) => ed.setValue((v) => v.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <div className="space-y-3">
        {ed.value.map((r, i) => (
          <div key={r.id} className="grid items-end gap-3 rounded-2xl border border-line p-4 md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="pb-2">
              <Toggle checked={r.enabled} onChange={(v) => set(i, { enabled: v })} label={r.enabled ? "Включена" : "Изключена"} />
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold">Име</span>
              <TextInput value={r.title} maxLength={60} onChange={(e) => set(i, { title: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold">Отстъпка, %</span>
              <TextInput value={r.percentage} inputMode="decimal" onChange={(e) => set(i, { percentage: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold">От брой продукти</span>
              <TextInput value={r.min_items} inputMode="numeric" onChange={(e) => set(i, { min_items: e.target.value })} />
            </label>
            <div className="flex items-center gap-2 pb-2">
              <Badge>{r.used === 1 ? "1 поръчка" : `${r.used} поръчки`}</Badge>
              <button type="button" className="btn btn-danger h-10 w-10" aria-label={`Изтрий ${r.title}`} onClick={() => ed.setValue((v) => v.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-ghost mt-3 h-10 px-4 text-sm"
        onClick={() => ed.setValue((v) => [...v, { id: `auto-${Date.now()}`, title: "", enabled: true, percentage: "10", min_items: "2", used: 0 }])}
      >
        <Plus className="h-4 w-4" /> Добави автоматична отстъпка
      </button>
      <SaveBar dirty={ed.dirty} pending={ed.pending} status={ed.status} onSave={ed.submit} onReset={ed.reset} />
    </div>
  );
}
