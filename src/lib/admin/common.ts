// Helpers shared by the admin pages and actions (server side).
import "server-only";
import { getCatalog, type Market } from "../catalog";
import { bumpCatalogVersion, getDb } from "../db";
import { formatMoney } from "../money";

/** The Romanian translation of a resource field ("" when there is none). */
export function getTranslation(ownerType: string, ownerId: string | number, field: string, locale = "ro"): string {
  const row = getDb().prepare("SELECT value FROM translations WHERE locale = ? AND owner_type = ? AND owner_id = ? AND field = ?").get(locale, ownerType, String(ownerId), field) as
    | { value: string }
    | undefined;
  return row?.value ?? "";
}

/** All translated fields of a resource: { title: "…", body_html: "…" }. */
export function getTranslations(ownerType: string, ownerId: string | number, locale = "ro"): Record<string, string> {
  const rows = getDb().prepare("SELECT field, value FROM translations WHERE locale = ? AND owner_type = ? AND owner_id = ?").all(locale, ownerType, String(ownerId)) as {
    field: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.field, r.value]));
}

/** Saves (or with an empty value removes) a translation. Call bumpCatalogVersion() after a batch. */
export function setTranslation(ownerType: string, ownerId: string | number, field: string, value: string, locale = "ro") {
  const db = getDb();
  if (value.trim()) {
    db.prepare("INSERT OR REPLACE INTO translations(locale, owner_type, owner_id, field, value) VALUES(?, ?, ?, ?, ?)").run(locale, ownerType, String(ownerId), field, value);
  } else {
    db.prepare("DELETE FROM translations WHERE locale = ? AND owner_type = ? AND owner_id = ? AND field = ?").run(locale, ownerType, String(ownerId), field);
  }
}

/** The storefront re-reads the catalog after this. */
export function catalogChanged() {
  bumpCatalogVersion();
}

export function marketOf(handle: string): Market {
  const cat = getCatalog();
  return cat.markets.find((m) => m.handle === handle) || cat.markets[0];
}

/** Amount in a market's currency, as the shop shows it. */
export function money(cents: number, marketHandle = "bg"): string {
  return formatMoney(cents, marketOf(marketHandle).money_format);
}

const DATE = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "2-digit", month: "2-digit", year: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE.format(d);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE_TIME.format(d).replace(",", "");
}

/** "YYYY-MM-DD" of a moment in Sofia time. */
export function sofiaDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Safe value for LIKE ? queries. */
export function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}
