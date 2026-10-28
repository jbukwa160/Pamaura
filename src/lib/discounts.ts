// Discount codes (admin → Отстъпки). Amounts are in the shop currency (EUR cents).
import { convertAmount, type Market } from "./catalog";
import { getDb, nowIso } from "./db";

export interface DiscountRec {
  id: number;
  code: string;
  kind: "percentage" | "fixed_amount" | "free_shipping";
  value: number;
  min_subtotal: number;
  applies_to: string;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  once_per_customer: number;
  times_used: number;
  combines_with_sales: number;
  enabled: number;
  note: string | null;
  created_at: string;
}

export interface AppliesTo {
  type: "all" | "products" | "collections";
  ids?: number[];
}

export function discountByCode(code: string): DiscountRec | null {
  return (getDb().prepare("SELECT * FROM discounts WHERE code = ?").get(code.trim()) as DiscountRec | undefined) || null;
}

export function listDiscounts(): DiscountRec[] {
  return getDb().prepare("SELECT * FROM discounts ORDER BY created_at DESC").all() as DiscountRec[];
}

export function seedDiscounts() {
  const db = getDb();
  const n = (db.prepare("SELECT COUNT(*) AS n FROM discounts").get() as { n: number }).n;
  if (n > 0) return;
  // From the live announcement bar: "Код: END10 за -10% отстъпка на цялата поръчка (мин. 25€)"
  db.prepare(
    "INSERT INTO discounts(code, kind, value, min_subtotal, applies_to, enabled, note, created_at) VALUES('END10', 'percentage', 10, 2500, '{\"type\":\"all\"}', 1, ?, ?)",
  ).run("Пренесено от обявата в сайта (−10% за поръчки над 25 €)", nowIso());
}

const MSG: Record<string, Record<string, string>> = {
  bg: {
    not_found: "Този код за отстъпка не съществува.",
    disabled: "Този код за отстъпка не е активен.",
    not_started: "Този код за отстъпка още не е активен.",
    expired: "Този код за отстъпка е изтекъл.",
    used_up: "Този код за отстъпка вече е използван максималния брой пъти.",
    once: "Вече сте използвали този код за отстъпка.",
    min: "Кодът важи за поръчки над {{amount}}.",
    no_items: "Кодът не важи за продуктите в количката.",
  },
  ro: {
    not_found: "Acest cod de reducere nu există.",
    disabled: "Acest cod de reducere nu este activ.",
    not_started: "Acest cod de reducere nu este încă activ.",
    expired: "Acest cod de reducere a expirat.",
    used_up: "Acest cod de reducere a fost folosit de numărul maxim de ori.",
    once: "Ați folosit deja acest cod de reducere.",
    min: "Codul este valabil pentru comenzi de peste {{amount}}.",
    no_items: "Codul nu se aplică produselor din coș.",
  },
};

export function discountMessage(locale: string, key: string, amount?: string) {
  return (MSG[locale]?.[key] ?? MSG.bg[key]).replace("{{amount}}", amount ?? "");
}

export interface DiscountLine {
  product_id: number;
  collection_ids: number[];
  line_price: number; // market currency
}

export interface DiscountResult {
  ok: boolean;
  error?: string; // message key
  minAmount?: number; // market cents, for the "min" message
  amount: number; // discount in market cents
  freeShipping: boolean;
  discount?: DiscountRec;
}

/**
 * Validates a code for a cart. `subtotal` is in the market currency; thresholds are converted.
 * `email` checks once-per-customer codes.
 */
export function evaluateDiscount(code: string, lines: DiscountLine[], subtotal: number, market: Market, email?: string | null): DiscountResult {
  const d = discountByCode(code);
  const fail = (error: string, extra: Partial<DiscountResult> = {}): DiscountResult => ({ ok: false, error, amount: 0, freeShipping: false, ...extra });
  if (!d) return fail("not_found");
  if (!d.enabled) return fail("disabled");
  const now = Date.now();
  if (d.starts_at && new Date(d.starts_at).getTime() > now) return fail("not_started");
  if (d.ends_at && new Date(d.ends_at).getTime() < now) return fail("expired");
  if (d.usage_limit !== null && d.times_used >= d.usage_limit) return fail("used_up");
  if (d.once_per_customer && email) {
    const used = getDb().prepare("SELECT 1 FROM orders WHERE discount_code = ? AND email = ? AND status != 'cancelled'").get(d.code, email.trim());
    if (used) return fail("once");
  }
  const applies = JSON.parse(d.applies_to || '{"type":"all"}') as AppliesTo;
  const eligible = lines.filter((l) => applies.type === "all" || (applies.type === "products" && applies.ids?.includes(l.product_id)) || (applies.type === "collections" && l.collection_ids.some((c) => applies.ids?.includes(c))));
  if (!eligible.length) return fail("no_items");
  const eligibleTotal = eligible.reduce((n, l) => n + l.line_price, 0);
  const min = convertAmount(d.min_subtotal, market);
  if (subtotal < min) return fail("min", { minAmount: min });
  let amount = 0;
  if (d.kind === "percentage") amount = Math.round((eligibleTotal * Math.min(100, Math.max(0, d.value))) / 100);
  else if (d.kind === "fixed_amount") amount = Math.min(eligibleTotal, convertAmount(d.value, market));
  return { ok: true, amount, freeShipping: d.kind === "free_shipping", discount: d };
}
