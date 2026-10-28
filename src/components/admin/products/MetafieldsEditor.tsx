"use client";
// custom.* metafields of a product or collection, each with the input that fits its type.
import { Lock } from "lucide-react";
import { BgRoInput, Field } from "../ui";
import { ImageUpload } from "../ImageUpload";
import { HtmlField } from "./HtmlField";
import { ProductPicker } from "./ProductPicker";
import { gidList, productGid, type MetafieldForm, type PickerProduct } from "./types";

export function MetafieldsEditor({
  fields,
  onChange,
  products,
  selfId,
}: {
  fields: MetafieldForm[];
  onChange: (next: MetafieldForm[]) => void;
  products: PickerProduct[];
  /** the product being edited (not offered in its own lists) */
  selfId?: number;
}) {
  const set = (i: number, patch: Partial<MetafieldForm>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  if (!fields.length) return <p className="text-ink-soft">Няма допълнителни полета.</p>;
  return (
    <div className="space-y-7">
      {fields.map((f, i) => {
        const hint = f.hint || undefined;
        switch (f.kind) {
          case "text":
          case "multiline":
            return (
              <Field key={f.key} label={f.label} hint={hint} group>
                <BgRoInput value={{ bg: f.value, ro: f.ro }} onChange={(v) => set(i, { value: v.bg, ro: v.ro })} label={f.label} multiline={f.kind === "multiline"} rows={4} maxLength={5000} />
              </Field>
            );
          case "rich":
            return (
              <Field key={f.key} label={f.label} hint={hint} group>
                <HtmlField value={{ bg: f.value, ro: f.ro }} onChange={(v) => set(i, { value: v.bg, ro: v.ro })} label={f.label} rows={7} />
              </Field>
            );
          case "file":
            return (
              <Field key={f.key} label={f.label} hint={hint} group>
                <ImageUpload value={f.value} previewUrl={f.url} onChange={(key, url) => set(i, { value: key, url })} compact />
              </Field>
            );
          case "products":
            return (
              <Field key={f.key} label={f.label} hint={hint} group>
                <ProductPicker
                  products={products}
                  value={gidList(f.value)}
                  onChange={(ids) => set(i, { value: ids.length ? JSON.stringify(ids.map(productGid)) : "" })}
                  exclude={selfId ? [selfId] : []}
                  label={f.label}
                />
              </Field>
            );
          default:
            return (
              <Field key={f.key} label={f.label} group hint="Това поле не може да се променя от тук.">
                <div className="flex items-start gap-2 rounded-2xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink-soft">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  {f.hint ? <span className="min-w-0">{f.hint}</span> : <span className="min-w-0 break-all font-mono text-xs">{f.value}</span>}
                </div>
              </Field>
            );
        }
      })}
    </div>
  );
}
