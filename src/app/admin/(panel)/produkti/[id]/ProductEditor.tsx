"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronLeft, ExternalLink, Plus, Trash2, Video, X } from "lucide-react";
import { deleteProductAction, saveProductAction } from "@/app/admin/_actions/products";
import { Badge, BgRoInput, Card, ConfirmButton, Field, MoneyInput, SaveBar, Select, TextInput, Toggle, cx, type BgRo } from "@/components/admin/ui";
import { AddImagesButton } from "@/components/admin/products/AddImagesButton";
import { HtmlField } from "@/components/admin/products/HtmlField";
import { IconButton, PairInput, TagsInput } from "@/components/admin/products/inputs";
import { MetafieldsEditor } from "@/components/admin/products/MetafieldsEditor";
import { useSyncedEditor } from "@/components/admin/products/useSyncedEditor";
import {
  DEFAULT_OPTION,
  DEFAULT_VALUE,
  STATUS_LABEL,
  convertCents,
  isDefaultOnly,
  parseCents,
  parseWhole,
  type MediaForm,
  type PickerProduct,
  type ProductForm,
  type RonMarket,
  type VariantForm,
} from "@/components/admin/products/types";
import { formatMoney } from "@/lib/money";

const EMPTY: BgRo = { bg: "", ro: "" };
let seq = 0;
const tempKey = (p: string) => `${p}-new-${Date.now().toString(36)}-${++seq}`;

export function ProductEditor({
  id,
  initial,
  templates,
  ron,
  fixedRon,
  products,
  vendors,
  tags,
}: {
  id: number;
  initial: ProductForm;
  templates: string[];
  ron: RonMarket | null;
  fixedRon: Record<number, { price: number; compare_at_price: number | null }>;
  products: PickerProduct[];
  vendors: string[];
  tags: string[];
}) {
  const router = useRouter();
  const ed = useSyncedEditor(initial, (v) => saveProductAction(id, v));
  const f = ed.value;
  const set = <K extends keyof ProductForm>(key: K, v: ProductForm[K]) => ed.setValue((cur) => ({ ...cur, [key]: v }));
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState("");
  // the header and the shop link follow what is saved
  const savedHandle = ed.saved.handle;
  const savedStatus = ed.saved.status;

  const defaultOnly = isDefaultOnly(f);

  // ---- pictures
  const setMedia = (fn: (m: MediaForm[]) => MediaForm[]) => ed.setValue((cur) => ({ ...cur, media: fn(cur.media) }));
  const moveMedia = (i: number, d: number) =>
    setMedia((list) => {
      const next = [...list];
      const j = i + d;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // ---- options / variants
  const setVariants = (fn: (v: VariantForm[]) => VariantForm[]) => ed.setValue((cur) => ({ ...cur, variants: fn(cur.variants) }));
  const patchVariant = (i: number, patch: Partial<VariantForm>) => setVariants((list) => list.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const setValue = (vi: number, oi: number, val: BgRo) =>
    setVariants((list) => {
      const old = list[vi].values[oi];
      return list.map((v, j) => {
        if (j === vi) return { ...v, values: v.values.map((x, k) => (k === oi ? val : x)) };
        // the Romanian text belongs to the value: keep it the same in every variant that has this value
        if (val.ro !== old.ro && v.values[oi]?.bg === val.bg) return { ...v, values: v.values.map((x, k) => (k === oi ? { ...x, ro: val.ro } : x)) };
        return v;
      });
    });
  const startOptions = () =>
    ed.setValue((cur) => ({ ...cur, options: [{ ...EMPTY }], variants: cur.variants.map((v) => ({ ...v, values: [{ ...EMPTY }] })) }));
  const addOption = () => ed.setValue((cur) => ({ ...cur, options: [...cur.options, { ...EMPTY }], variants: cur.variants.map((v) => ({ ...v, values: [...v.values, { ...EMPTY }] })) }));
  const removeOption = (oi: number) =>
    ed.setValue((cur) => {
      if (cur.options.length === 1) {
        if (cur.variants.length > 1) return cur;
        return { ...cur, options: [{ bg: DEFAULT_OPTION, ro: "" }], variants: cur.variants.map((v) => ({ ...v, values: [{ bg: DEFAULT_VALUE, ro: "" }] })) };
      }
      return { ...cur, options: cur.options.filter((_, k) => k !== oi), variants: cur.variants.map((v) => ({ ...v, values: v.values.filter((_, k) => k !== oi) })) };
    });
  const addVariant = () =>
    setVariants((list) => {
      const last = list[list.length - 1];
      return [
        ...list,
        {
          ...last,
          id: null,
          key: tempKey("v"),
          values: last.values.map(() => ({ ...EMPTY })),
          sku: "",
          barcode: "",
          qty: "0",
          qty0: null,
        },
      ];
    });

  const ronText = (cents: number | null) => (ron && cents !== null && !Number.isNaN(cents) ? formatMoney(convertCents(cents, ron), ron.format) : "—");

  const variantFields = (v: VariantForm, i: number) => {
    const price = parseCents(v.price);
    const compare = parseCents(v.compareAt);
    const qty = parseWhole(v.qty, true);
    const weight = parseWhole(v.weight);
    const fixed = v.id !== null ? fixedRon[v.id] : undefined;
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Цена" error={price === null ? "Въведете цена." : Number.isNaN(price) ? "Напр. 12,99" : undefined}>
          <MoneyInput value={v.price} onChange={(x) => patchVariant(i, { price: x })} invalid={price === null || Number.isNaN(price)} placeholder="0,00" />
        </Field>
        <Field label="Стара цена" hint="Зачертана, при намаление" error={Number.isNaN(compare) ? "Напр. 15,99" : undefined}>
          <MoneyInput value={v.compareAt} onChange={(x) => patchVariant(i, { compareAt: x })} invalid={Number.isNaN(compare)} placeholder="—" />
        </Field>
        {ron ? (
          <div>
            <span className="mb-1.5 block text-sm font-extrabold">Цена в Румъния</span>
            <div className="flex min-h-12 flex-wrap items-baseline gap-x-2 rounded-[0.875rem] border-2 border-dashed border-line bg-canvas px-3.5 py-2.5 font-bold text-ink-soft" aria-live="polite">
              <span className="whitespace-nowrap">{fixed ? formatMoney(fixed.price, ron.format) : ronText(price)}</span>
              {(fixed ? fixed.compare_at_price : compare) ? (
                <span className="whitespace-nowrap text-sm font-semibold text-muted line-through">{fixed ? formatMoney(fixed.compare_at_price!, ron.format) : ronText(compare)}</span>
              ) : null}
            </div>
            <p className="mt-1.5 text-sm text-muted">{fixed ? "Фиксирана цена за Румъния" : "Изчислява се по курса"}</p>
          </div>
        ) : null}
        <Field label="Тегло" hint="В грамове, за доставката" error={Number.isNaN(weight) ? "Цяло число грамове" : undefined}>
          <div className="flex items-center rounded-[0.875rem] border-2 border-line bg-white focus-within:border-sky">
            <input
              inputMode="numeric"
              value={v.weight}
              onChange={(e) => patchVariant(i, { weight: e.target.value })}
              className="w-full min-w-0 bg-transparent px-3.5 py-2.5 outline-none focus-visible:outline-none"
              placeholder="0"
            />
            <span className="pr-3.5 font-bold text-muted">г</span>
          </div>
        </Field>
        <Field label="Код на продукта (SKU)" className="sm:col-span-1 lg:col-span-2">
          <TextInput value={v.sku} maxLength={255} onChange={(e) => patchVariant(i, { sku: e.target.value })} />
        </Field>
        <Field label="Баркод" className="lg:col-span-2">
          <TextInput value={v.barcode} maxLength={255} inputMode="numeric" onChange={(e) => patchVariant(i, { barcode: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3 lg:col-span-4">
          <Toggle checked={v.track} onChange={(x) => patchVariant(i, { track: x })} label="Следи наличността" description="Бройките намаляват с всяка поръчка" />
          <Field label="Наличност (бройки)" error={Number.isNaN(qty) ? "Цяло число" : undefined}>
            <TextInput inputMode="numeric" value={v.qty} disabled={!v.track} invalid={Number.isNaN(qty)} onChange={(e) => patchVariant(i, { qty: e.target.value })} />
          </Field>
          <Toggle
            checked={v.continueSelling}
            onChange={(x) => patchVariant(i, { continueSelling: x })}
            label="Продавай и когато е изчерпан"
            description="Клиентите могат да поръчат и при 0 бройки"
            className={cx(!v.track && "opacity-50")}
          />
        </div>
      </div>
    );
  };

  const doDelete = () =>
    startDelete(async () => {
      setDeleteError("");
      const r = await deleteProductAction(id);
      if (r.ok) {
        router.push("/admin/produkti");
        router.refresh();
      } else setDeleteError(r.error ?? "Изтриването не успя.");
    });

  const statusTone = savedStatus === "active" ? "mint" : savedStatus === "draft" ? "sun" : "muted";

  return (
    <>
      <Link href="/admin/produkti" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Продукти
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-black tracking-tight">{f.title.bg || "Без заглавие"}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-ink-soft">
            <Badge tone={statusTone}>{STATUS_LABEL[savedStatus] ?? savedStatus}</Badge>
            <span className="text-sm">/products/{savedHandle}</span>
          </p>
        </div>
        {savedStatus === "active" ? (
          <a href={`/bg-bg/products/${encodeURIComponent(savedHandle)}`} target="_blank" rel="noopener" className="btn btn-ghost h-11 px-5">
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
              <Field label="Тип на продукта" group hint="Кратко пояснение, напр. „100% натурално масло за тяло“.">
                <BgRoInput value={f.productType} onChange={(v) => set("productType", v)} label="Тип на продукта" maxLength={255} />
              </Field>
              <Field label="Описание" group hint="HTML код, както в Shopify. Натиснете „Преглед“, за да видите как изглежда.">
                <HtmlField value={f.body} onChange={(v) => set("body", v)} label="Описание" rows={12} />
              </Field>
            </div>
          </Card>

          <Card title="Снимки и видео" description="Първата снимка е главната: показва се в списъците с продукти и в количката.">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {f.media.map((m, i) => (
                <li key={m.key} className="flex flex-col rounded-2xl border border-line bg-white p-2">
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-canvas">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {m.url ? <img src={m.url} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}
                    <span className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
                      {i === 0 ? <Badge tone="ink">Главна</Badge> : null}
                      {m.id === null ? <Badge tone="sky">нова</Badge> : null}
                    </span>
                    {m.type !== "image" ? (
                      <Badge tone="grape" className="absolute right-1.5 top-1.5">
                        <Video className="h-3.5 w-3.5" /> Видео
                      </Badge>
                    ) : null}
                  </div>
                  {m.type === "image" ? (
                    <>
                      <input
                        value={m.alt}
                        maxLength={512}
                        onChange={(e) => setMedia((list) => list.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))}
                        placeholder="Описание (alt)"
                        aria-label={`Описание на снимка ${i + 1}`}
                        className="field mt-2 !px-2.5 !py-1.5 text-sm"
                      />
                      <div className="mt-2 flex items-center gap-1">
                        <IconButton onClick={() => moveMedia(i, -1)} disabled={i === 0} label={`Премести снимка ${i + 1} по-напред`}>
                          <ArrowLeft className="h-4 w-4" />
                        </IconButton>
                        <IconButton onClick={() => moveMedia(i, 1)} disabled={i === f.media.length - 1} label={`Премести снимка ${i + 1} по-назад`}>
                          <ArrowRight className="h-4 w-4" />
                        </IconButton>
                        <span className="flex-1 text-center text-xs font-black text-muted">{i + 1}</span>
                        <IconButton danger onClick={() => setMedia((list) => list.filter((_, j) => j !== i))} label={`Премахни снимка ${i + 1}`}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 px-1 text-xs text-muted">{i + 1}. Видеото е само за преглед и не може да се променя от тук.</p>
                  )}
                </li>
              ))}
              <li>
                <AddImagesButton onAdded={(key, url) => setMedia((list) => [...list, { id: null, key: tempKey("m"), type: "image", file: key, url, alt: "" }])} />
              </li>
            </ul>
          </Card>

          <Card
            title={defaultOnly ? "Цена и наличност" : "Варианти, цени и наличност"}
            description={defaultOnly ? "Продуктът няма варианти за избор (напр. брой или размер)." : "Всяка комбинация от опции е отделен вариант със своя цена и наличност."}
          >
            {defaultOnly ? (
              <>
                {variantFields(f.variants[0], 0)}
                <button type="button" onClick={startOptions} className="btn btn-ghost mt-6 h-10 px-4 text-sm">
                  <Plus className="h-4 w-4" /> Добави варианти (напр. брой, размер)
                </button>
              </>
            ) : (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 font-black">Опции</h3>
                  <ul className="space-y-2">
                    {f.options.map((o, oi) => (
                      <li key={oi} className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-right text-xs font-black text-muted">{oi + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <PairInput
                            value={o}
                            label={`Име на опция ${oi + 1}`}
                            placeholder="напр. Брой"
                            invalid
                            onChange={(v) => set("options", f.options.map((x, k) => (k === oi ? v : x)))}
                          />
                        </div>
                        <IconButton
                          danger
                          onClick={() => removeOption(oi)}
                          disabled={f.options.length === 1 && f.variants.length > 1}
                          label={f.options.length === 1 && f.variants.length > 1 ? "Първо оставете само един вариант" : `Премахни опция ${oi + 1}`}
                        >
                          <X className="h-4 w-4" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                  {f.options.length < 3 ? (
                    <button type="button" onClick={addOption} className="btn btn-ghost mt-3 h-9 px-3.5 text-sm">
                      <Plus className="h-4 w-4" /> Добави опция
                    </button>
                  ) : null}
                </div>

                <ol className="space-y-4">
                  {f.variants.map((v, vi) => (
                    <li key={v.key} className="rounded-2xl border border-line bg-canvas/60 p-4">
                      <div className="mb-4 flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="flex items-center gap-2 font-black">
                            Вариант {vi + 1}
                            {v.id === null ? <Badge tone="sky">нов</Badge> : null}
                          </p>
                          {f.options.map((o, oi) => (
                            <div key={oi} className="grid items-center gap-1.5 sm:grid-cols-[8rem_minmax(0,1fr)]">
                              <span className="truncate text-sm font-extrabold text-ink-soft">{o.bg || `Опция ${oi + 1}`}</span>
                              <PairInput value={v.values[oi] ?? EMPTY} label={`Вариант ${vi + 1}, ${o.bg || `опция ${oi + 1}`}`} invalid onChange={(val) => setValue(vi, oi, val)} />
                            </div>
                          ))}
                        </div>
                        <ConfirmButton
                          question={`Да премахна ли вариант ${vi + 1}? Ще бъде изтрит при запазване.`}
                          onConfirm={() => setVariants((list) => list.filter((_, j) => j !== vi))}
                          disabled={f.variants.length === 1}
                          className="btn btn-danger h-9 px-3.5 text-sm"
                        >
                          <Trash2 className="h-4 w-4" /> Премахни
                        </ConfirmButton>
                      </div>
                      {variantFields(v, vi)}
                    </li>
                  ))}
                </ol>
                <button type="button" onClick={addVariant} disabled={f.variants.length >= 100} className="btn btn-ghost h-10 px-4 text-sm">
                  <Plus className="h-4 w-4" /> Добави вариант
                </button>
              </div>
            )}
          </Card>

          <Card title="Допълнителни полета" description="Текстове, снимки и препоръки, които темата показва на страницата на продукта.">
            <MetafieldsEditor fields={f.metafields} onChange={(v) => set("metafields", v)} products={products} selfId={id} />
          </Card>

          <Card title="Търсачки (SEO)" description="Как изглежда продуктът в Google и при споделяне.">
            <div className="space-y-5">
              <Field label="Адрес на страницата" hint="Малки букви, цифри и тирета. При промяна старият адрес пренасочва автоматично към новия.">
                <div className="flex items-center rounded-[0.875rem] border-2 border-line bg-white focus-within:border-sky">
                  <span className="pl-3.5 text-muted">/products/</span>
                  <input
                    value={f.handle}
                    maxLength={255}
                    onChange={(e) => set("handle", e.target.value)}
                    className="w-full min-w-0 bg-transparent py-2.5 pr-3.5 outline-none focus-visible:outline-none"
                  />
                </div>
              </Field>
              <Field label="Заглавие за търсачките" group hint="Празно = заглавието на продукта. Препоръчително до 70 знака.">
                <BgRoInput value={f.seoTitle} onChange={(v) => set("seoTitle", v)} label="Заглавие за търсачките" maxLength={255} placeholder={f.title.bg} />
              </Field>
              <Field label="Описание за търсачките" group hint="Празно = началото на описанието. Препоръчително до 160 знака.">
                <BgRoInput value={f.seoDescription} onChange={(v) => set("seoDescription", v)} label="Описание за търсачките" multiline rows={3} maxLength={1000} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Статус">
            <Select value={f.status} onChange={(e) => set("status", e.target.value)} aria-label="Статус">
              <option value="active">Активен</option>
              <option value="draft">Чернова</option>
              {initial.status === "archived" || f.status === "archived" ? <option value="archived">Архивиран</option> : null}
            </Select>
            <p className="mt-2 text-sm text-muted">{f.status === "active" ? "Продуктът се вижда в магазина." : "Продуктът е скрит — вижда се само тук, в админ панела."}</p>
          </Card>

          <Card title="Организация">
            <div className="space-y-5">
              <Field label="Марка (производител)">
                <TextInput value={f.vendor} maxLength={255} list="product-vendors" onChange={(e) => set("vendor", e.target.value)} />
                <datalist id="product-vendors">
                  {vendors.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </Field>
              <Field label="Етикети" group hint="За филтри и специални функции на темата (напр. no_pdp — в количката продуктът е без връзка към страницата си).">
                <TagsInput value={f.tags} onChange={(v) => set("tags", v)} suggestions={tags} label="Етикети" />
              </Field>
            </div>
          </Card>

          <Card title="Шаблон на страницата">
            <Select value={f.templateSuffix} onChange={(e) => set("templateSuffix", e.target.value)} aria-label="Шаблон на страницата">
              <option value="">Стандартен (product)</option>
              {[...new Set([...templates, ...(initial.templateSuffix ? [initial.templateSuffix] : [])])].map((t) => (
                <option key={t} value={t}>
                  {t}
                  {!templates.includes(t) ? " (липсва в темата)" : ""}
                </option>
              ))}
            </Select>
            <p className="mt-2 text-sm text-muted">Оформлението от темата, с което се показва страницата на продукта.</p>
          </Card>

          <Card title="Изтриване">
            <p className="mb-3 text-sm text-ink-soft">Продуктът се изтрива завинаги. Минали поръчки запазват своето копие на продукта.</p>
            <ConfirmButton question={`Да изтрия ли „${initial.title.bg}“ завинаги? Това не може да се отмени.`} onConfirm={doDelete} disabled={deleting}>
              <Trash2 className="h-4 w-4" /> {deleting ? "Изтриване…" : "Изтрий продукта"}
            </ConfirmButton>
            {deleteError ? <p className="mt-2 text-sm font-bold text-brand">{deleteError}</p> : null}
          </Card>
        </div>
      </div>

      <SaveBar dirty={ed.dirty} pending={ed.pending} status={ed.status} onSave={ed.submit} onReset={ed.reset} />
    </>
  );
}
