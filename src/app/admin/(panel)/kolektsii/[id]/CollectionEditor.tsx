"use client";

import Link from "next/link";
import { ChevronLeft, ExternalLink, Lock } from "lucide-react";
import { saveCollectionAction } from "@/app/admin/_actions/collections";
import { Badge, BgRoInput, Card, Field, SaveBar, Select, TextInput, Toggle } from "@/components/admin/ui";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { HtmlField } from "@/components/admin/products/HtmlField";
import { MetafieldsEditor } from "@/components/admin/products/MetafieldsEditor";
import { ProductPicker, ProductThumb } from "@/components/admin/products/ProductPicker";
import { useSyncedEditor } from "@/components/admin/products/useSyncedEditor";
import { COLLECTION_SORTS, type CollectionForm, type PickerProduct } from "@/components/admin/products/types";

type Kind = "manual" | "smart" | "all";
interface Rules {
  disjunctive: boolean;
  rules: { column: string; relation: string; condition: string }[];
}

const COLUMN: Record<string, string> = {
  title: "Заглавието на продукта",
  type: "Типът на продукта",
  vendor: "Марката",
  tag: "Етикетът",
  variant_price: "Цената",
  variant_compare_at_price: "Старата цена",
  variant_inventory: "Наличността",
  variant_title: "Вариантът",
};
const RELATION: Record<string, string> = {
  equals: "е",
  not_equals: "не е",
  starts_with: "започва с",
  ends_with: "завършва на",
  contains: "съдържа",
  not_contains: "не съдържа",
  greater_than: "е повече от",
  less_than: "е по-малко от",
};

export function CollectionEditor({
  id,
  kind,
  initial,
  rules,
  ruleProducts,
  templates,
  products,
}: {
  id: number;
  kind: Kind;
  initial: CollectionForm;
  rules: Rules | null;
  ruleProducts: PickerProduct[];
  templates: string[];
  products: PickerProduct[];
}) {
  const ed = useSyncedEditor(initial, (v) => saveCollectionAction(id, v));
  const f = ed.value;
  const set = <K extends keyof CollectionForm>(key: K, v: CollectionForm[K]) => ed.setValue((cur) => ({ ...cur, [key]: v }));
  const saved = ed.saved;
  const sorts = COLLECTION_SORTS.some((s) => s.value === initial.sortOrder) ? COLLECTION_SORTS : [...COLLECTION_SORTS, { value: initial.sortOrder, label: initial.sortOrder }];

  return (
    <>
      <Link href="/admin/kolektsii" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Колекции
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-black tracking-tight">{f.title.bg || "Без заглавие"}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-ink-soft">
            {saved.published ? <Badge tone="mint">Публикувана</Badge> : <Badge tone="sun">Скрита</Badge>}
            <Badge tone={kind === "manual" ? "sky" : kind === "smart" ? "grape" : "muted"}>{kind === "manual" ? "Ръчна" : kind === "smart" ? "Автоматична" : "Всички продукти"}</Badge>
            <span className="text-sm">/collections/{saved.handle}</span>
          </p>
        </div>
        {saved.published ? (
          <a href={`/bg-bg/collections/${encodeURIComponent(saved.handle)}`} target="_blank" rel="noopener" className="btn btn-ghost h-11 px-5">
            <ExternalLink className="h-4 w-4" /> Виж в сайта
          </a>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card title="Основна информация">
            <div className="space-y-5">
              <Field label="Заглавие" group error={!f.title.bg.trim() ? "Заглавието е задължително." : undefined}>
                <BgRoInput value={f.title} onChange={(v) => set("title", v)} label="Заглавие" maxLength={255} invalid={!f.title.bg.trim()} />
              </Field>
              <Field label="Описание" group hint="HTML код. Показва се, ако шаблонът на колекцията показва описание.">
                <HtmlField value={f.body} onChange={(v) => set("body", v)} label="Описание" rows={8} />
              </Field>
            </div>
          </Card>

          <Card title="Снимка" description="Показва се в списъците с колекции и в банера на колекцията, ако шаблонът го позволява.">
            <ImageUpload value={f.image} previewUrl={f.imageUrl} onChange={(key, url) => ed.setValue((cur) => ({ ...cur, image: key, imageUrl: url }))} />
            {f.image ? (
              <Field label="Описание на снимката (alt)" className="mt-4" hint="Празно = заглавието на колекцията.">
                <TextInput value={f.imageAlt} maxLength={512} onChange={(e) => set("imageAlt", e.target.value)} placeholder={f.title.bg} />
              </Field>
            ) : null}
          </Card>

          <Card
            title="Продукти"
            description={
              kind === "manual"
                ? "Добавете, премахнете или подредете продуктите. Черновите не се виждат в магазина, докато не ги активирате."
                : kind === "smart"
                  ? "Продуктите се избират автоматично по условията по-долу."
                  : "Тази колекция показва автоматично всички активни продукти."
            }
          >
            {kind === "manual" ? (
              <ProductPicker products={products} value={f.productIds} onChange={(ids) => set("productIds", ids)} label="Продукти в колекцията" emptyText="Колекцията е празна. Добавете продукти от полето по-долу." />
            ) : (
              <>
                {kind === "smart" && rules ? (
                  <div className="mb-5 rounded-2xl border border-line bg-canvas p-4">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-ink-soft">
                      <Lock className="h-4 w-4" /> Продуктът трябва да отговаря на {rules.disjunctive ? "поне едно от условията" : "всички условия"}:
                    </p>
                    <ul className="list-disc space-y-1 pl-6">
                      {rules.rules.map((r, i) => (
                        <li key={i}>
                          {COLUMN[r.column] ?? r.column} {RELATION[r.relation] ?? r.relation} <strong>„{r.condition}“</strong>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-sm text-muted">Условията не могат да се променят от тук.</p>
                  </div>
                ) : null}
                {ruleProducts.length ? (
                  <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                    {ruleProducts.map((p) => (
                      <li key={p.id}>
                        <Link href={`/admin/produkti/${p.id}`} className="flex items-center gap-3 bg-white px-3 py-2 hover:bg-cream">
                          <ProductThumb src={p.thumb} />
                          <span className="min-w-0 flex-1 truncate font-bold">{p.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-soft">В момента няма продукти, които отговарят на условията.</p>
                )}
              </>
            )}
          </Card>

          {f.metafields.length ? (
            <Card title="Допълнителни полета">
              <MetafieldsEditor fields={f.metafields} onChange={(v) => set("metafields", v)} products={products} />
            </Card>
          ) : null}

          <Card title="Търсачки (SEO)" description="Как изглежда колекцията в Google и при споделяне.">
            <div className="space-y-5">
              <Field label="Адрес на страницата" hint="Малки букви, цифри и тирета. При промяна старият адрес пренасочва автоматично към новия. Връзките в менюто към стария адрес трябва да се обновят.">
                <div className="flex items-center rounded-[0.875rem] border-2 border-line bg-white focus-within:border-sky">
                  <span className="pl-3.5 text-muted">/collections/</span>
                  <input value={f.handle} maxLength={255} onChange={(e) => set("handle", e.target.value)} className="w-full min-w-0 bg-transparent py-2.5 pr-3.5 outline-none focus-visible:outline-none" />
                </div>
              </Field>
              <Field label="Заглавие за търсачките" group hint="Празно = заглавието на колекцията.">
                <BgRoInput value={f.seoTitle} onChange={(v) => set("seoTitle", v)} label="Заглавие за търсачките" maxLength={255} placeholder={f.title.bg} />
              </Field>
              <Field label="Описание за търсачките" group hint="Празно = началото на описанието.">
                <BgRoInput value={f.seoDescription} onChange={(v) => set("seoDescription", v)} label="Описание за търсачките" multiline rows={3} maxLength={1000} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Видимост">
            <Toggle checked={f.published} onChange={(v) => set("published", v)} label="Публикувана" description={f.published ? "Колекцията се вижда в магазина." : "Скрита — адресът ѝ показва „страницата не е намерена“."} />
          </Card>

          <Card title="Подредба на продуктите">
            <Select value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} aria-label="Подредба на продуктите">
              {sorts.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <p className="mt-2 text-sm text-muted">Клиентите могат да изберат и друга подредба в магазина.</p>
          </Card>

          <Card title="Шаблон на страницата">
            <Select value={f.templateSuffix} onChange={(e) => set("templateSuffix", e.target.value)} aria-label="Шаблон на страницата">
              <option value="">Стандартен (collection)</option>
              {[...new Set([...templates, ...(initial.templateSuffix ? [initial.templateSuffix] : [])])].map((t) => (
                <option key={t} value={t}>
                  {t}
                  {!templates.includes(t) ? " (липсва в темата)" : ""}
                </option>
              ))}
            </Select>
          </Card>
        </div>
      </div>

      <SaveBar dirty={ed.dirty} pending={ed.pending} status={ed.status} onSave={ed.submit} onReset={ed.reset} />
    </>
  );
}
