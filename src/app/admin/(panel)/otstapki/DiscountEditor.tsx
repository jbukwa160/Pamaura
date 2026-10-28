"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteDiscountAction, saveDiscountAction } from "@/app/admin/_actions/discounts";
import type { DiscountInput } from "@/lib/admin/discounts";
import { PickList, type PickItem } from "@/components/admin/settings/PickList";
import { Card, ConfirmButton, Field, MoneyInput, SaveBar, TextArea, TextInput, Toggle, cx, moneyText, parseMoney, useEditor } from "@/components/admin/ui";

export interface DiscountForm {
  code: string;
  kind: DiscountInput["kind"];
  percent: string;
  amount: string;
  min: string;
  applies: DiscountInput["applies"];
  productIds: number[];
  collectionIds: number[];
  starts_at: string;
  ends_at: string;
  limit: string;
  once: boolean;
  enabled: boolean;
  note: string;
}

const KIND_OPTIONS: { key: DiscountInput["kind"]; label: string; hint: string }[] = [
  { key: "percentage", label: "Процент", hint: "напр. −10% от сумата" },
  { key: "fixed_amount", label: "Сума в евро", hint: "напр. −5,00 € от сумата" },
  { key: "free_shipping", label: "Безплатна доставка", hint: "доставката става 0" },
];

const APPLIES_OPTIONS: { key: DiscountInput["applies"]; label: string }[] = [
  { key: "all", label: "Цялата поръчка" },
  { key: "collections", label: "Продукти от избрани колекции" },
  { key: "products", label: "Избрани продукти" },
];

const fmtEur = (cents: number) => `€${moneyText(cents)}`;

/** The rule in one plain sentence, as the shop owner would explain it. */
function summary(f: DiscountForm): string {
  const code = f.code.trim().toUpperCase() || "КОДЪТ";
  const pct = Number(f.percent);
  const amt = parseMoney(f.amount);
  const what =
    f.kind === "percentage"
      ? `${Number.isFinite(pct) && pct > 0 ? pct : "…"}% отстъпка`
      : f.kind === "fixed_amount"
        ? `${amt && !Number.isNaN(amt) ? fmtEur(amt) : "…"} отстъпка`
        : "безплатна доставка";
  const on =
    f.kind === "free_shipping"
      ? f.applies === "all"
        ? ""
        : f.applies === "products"
          ? ", ако в количката има някой от избраните продукти"
          : ", ако в количката има продукт от избраните колекции"
      : f.applies === "all"
        ? " от цялата поръчка"
        : f.applies === "products"
          ? " от избраните продукти в количката"
          : " от продуктите от избраните колекции";
  const min = parseMoney(f.min);
  const parts = [`Клиентът въвежда ${code} и получава ${what}${on}`];
  if (min && !Number.isNaN(min)) parts.push(`при поръчка над ${fmtEur(min)}`);
  let s = parts.join(" ") + ".";
  if (f.once) s += " Всеки клиент (имейл) може да го ползва само веднъж.";
  if (f.limit.trim()) s += ` Важи за първите ${f.limit.trim()} поръчки.`;
  if (!f.enabled) s += " В момента кодът е изключен.";
  return s;
}

function toInput(f: DiscountForm): DiscountInput | string {
  const code = f.code.trim().toUpperCase();
  if (!code) return "Въведете код.";
  let value = 0;
  if (f.kind === "percentage") {
    value = Number(f.percent.trim());
    if (!Number.isInteger(value) || value < 1 || value > 100) return "Процентът трябва да е цяло число от 1 до 100.";
  } else if (f.kind === "fixed_amount") {
    const c = parseMoney(f.amount);
    if (c === null || Number.isNaN(c) || c < 1) return "Въведете сумата на отстъпката (например 5,00).";
    value = c;
  }
  const min = parseMoney(f.min);
  if (min !== null && Number.isNaN(min)) return "Минималната сума трябва да е число, например 25,00.";
  const limitText = f.limit.trim();
  const limit = limitText ? Number(limitText) : null;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) return "Ограничението трябва да е цяло число (поне 1) или празно.";
  return {
    code,
    kind: f.kind,
    value,
    min_subtotal: min ?? 0,
    applies: f.applies,
    ids: f.applies === "products" ? f.productIds : f.applies === "collections" ? f.collectionIds : [],
    starts_at: f.starts_at,
    ends_at: f.ends_at,
    usage_limit: limit,
    once_per_customer: f.once,
    enabled: f.enabled,
    note: f.note,
  };
}

export function DiscountEditor({
  id,
  initial,
  products,
  collections,
  stats,
}: {
  id: number | null;
  initial: DiscountForm;
  products: PickItem[];
  collections: PickItem[];
  stats?: { times_used: number; created: string; state: { label: string; tone: string } };
}) {
  const router = useRouter();
  const [deleting, startDelete] = useTransition();
  const ed = useEditor(initial, async (f) => {
    const input = toInput(f);
    if (typeof input === "string") return { error: input };
    const r = await saveDiscountAction(id, input);
    if (r.ok && id === null && r.id) router.push(`/admin/otstapki/${r.id}?nov=1`);
    return r;
  });
  const f = ed.value;
  const set = <K extends keyof DiscountForm>(k: K, v: DiscountForm[K]) => ed.setValue((o) => ({ ...o, [k]: v }));

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card title="Код и отстъпка">
            <div className="space-y-5">
              <Field label="Код" hint="Това въвежда клиентът. Само латински букви и цифри — малките букви стават главни.">
                <TextInput
                  value={f.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s+/g, ""))}
                  maxLength={40}
                  placeholder="напр. LYATO10"
                  className="font-mono text-lg font-black tracking-wider"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field label="Вид" group>
                <div className="grid gap-2 sm:grid-cols-3">
                  {KIND_OPTIONS.map((k) => (
                    <label key={k.key} className={cx("cursor-pointer rounded-2xl border-2 p-3 transition", f.kind === k.key ? "border-ink bg-cream" : "border-line bg-white hover:border-ink-soft")}>
                      <input type="radio" name="kind" className="sr-only" checked={f.kind === k.key} onChange={() => set("kind", k.key)} />
                      <span className="block font-black">{k.label}</span>
                      <span className="block text-sm text-muted">{k.hint}</span>
                    </label>
                  ))}
                </div>
              </Field>
              {f.kind === "percentage" ? (
                <Field label="Процент отстъпка">
                  <div className="flex max-w-48 items-center rounded-[0.875rem] border-2 border-line bg-white focus-within:border-sky">
                    <input
                      inputMode="numeric"
                      value={f.percent}
                      onChange={(e) => set("percent", e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                      className="w-full min-w-0 bg-transparent px-3.5 py-2.5 text-base outline-none focus-visible:outline-none"
                      aria-label="Процент"
                    />
                    <span className="pr-3.5 font-bold text-muted">%</span>
                  </div>
                </Field>
              ) : f.kind === "fixed_amount" ? (
                <Field label="Сума на отстъпката" hint="Не може да е повече от стойността на продуктите, за които важи.">
                  <div className="max-w-48">
                    <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} aria-label="Сума в евро" />
                  </div>
                </Field>
              ) : (
                <p className="rounded-2xl bg-sky-soft p-3 text-[0.95rem] font-semibold">Доставката става безплатна за всеки начин на доставка, който клиентът избере.</p>
              )}
            </div>
          </Card>

          <Card title="За какво важи">
            <div className="space-y-5">
              <Field label="Отстъпката важи за" group>
                <div className="flex flex-wrap gap-2">
                  {APPLIES_OPTIONS.map((a) => (
                    <button key={a.key} type="button" className="chip" aria-pressed={f.applies === a.key} onClick={() => set("applies", a.key)}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </Field>
              {f.applies === "collections" ? (
                <PickList label="Колекции" items={collections} value={f.collectionIds} onChange={(ids) => set("collectionIds", ids)} />
              ) : f.applies === "products" ? (
                <PickList label="Продукти" items={products} value={f.productIds} onChange={(ids) => set("productIds", ids)} />
              ) : null}
              <Field label="Минимална сума на поръчката" hint="Сумата на цялата количка преди отстъпката. Празно = без минимум. В Румъния се превръща в леи по курса.">
                <div className="max-w-48">
                  <MoneyInput value={f.min} onChange={(v) => set("min", v)} placeholder="без минимум" aria-label="Минимална сума в евро" />
                </div>
              </Field>
            </div>
          </Card>

          <Card title="Срок и ограничения">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Важи от" hint={f.starts_at ? <ClearLink onClick={() => set("starts_at", "")}>Без начална дата</ClearLink> : "Празно = веднага."}>
                <TextInput type="datetime-local" value={f.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
              </Field>
              <Field label="Важи до" hint={f.ends_at ? <ClearLink onClick={() => set("ends_at", "")}>Без крайна дата</ClearLink> : "Празно = без край."}>
                <TextInput type="datetime-local" value={f.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
              </Field>
              <Field label="Най-много поръчки с този код" hint="Празно = без ограничение." className="sm:col-span-2">
                <TextInput
                  inputMode="numeric"
                  value={f.limit}
                  onChange={(e) => set("limit", e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
                  placeholder="без ограничение"
                  className="max-w-48"
                />
              </Field>
            </div>
            <Toggle
              className="mt-5"
              checked={f.once}
              onChange={(v) => set("once", v)}
              label="Веднъж на клиент"
              description="Клиент с имейл, който вече е поръчвал с този код, не може да го използва отново."
            />
            <p className="mt-3 text-sm text-muted">Часовете са българско време.</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Състояние">
            <Toggle checked={f.enabled} onChange={(v) => set("enabled", v)} label={f.enabled ? "Кодът е включен" : "Кодът е изключен"} description="Изключеният код не се приема при поръчка." />
            {stats ? (
              <dl className="mt-5 space-y-2 text-[0.95rem]">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-soft">Сега</dt>
                  <dd className="font-bold">{stats.state.label}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-soft">Използван</dt>
                  <dd className="font-bold">
                    {stats.times_used} {stats.times_used === 1 ? "път" : "пъти"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-soft">Създаден</dt>
                  <dd className="font-bold">{stats.created}</dd>
                </div>
              </dl>
            ) : null}
          </Card>
          <Card title="Как работи">
            <p className="text-[0.95rem] text-ink-soft" aria-live="polite">
              {summary(f)}
            </p>
          </Card>
          <Card title="Бележка" description="Само за вас — клиентите не я виждат.">
            <TextArea rows={3} value={f.note} maxLength={500} onChange={(e) => set("note", e.target.value)} aria-label="Бележка" />
          </Card>
          {id !== null ? (
            <ConfirmButton
              question={`Да изтрием ли кода ${initial.code}? Клиентите вече няма да могат да го използват. Това не може да се отмени.`}
              disabled={deleting}
              onConfirm={() =>
                startDelete(async () => {
                  const r = await deleteDiscountAction(id);
                  if (r.ok) router.push("/admin/otstapki");
                  else window.alert(r.error);
                })
              }
            >
              <Trash2 className="h-4 w-4" /> Изтрий кода
            </ConfirmButton>
          ) : null}
        </div>
      </div>
      <SaveBar dirty={ed.dirty} pending={ed.pending} status={ed.status} onSave={ed.submit} onReset={ed.reset} saveLabel={id === null ? "Създай кода" : undefined} />
    </>
  );
}

function ClearLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="font-bold text-sky hover:underline">
      {children}
    </button>
  );
}
