"use client";

import { AlertTriangle, Banknote, Gift, Landmark, Truck } from "lucide-react";
import { saveShippingAction, type ShippingInput } from "@/app/admin/_actions/shipping";
import { formatMoney } from "@/lib/money";
import { BgRoInput, Card, Field, MoneyInput, SaveBar, Select, TextArea, Toggle, cx, moneyText, parseMoney, useEditor, type BgRo } from "@/components/admin/ui";

export interface MethodForm {
  code: string;
  carrier: string;
  kind: string;
  enabled: boolean;
  price: string;
  title: BgRo;
  description: BgRo;
  markets: string[];
}

export interface ShippingForm {
  methods: MethodForm[];
  free_on: boolean;
  free_threshold: string;
  free_methods: "all" | "office_locker";
  cod_enabled: boolean;
  cod_fee: string;
  bank_transfer_enabled: boolean;
  bank_details: string;
}

export interface MarketInfo {
  handle: string;
  label: string;
  rate: number;
  moneyFormat: string;
  primary: boolean;
  enabled: boolean;
}

const CARRIER_NAMES: Record<string, string> = { econt: "Еконт", speedy: "Speedy", boxnow: "BOX NOW", other: "Друг куриер" };
const KIND_NAMES: Record<string, string> = { office: "до офис", locker: "до автомат", address: "до адрес" };

function toInput(f: ShippingForm): ShippingInput | string {
  const methods = [];
  for (const m of f.methods) {
    const price = parseMoney(m.price);
    if (price === null || Number.isNaN(price)) return `Въведете цена за „${m.title.bg || m.code}“ (например 3,50 или 0).`;
    if (!m.title.bg.trim()) return `Въведете име на български за „${m.code}“.`;
    methods.push({ code: m.code, enabled: m.enabled, price, title: m.title, description: m.description, markets: m.markets });
  }
  let threshold: number | null = null;
  if (f.free_on) {
    const t = parseMoney(f.free_threshold);
    if (t === null || Number.isNaN(t)) return "Въведете сумата за безплатна доставка (например 35,00).";
    threshold = t;
  }
  const fee = f.cod_enabled ? parseMoney(f.cod_fee) : 0;
  if (fee !== null && Number.isNaN(fee)) return "Таксата за наложен платеж трябва да е число, например 1,50.";
  if (!f.cod_enabled && !f.bank_transfer_enabled) return "Включете поне един начин на плащане — иначе никой не може да поръча.";
  if (f.bank_transfer_enabled && !f.bank_details.trim()) return "Попълнете банковите данни, за да включите банковия превод.";
  return {
    methods,
    free_threshold: threshold,
    free_methods: f.free_methods,
    cod_enabled: f.cod_enabled,
    cod_fee: fee ?? 0,
    bank_transfer_enabled: f.bank_transfer_enabled,
    bank_details: f.bank_details,
  };
}

export function ShippingEditor({
  initial,
  markets,
  available,
  savedFreeThreshold,
}: {
  initial: ShippingForm;
  markets: MarketInfo[];
  /** carrier → its methods can be offered at the checkout right now */
  available: Record<string, boolean>;
  savedFreeThreshold: number | null;
}) {
  const ed = useEditor(initial, async (f) => {
    const input = toInput(f);
    return typeof input === "string" ? { error: input } : saveShippingAction(input);
  });
  const f = ed.value;
  const set = <K extends keyof ShippingForm>(k: K, v: ShippingForm[K]) => ed.setValue((o) => ({ ...o, [k]: v }));
  const setMethod = (code: string, patch: Partial<MethodForm>) => ed.setValue((o) => ({ ...o, methods: o.methods.map((m) => (m.code === code ? { ...m, ...patch } : m)) }));
  const foreign = markets.filter((m) => !m.primary && m.enabled);
  /** "≈ 19,10 lei" — non-price amounts are converted with the plain rate (convertAmount in catalog.ts). */
  const abroad = (text: string) => {
    const c = parseMoney(text);
    if (c === null || Number.isNaN(c) || !foreign.length) return null;
    return foreign.map((m) => `≈ ${formatMoney(Math.round(c * m.rate), m.moneyFormat)} в ${m.label}`).join(" · ");
  };

  // markets where nobody could order with the current choices
  const stuck = markets.filter((mk) => mk.enabled && !f.methods.some((m) => m.enabled && m.markets.includes(mk.handle) && available[m.carrier] !== false));

  return (
    <>
      {stuck.length || (!f.cod_enabled && !f.bank_transfer_enabled) ? (
        <div className="mb-6 space-y-2" role="alert">
          {stuck.map((mk) => (
            <p key={mk.handle} className="flex items-start gap-2 rounded-2xl bg-brand-soft p-4 font-bold text-brand-dark">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> Клиентите от {mk.label} няма да могат да поръчат: няма включен начин на доставка за {mk.label}, който да се показва при поръчка.
            </p>
          ))}
          {!f.cod_enabled && !f.bank_transfer_enabled ? (
            <p className="flex items-start gap-2 rounded-2xl bg-brand-soft p-4 font-bold text-brand-dark">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> Няма включен начин на плащане — никой няма да може да поръча.
            </p>
          ) : null}
        </div>
      ) : null}

      <Card title="Начини на доставка" description="Какво вижда клиентът при поръчка, на кой пазар и на каква цена. Цените са в евро; в румънския сайт се превръщат в леи по курса от „Настройки“.">
        <ul className="space-y-4">
          {f.methods.map((m) => {
            const hidden = available[m.carrier] === false;
            return (
              <li key={m.code} className={cx("rounded-2xl border-2 p-4 md:p-5", m.enabled ? "border-line bg-white" : "border-dashed border-line bg-canvas")}>
                <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Toggle checked={m.enabled} onChange={(v) => setMethod(m.code, { enabled: v })} label={m.title.bg || m.code} />
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-0.5 text-xs font-extrabold text-muted">
                    <Truck className="h-3.5 w-3.5" /> {CARRIER_NAMES[m.carrier] ?? m.carrier} · {KIND_NAMES[m.kind] ?? m.kind}
                  </span>
                  {hidden ? (
                    <span className="rounded-full bg-sun-soft px-2.5 py-0.5 text-xs font-extrabold text-ink">скрит при поръчка — {CARRIER_NAMES[m.carrier]} не е свързан</span>
                  ) : !m.enabled ? (
                    <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-extrabold text-muted">изключен</span>
                  ) : null}
                </div>
                <div className={cx("grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]", !m.enabled && "opacity-70")}>
                  <div className="space-y-4">
                    <Field label="Име при поръчка" group>
                      <BgRoInput label="Име при поръчка" value={m.title} onChange={(v) => setMethod(m.code, { title: v })} maxLength={80} invalid={!m.title.bg.trim()} />
                    </Field>
                    <Field label="Описание (напр. срок за доставка)" group>
                      <BgRoInput label="Описание" value={m.description} onChange={(v) => setMethod(m.code, { description: v })} maxLength={160} />
                    </Field>
                  </div>
                  <div className="space-y-4">
                    <Field label="Цена" hint={abroad(m.price) ?? "0 = безплатна"}>
                      <MoneyInput value={m.price} onChange={(v) => setMethod(m.code, { price: v })} invalid={Number.isNaN(parseMoney(m.price) ?? 0) || parseMoney(m.price) === null} />
                    </Field>
                    <Field label="Показва се в" group>
                      <div className="flex flex-wrap gap-2">
                        {markets.map((mk) => {
                          const on = m.markets.includes(mk.handle);
                          return (
                            <button
                              key={mk.handle}
                              type="button"
                              className="chip"
                              aria-pressed={on}
                              onClick={() => setMethod(m.code, { markets: on ? m.markets.filter((x) => x !== mk.handle) : [...m.markets, mk.handle] })}
                            >
                              {mk.label}
                              {!mk.enabled ? <span className="text-xs opacity-70">(изключен)</span> : null}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Безплатна доставка">
          <Toggle
            checked={f.free_on}
            onChange={(v) => ed.setValue((o) => ({ ...o, free_on: v, free_threshold: v && !o.free_threshold ? moneyText(savedFreeThreshold ?? 3500) : o.free_threshold }))}
            label="Безплатна доставка над определена сума"
            description="Сравнява се сумата на продуктите след отстъпката от код."
          />
          {f.free_on ? (
            <div className="mt-5 space-y-4">
              <Field label="При поръчка от" hint={abroad(f.free_threshold) ?? undefined}>
                <div className="max-w-48">
                  <MoneyInput value={f.free_threshold} onChange={(v) => set("free_threshold", v)} invalid={parseMoney(f.free_threshold) === null || Number.isNaN(parseMoney(f.free_threshold))} />
                </div>
              </Field>
              <Field label="Важи за">
                <Select value={f.free_methods} onChange={(e) => set("free_methods", e.target.value === "office_locker" ? "office_locker" : "all")}>
                  <option value="all">Всички начини на доставка</option>
                  <option value="office_locker">Само до офис и автомат (до адрес се плаща)</option>
                </Select>
              </Field>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">Доставката винаги се плаща (освен с код за безплатна доставка).</p>
          )}
          <p className="mt-4 flex items-start gap-2 text-sm text-ink-soft">
            <Gift className="mt-0.5 h-4 w-4 shrink-0" /> Ако промените сумата, проверете и текста за безплатна доставка в горната лента на сайта — той не се сменя сам.
          </p>
        </Card>

        <Card title="Плащане">
          <div className="space-y-6">
            <div>
              <Toggle
                checked={f.cod_enabled}
                onChange={(v) => set("cod_enabled", v)}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Banknote className="h-4 w-4" /> Наложен платеж
                  </span>
                }
                description="Клиентът плаща на куриера при получаване."
              />
              {f.cod_enabled ? (
                <Field label="Такса за наложен платеж" hint={abroad(f.cod_fee) ? `${abroad(f.cod_fee)}. 0 = без такса.` : "0 = без такса. Добавя се към поръчката."} className="mt-3 pl-15">
                  <div className="max-w-48">
                    <MoneyInput value={f.cod_fee} onChange={(v) => set("cod_fee", v)} placeholder="0,00" invalid={Number.isNaN(parseMoney(f.cod_fee))} />
                  </div>
                </Field>
              ) : null}
            </div>
            <div>
              <Toggle
                checked={f.bank_transfer_enabled}
                onChange={(v) => set("bank_transfer_enabled", v)}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Landmark className="h-4 w-4" /> Банков превод
                  </span>
                }
                description="Изпращате поръчката, след като парите пристигнат."
              />
              <Field label="Банкови данни" hint="Показват се на клиента след поръчката и в имейла за потвърждение. Номерът на поръчката се добавя автоматично като основание." className="mt-3">
                <TextArea
                  rows={4}
                  value={f.bank_details}
                  maxLength={1000}
                  onChange={(e) => set("bank_details", e.target.value)}
                  placeholder={"Получател: ДИЛОН ЕООД\nIBAN: BG.. .... .... .... .... ..\nБанка: …"}
                  className={cx(f.bank_transfer_enabled && !f.bank_details.trim() && "!border-brand")}
                />
              </Field>
            </div>
          </div>
        </Card>
      </div>

      <SaveBar dirty={ed.dirty} pending={ed.pending} status={ed.status} onSave={ed.submit} onReset={ed.reset} />
    </>
  );
}
