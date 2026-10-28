// Internals shared by the courier adapters: HTTP with timeout, readable errors, the sender, the list cache, search.
import "server-only";
import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "../../db";
import { CARRIERS, type CarrierId, type ShipmentInput } from "./types";

export const HTTP_TIMEOUT_MS = 20000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** What the parcel holds, for the couriers' "contents" field, when the order does not say. */
export const DEFAULT_CONTENTS = "Козметика";

export function contentsOf(input: Pick<ShipmentInput, "contents">): string {
  return str(input.contents) || DEFAULT_CONTENTS;
}

/** The delivery address as one line ("ул. Х 1, вх. А"), as the couriers take it. */
export function addressOf(d: ShipmentInput["delivery"]): string {
  return [str(d.address1), str(d.address2)].filter(Boolean).join(", ");
}

/** Error with a message that can be shown to the shop as is (Bulgarian, includes the courier's own text). */
export class CourierError extends Error {
  constructor(
    public carrier: CarrierId,
    message: string,
    public status?: number,
    public code?: string,
  ) {
    super(message);
    this.name = "CourierError";
  }
}

/** fetch() with a timeout; network failures and timeouts become CourierErrors. */
export async function courierFetch(carrier: CarrierId, url: string, init: RequestInit = {}, timeoutMs = HTTP_TIMEOUT_MS) {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new CourierError(carrier, `${CARRIERS[carrier]} не отговори в рамките на ${Math.round(timeoutMs / 1000)} секунди.`);
    }
    throw new CourierError(carrier, `Няма връзка със сървъра на ${CARRIERS[carrier]} (${(e as Error)?.message ?? e}).`);
  }
}

/** Parse a response body as JSON without throwing (null for empty bodies, the start of the text for non-JSON ones). */
export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Euro amount with two decimals, as couriers expect it. */
export const eur = (n: number) => Math.round(n * 100) / 100;

/**
 * Bulgarian phone number in international format: "0888 123 456" / "00359888123456" / "888123456" → "+359888123456".
 * Foreign numbers starting with "+" or "00" are kept (only separators are removed).
 */
export function phoneBG(phone: string): string {
  const raw = (phone ?? "").trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("+") || digits.startsWith("00")) {
    digits = digits.replace(/^00/, "");
    if (digits.startsWith("3590")) digits = "359" + digits.slice(4);
    return "+" + digits;
  }
  if (digits.startsWith("359") && digits.length >= 11) return "+" + digits.replace(/^3590/, "359");
  if (digits.startsWith("0")) return "+359" + digits.slice(1);
  return "+359" + digits;
}

// ─── Sender (SENDER_* in .env.local) ───

export type Sender = {
  /** Company on the courier contracts. */
  name: string;
  contactName: string;
  phone: string;
  email: string;
  city: string;
  postcode: string;
  address: string;
  /** Offices the parcels are handed in at; empty = the courier picks them up from the address. */
  speedyOfficeId: string;
  econtOfficeCode: string;
};

export function sender(): Sender {
  const env = (key: string) => (process.env[key] ?? "").trim();
  return {
    name: env("SENDER_NAME"),
    contactName: env("SENDER_CONTACT"),
    phone: env("SENDER_PHONE"),
    email: env("SENDER_EMAIL"),
    city: env("SENDER_CITY"),
    postcode: env("SENDER_POSTCODE"),
    address: env("SENDER_ADDRESS"),
    speedyOfficeId: env("SPEEDY_DROPOFF_OFFICE_ID"),
    econtOfficeCode: env("ECONT_DROPOFF_OFFICE_CODE"),
  };
}

// ─── List cache: memory (per server process) + DATA_DIR/courier-cache (survives restarts) ───

type Entry = { at: number; data: unknown };
const g = globalThis as unknown as { __courierMem?: Map<string, Entry>; __courierLoading?: Map<string, Promise<unknown>> };
const mem = (g.__courierMem ??= new Map());
const loading = (g.__courierLoading ??= new Map());

/** After a failed background refresh, keep serving the old copy this long before trying again. */
const RETRY_AFTER_MS = 10 * 60 * 1000;

const cacheFile = (key: string) => path.join(DATA_DIR, "courier-cache", `${key.replace(/[^a-z0-9.-]+/gi, "-")}.json`);

function readFromDisk(key: string): Entry | undefined {
  try {
    const entry = JSON.parse(readFileSync(cacheFile(key), "utf8")) as Entry;
    return typeof entry?.at === "number" ? entry : undefined;
  } catch {
    return undefined;
  }
}

async function writeToDisk(key: string, entry: Entry) {
  const file = cacheFile(key);
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(entry));
    await rename(`${file}.tmp`, file);
  } catch (e) {
    console.error(`[shipping] could not save the ${key} list:`, (e as Error).message);
  }
}

/** Load fresh data and store it. Only one request per key runs at a time, however many people are on the checkout. */
function refresh<T>(key: string, load: () => Promise<T>): Promise<T> {
  let pending = loading.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = load()
      .then(async (data) => {
        const entry = { at: Date.now(), data };
        mem.set(key, entry);
        await writeToDisk(key, entry);
        return data;
      })
      .finally(() => loading.delete(key));
    loading.set(key, pending);
  }
  return pending;
}

/**
 * Cached data for `key`. Fresh (younger than `ttlMs`) data is returned as is; older data is returned right away while
 * a fresh copy loads in the background, so only the very first load ever makes a customer wait.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  let entry = mem.get(key);
  if (!entry) {
    entry = readFromDisk(key);
    if (entry) mem.set(key, entry);
  }
  if (!entry) return refresh(key, load);
  if (Date.now() - entry.at >= ttlMs) {
    const stale = entry;
    refresh(key, load).catch((e) => {
      console.error(`[shipping] refreshing ${key} failed, serving the old copy:`, (e as Error).message);
      mem.set(key, { at: Date.now() - ttlMs + RETRY_AFTER_MS, data: stale.data });
    });
  }
  return entry.data as T;
}

// ─── Search ───

/** Lowercase, "ё" → "е", punctuation used in addresses dropped, whitespace collapsed. */
export function normalizeText(s: string): string {
  return (s ?? "")
    .toLocaleLowerCase("bg-BG")
    .replace(/ё/g, "е")
    .replace(/[„“"'().,;:№#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 0 = exact, 1 = starts with, 2 = a word starts with, 3 = contains, -1 = no match. */
function matchRank(haystack: string, needle: string): number {
  const h = normalizeText(haystack);
  if (h === needle) return 0;
  if (h.startsWith(needle)) return 1;
  if (h.includes(" " + needle)) return 2;
  if (h.includes(needle)) return 3;
  return -1;
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
};

/** Bulgarian → Latin (official system, "ия" at the end of a word → "ia": "София" → "sofia"). */
function transliterate(s: string): string {
  const lower = normalizeText(s).replace(/ия(?=\s|$)/g, "ia");
  let out = "";
  for (const ch of lower) out += TRANSLIT[ch] ?? ch;
  return out;
}

/** Filter by a query over several fields (best match per item), sorted by match quality, else in the original order. */
export function rankBy<T>(items: T[], query: string, fields: (item: T) => (string | undefined)[]): T[] {
  const needle = normalizeText(query);
  if (!needle) return items;
  // Latin queries ("plovdiv", "lyulin") also match Cyrillic names.
  const latin = !/[а-я]/.test(needle);
  const words = needle.split(" ");
  const scored: { item: T; rank: number; i: number }[] = [];
  items.forEach((item, i) => {
    let values = fields(item).filter(Boolean) as string[];
    if (latin) values = values.concat(values.map(transliterate));
    let best = -1;
    for (const v of values) {
      const r = matchRank(v, needle);
      if (r >= 0 && (best < 0 || r < best)) best = r;
    }
    // Several words ("люлин 5", "sofia mall") match when every word is found somewhere.
    if (best < 0 && words.length > 1) {
      const all = normalizeText(values.join(" "));
      if (words.every((w) => all.includes(w))) best = 4;
    }
    if (best >= 0) scored.push({ item, rank: best, i });
  });
  scored.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return scored.map((s) => s.item);
}

/** Cities: exact name first, then towns before villages, otherwise by match quality. */
export function rankCities<T extends { name: string; postcode?: string; nameEn?: string; town?: boolean }>(cities: T[], query: string): T[] {
  const lower = query.trim().toLocaleLowerCase("bg-BG");
  return rankBy(cities, query, (c) => [c.name, c.nameEn, c.postcode])
    .map((c, i) => ({ c, i, exact: c.name.toLocaleLowerCase("bg-BG") === lower ? 0 : 1 }))
    .sort((a, b) => a.exact - b.exact || Number(b.c.town ?? true) - Number(a.c.town ?? true) || a.i - b.i)
    .map(({ c }) => c);
}

/** Office / locker list filtered by city, kind and a search query (shared by every adapter's listOffices). */
export function filterOffices<O extends { cityId?: string; kind: string; name: string; address: string; city: string; postcode?: string; id: string }>(
  offices: O[],
  { cityId, query, kind }: { cityId?: string; query?: string; kind?: "office" | "locker" },
): O[] {
  let out = offices;
  if (cityId) out = out.filter((o) => o.cityId === cityId);
  if (kind) out = out.filter((o) => o.kind === kind);
  if (query?.trim()) out = rankBy(out, query, (o) => [o.name, o.address, o.city, o.postcode, o.id]);
  return out;
}
