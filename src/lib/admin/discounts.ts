// Discount codes in the admin. Only what evaluateDiscount() (src/lib/discounts.ts) checks at the checkout is editable.
import "server-only";
import { getCatalog } from "../catalog";
import { getDb, nowIso } from "../db";
import type { AppliesTo, DiscountRec } from "../discounts";

export type DiscountKind = DiscountRec["kind"];
export const KINDS: DiscountKind[] = ["percentage", "fixed_amount", "free_shipping"];

/** What the editor sends. Amounts in EUR cents, dates as "YYYY-MM-DDTHH:mm" in Sofia time. */
export interface DiscountInput {
  code: string;
  kind: DiscountKind;
  value: number;
  min_subtotal: number;
  applies: "all" | "collections" | "products";
  ids: number[];
  starts_at: string;
  ends_at: string;
  usage_limit: number | null;
  once_per_customer: boolean;
  enabled: boolean;
  note: string;
}

export function discountById(id: number): DiscountRec | null {
  return (getDb().prepare("SELECT * FROM discounts WHERE id = ?").get(id) as DiscountRec | undefined) ?? null;
}

export function parseAppliesTo(json: string | null | undefined): AppliesTo {
  try {
    const v = JSON.parse(json || "") as AppliesTo;
    if (v && (v.type === "products" || v.type === "collections")) return { type: v.type, ids: Array.isArray(v.ids) ? v.ids.map(Number).filter(Number.isFinite) : [] };
  } catch {
    /* fall through */
  }
  return { type: "all" };
}

// ─── Sofia time ↔ ISO ──────────────────────────────────────────────────────────────────────────

const PARTS = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** ISO → "YYYY-MM-DDTHH:mm" in Sofia time (for <input type="datetime-local">). */
export function isoToSofiaLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "YYYY-MM-DDTHH:mm" in Sofia time → ISO. "" → null; an impossible date → undefined. */
export function sofiaLocalToIso(local: string): string | null | undefined {
  if (!local) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return undefined;
  // Sofia is UTC+3 in summer and UTC+2 in winter: take the offset whose result reads back the same
  for (const off of ["+03:00", "+02:00"]) {
    const d = new Date(`${local}:00${off}`);
    if (Number.isNaN(d.getTime())) return undefined;
    if (isoToSofiaLocal(d.toISOString()) === local) return d.toISOString();
  }
  // the hour skipped when the clocks go forward: same day, an hour later
  const d = new Date(`${local}:00+02:00`);
  return !Number.isNaN(d.getTime()) && isoToSofiaLocal(d.toISOString()).slice(0, 10) === local.slice(0, 10) ? d.toISOString() : undefined;
}

// ─── Status and description for the list ──────────────────────────────────────────────────────

export type DiscountState = "active" | "disabled" | "scheduled" | "expired" | "used_up";

export const STATE_LABELS: Record<DiscountState, { label: string; tone: "mint" | "muted" | "sky" | "brand" | "sun" }> = {
  active: { label: "Активен", tone: "mint" },
  disabled: { label: "Изключен", tone: "muted" },
  scheduled: { label: "Предстои", tone: "sky" },
  expired: { label: "Изтекъл", tone: "brand" },
  used_up: { label: "Изчерпан", tone: "sun" },
};

/** The same checks, in the same order, as evaluateDiscount(). */
export function discountState(d: DiscountRec, now = Date.now()): DiscountState {
  if (!d.enabled) return "disabled";
  if (d.starts_at && new Date(d.starts_at).getTime() > now) return "scheduled";
  if (d.ends_at && new Date(d.ends_at).getTime() < now) return "expired";
  if (d.usage_limit !== null && d.times_used >= d.usage_limit) return "used_up";
  return "active";
}

/** "Колекции: Face Cream, Body Butter" */
export function appliesText(a: AppliesTo): string {
  if (a.type === "all") return "Цялата поръчка";
  const cat = getCatalog();
  const names = (a.ids ?? []).map((id) => (a.type === "products" ? cat.productById.get(id)?.title : cat.collectionById.get(id)?.title)).filter(Boolean) as string[];
  const label = a.type === "products" ? "Продукти" : "Колекции";
  if (!names.length) return `${label}: (няма избрани)`;
  return `${label}: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` и още ${names.length - 3}` : ""}`;
}

// ─── Saving ───────────────────────────────────────────────────────────────────────────────────

export function codeTaken(code: string, exceptId: number | null): boolean {
  // the column is COLLATE NOCASE: "end10" and "END10" are the same code
  return Boolean(getDb().prepare("SELECT 1 FROM discounts WHERE code = ? AND id != ?").get(code, exceptId ?? -1));
}

/** Inserts or updates; times_used, combines_with_sales and created_at are never touched here. */
export function saveDiscount(id: number | null, d: Omit<DiscountRec, "id" | "times_used" | "combines_with_sales" | "created_at">): number {
  const db = getDb();
  const args = [d.code, d.kind, d.value, d.min_subtotal, d.applies_to, d.starts_at, d.ends_at, d.usage_limit, d.once_per_customer, d.enabled, d.note];
  if (id) {
    db.prepare(
      "UPDATE discounts SET code = ?, kind = ?, value = ?, min_subtotal = ?, applies_to = ?, starts_at = ?, ends_at = ?, usage_limit = ?, once_per_customer = ?, enabled = ?, note = ? WHERE id = ?",
    ).run(...args, id);
    return id;
  }
  const info = db
    .prepare(
      "INSERT INTO discounts(code, kind, value, min_subtotal, applies_to, starts_at, ends_at, usage_limit, once_per_customer, enabled, note, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(...args, nowIso());
  return Number(info.lastInsertRowid);
}
