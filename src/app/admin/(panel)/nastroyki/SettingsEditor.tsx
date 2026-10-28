"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { previewRateAction, saveSettingsAction, type SettingsInput } from "@/app/admin/_actions/settings";
import type { RatePreview } from "@/lib/admin/settings";
import { Card, Field, SaveBar, TextArea, TextInput, Toggle, cx, useEditor } from "@/components/admin/ui";

export interface ShopForm {
  name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  zip: string;
  company: string;
}

export interface MarketForm {
  handle: string;
  path: string;
  label: string;
  currency: string;
  symbol: string;
  primary: boolean;
  rounding: string;
  rate: string;
  enabled: boolean;
}

export interface HeadForm {
  google_site_verification: string;
  facebook_domain_verification: string;
  klaviyo_company_id: string;
  extra_head_html: string;
}

export interface SettingsForm {
  shop: ShopForm;
  markets: MarketForm[];
  tax: { country: string; label: string; rate: string }[];
  head: HeadForm;
}

/** "5,4562554" → 5.4562554; null when it is not a positive number. */
function parseRate(text: string): number | null {
  const t = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 100000 ? n : null;
}

function parsePercent(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n <= 50 ? n : null;
}

/** What the "content" of a pasted <meta> tag holds, so pasting the whole tag works too. */
function metaContent(v: string): string {
  const m = /content\s*=\s*["']([^"']*)["']/i.exec(v);
  return m ? m[1].trim() : v;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function toInput(f: SettingsForm, initial: SettingsForm): SettingsInput | string {
  const out: SettingsInput = {};
  if (!same(f.shop, initial.shop)) {
    if (!f.shop.name.trim()) return "Въведете име на магазина.";
    out.shop = f.shop;
  }
  if (!same(f.markets, initial.markets)) {
    const markets = [];
    for (const m of f.markets) {
      const rate = m.primary ? 1 : parseRate(m.rate);
      if (rate === null) return `Въведете курса на ${m.currency} като число, например 5,0985.`;
      markets.push({ handle: m.handle, rate, enabled: m.primary ? true : m.enabled });
    }
    out.markets = markets;
  }
  if (!same(f.tax, initial.tax)) {
    const tax: Record<string, number> = {};
    for (const t of f.tax) {
      const r = parsePercent(t.rate);
      if (r === null) return `ДДС за ${t.label} трябва да е число между 0 и 50.`;
      tax[t.country] = r;
    }
    out.tax = tax;
  }
  if (!same(f.head, initial.head)) out.head = f.head;
  return out;
}

export function SettingsEditor({ initial, previews, after }: { initial: SettingsForm; previews: Record<string, RatePreview>; after: React.ReactNode }) {
  const ed = useEditor(initial, async (f) => {
    const input = toInput(f, initial);
    return typeof input === "string" ? { error: input } : saveSettingsAction(input);
  });
  const f = ed.value;
  const setShop = (k: keyof ShopForm, v: string) => ed.setValue((o) => ({ ...o, shop: { ...o.shop, [k]: v } }));
  const setMarket = (handle: string, patch: Partial<MarketForm>) => ed.setValue((o) => ({ ...o, markets: o.markets.map((m) => (m.handle === handle ? { ...m, ...patch } : m)) }));
  const setHead = (k: keyof HeadForm, v: string) => ed.setValue((o) => ({ ...o, head: { ...o.head, [k]: v } }));
  const nameChanged = f.shop.name.trim() !== initial.shop.name.trim();

  return (
    <>
      <div className="space-y-6">
        <Card title="Магазин" description="Данните на фирмата и как се свързват клиентите с вас.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Име на магазина" className="sm:col-span-2" hint="Показва се в сайта — в заглавието на страниците (в раздела на браузъра), в долната част на сайта и в Google.">
              <TextInput value={f.shop.name} maxLength={80} onChange={(e) => setShop("name", e.target.value)} invalid={!f.shop.name.trim()} />
            </Field>
            {nameChanged ? (
              <p className="flex items-start gap-2 rounded-2xl bg-sun-soft p-3 text-sm font-bold sm:col-span-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Новото име ще се появи навсякъде в сайта веднага след запазване.
              </p>
            ) : null}
            <Field label="Имейл на магазина" hint="За връзка с клиентите (показва се в сайта).">
              <TextInput type="email" value={f.shop.email} maxLength={254} onChange={(e) => setShop("email", e.target.value)} />
            </Field>
            <Field label="Телефон">
              <TextInput value={f.shop.phone} maxLength={30} inputMode="tel" onChange={(e) => setShop("phone", e.target.value)} />
            </Field>
            <Field label="Фирма" className="sm:col-span-2">
              <TextInput value={f.shop.company} maxLength={120} onChange={(e) => setShop("company", e.target.value)} />
            </Field>
            <Field label="Адрес" className="sm:col-span-2">
              <TextInput value={f.shop.street} maxLength={120} onChange={(e) => setShop("street", e.target.value)} />
            </Field>
            <Field label="Град">
              <TextInput value={f.shop.city} maxLength={80} onChange={(e) => setShop("city", e.target.value)} />
            </Field>
            <Field label="Пощенски код">
              <TextInput value={f.shop.zip} maxLength={12} onChange={(e) => setShop("zip", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title="Пазари и валута" description="Сайтът има българска версия в евро и румънска в леи. Цените в румънския сайт се изчисляват от цените в евро по курса.">
          <ul className="space-y-4">
            {f.markets.map((m) =>
              m.primary ? (
                <li key={m.handle} className="rounded-2xl bg-canvas p-4">
                  <p className="font-black">
                    {m.label} — {m.currency} <span className="font-semibold text-muted">(основен пазар, винаги включен)</span>
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">Цените на продуктите, доставката и отстъпките се въвеждат в {m.currency}.</p>
                </li>
              ) : (
                <MarketRow key={m.handle} m={m} initialRate={initial.markets.find((x) => x.handle === m.handle)?.rate ?? m.rate} preview={previews[m.handle]} onChange={(patch) => setMarket(m.handle, patch)} />
              ),
            )}
          </ul>
        </Card>

        <Card title="ДДС" description="Цените в сайта вече включват ДДС. Ставката се използва само за да се покаже колко от сумата на поръчката е ДДС.">
          <div className="flex flex-wrap gap-4">
            {f.tax.map((t, i) => (
              <Field key={t.country} label={t.label}>
                <div className={cx("flex w-36 items-center rounded-[0.875rem] border-2 bg-white focus-within:border-sky", parsePercent(t.rate) === null ? "border-brand" : "border-line")}>
                  <input
                    inputMode="decimal"
                    value={t.rate}
                    maxLength={6}
                    onChange={(e) => ed.setValue((o) => ({ ...o, tax: o.tax.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)) }))}
                    className="w-full min-w-0 bg-transparent px-3.5 py-2.5 text-base outline-none focus-visible:outline-none"
                  />
                  <span className="pr-3.5 font-bold text-muted">%</span>
                </div>
              </Field>
            ))}
          </div>
        </Card>

        <Card title="Кодове за Google, Facebook и Klaviyo" description="Кодове за потвърждение на сайта и за услугите за маркетинг. Обикновено се попълват веднъж — от вас или от човека, който поддържа рекламите.">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Google (site verification)" hint="Само кода — или поставете целия <meta> таг, ще го извадим.">
              <TextInput
                value={f.head.google_site_verification}
                maxLength={300}
                spellCheck={false}
                className="font-mono text-sm"
                onChange={(e) => setHead("google_site_verification", metaContent(e.target.value))}
              />
            </Field>
            <Field label="Facebook (domain verification)" hint="Кодът от Meta Business Suite.">
              <TextInput
                value={f.head.facebook_domain_verification}
                maxLength={300}
                spellCheck={false}
                className="font-mono text-sm"
                onChange={(e) => setHead("facebook_domain_verification", metaContent(e.target.value))}
              />
            </Field>
            <Field label="Klaviyo (Company ID / Public API key)" hint="6 знака, напр. AbC123. Празно = Klaviyo се изключва от сайта.">
              <TextInput value={f.head.klaviyo_company_id} maxLength={300} spellCheck={false} className="font-mono text-sm" onChange={(e) => setHead("klaviyo_company_id", e.target.value.trim())} />
            </Field>
          </div>
          <Field label="Допълнителен код в <head>" className="mt-5" hint="Например Google Analytics или Meta Pixel. Празно = нищо.">
            <TextArea rows={6} value={f.head.extra_head_html} maxLength={20000} spellCheck={false} className="font-mono text-sm" onChange={(e) => setHead("extra_head_html", e.target.value)} />
          </Field>
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-brand-soft p-3 text-sm font-bold text-brand-dark">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Този код влиза във всяка страница на сайта, без проверка. Грешен или чужд код може да счупи сайта или да събира данни на клиентите. Поставяйте само код от услуги, на
            които имате доверие, и само ако знаете какво прави.
          </p>
        </Card>

        {after}
      </div>
      <SaveBar dirty={ed.dirty} pending={ed.pending} status={ed.status} onSave={ed.submit} onReset={ed.reset} />
    </>
  );
}

function MarketRow({ m, initialRate, preview, onChange }: { m: MarketForm; initialRate: string; preview?: RatePreview; onChange: (patch: Partial<MarketForm>) => void }) {
  const rate = parseRate(m.rate);
  const key = rate === null ? "" : String(rate);
  const [shown, setShown] = useState<{ key: string; data?: RatePreview }>({ key: String(parseRate(initialRate) ?? ""), data: preview });

  // live example: ask the server to convert with the typed rate (the same function the shop uses)
  useEffect(() => {
    if (!key || key === shown.key) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await previewRateAction(m.handle, Number(key));
      if (!cancelled && r.preview) setShown({ key, data: r.preview });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key, shown.key, m.handle]);

  const loading = !!key && key !== shown.key;
  return (
    <li className={cx("rounded-2xl border-2 p-4 md:p-5", m.enabled ? "border-line" : "border-dashed border-line bg-canvas")}>
      <Toggle
        checked={m.enabled}
        onChange={(v) => onChange({ enabled: v })}
        label={`${m.label} — ${m.currency} (/${m.path})`}
        description={m.enabled ? `Сайтът /${m.path} е включен.` : `Изключен: сайтът /${m.path} не се показва и изчезва от избора на държава / език.`}
      />
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <Field label="Курс" hint={`Цените се закръглят ${m.rounding}.`} error={rate === null ? "Въведете число, например 5,0985." : undefined}>
            <div className={cx("flex items-center rounded-[0.875rem] border-2 bg-white focus-within:border-sky", rate === null ? "border-brand" : "border-line")}>
              <span className="whitespace-nowrap pl-3.5 font-bold text-muted">1 € =</span>
              <input
                inputMode="decimal"
                value={m.rate}
                maxLength={14}
                onChange={(e) => onChange({ rate: e.target.value })}
                className="w-full min-w-0 bg-transparent px-2 py-2.5 text-base outline-none focus-visible:outline-none"
              />
              <span className="pr-3.5 font-bold text-muted">{m.symbol}</span>
            </div>
          </Field>
          {shown.data?.ownPrices ? (
            <p className="mt-2 text-sm text-muted">{shown.data.ownPrices} варианта имат собствена цена в {m.currency} и курсът не ги променя.</p>
          ) : null}
        </div>
        <div aria-live="polite">
          <p className="mb-1.5 flex items-center gap-2 text-sm font-extrabold">
            Така ще изглеждат цените {loading ? <LoaderCircle className="h-4 w-4 animate-spin text-muted" aria-label="Изчисляване" /> : null}
          </p>
          {shown.data ? (
            <ul className={cx("text-sm", loading && "opacity-50")}>
              {[...shown.data.prices, ...shown.data.amounts].map((r, i) => (
                <li
                  key={i}
                  className={cx("grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-line py-1.5 last:border-0", i === shown.data!.prices.length && "mt-1 border-t-2 border-t-line")}
                >
                  <span className="truncate text-ink-soft" title={r.label}>
                    {r.label}
                  </span>
                  <span className="whitespace-nowrap text-right">{r.base}</span>
                  <span className="whitespace-nowrap text-right font-black">→ {r.local}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Въведете курс, за да видите пример.</p>
          )}
          <p className="mt-2 text-xs text-muted">Доставката и сумите за отстъпки се превръщат по курса без закръгляне.</p>
        </div>
      </div>
    </li>
  );
}
