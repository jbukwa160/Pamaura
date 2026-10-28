// Products in the admin: list, editor data, saving (variants, pictures, metafields, translations), create, delete.
// Shapes follow lib/catalog.ts: products.options JSON, variants option1-3, media.id / image_id / position,
// translations "product:<id>:<field>" (option_name.<i>, option_value.<i>.<value>) and
// "metafield:<owner>.<id>.custom.<key>:value".
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getCatalog } from "../catalog";
import { getDb, nowIso } from "../db";
import { THEME_DIR } from "../liquid/theme";
import { handleize } from "../liquid/drops/catalog";
import { catalogChanged, getTranslations, setTranslation } from "./common";
import { fileUrl } from "./uploads";
import {
  DEFAULT_OPTION,
  DEFAULT_VALUE,
  centsText,
  gidList,
  parseCents,
  parseWhole,
  productGid,
  type MediaForm,
  type MetafieldForm,
  type MetafieldKind,
  type PickerProduct,
  type ProductForm,
  type RonMarket,
  type VariantForm,
} from "@/components/admin/products/types";
import type { BgRo } from "@/components/admin/ui";

/** A problem with what was entered; the message is shown to the shop owner. */
export class FormError extends Error {}

const MAX_PRICE = 10_000_000; // 100 000,00 €
const MAX_STOCK = 1_000_000;

// ---------------------------------------------------------------------------------------------
// Small helpers

/** One line of text: trimmed, without line breaks, at most `max` characters. */
export function line(v: unknown, max = 255): string {
  return String(v ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, max);
}

/** Longer text / HTML, kept as typed. */
export function longText(v: unknown, max: number, label: string): string {
  const s = String(v ?? "");
  if (s.length > max) throw new FormError(`${label} е твърде дълъг (до ${max.toLocaleString("bg-BG")} знака).`);
  return s;
}

export function bgRo(v: unknown, max = 255): BgRo {
  const o = (v ?? {}) as Partial<BgRo>;
  return { bg: line(o.bg, max), ro: line(o.ro, max) };
}

/** Like bgRo, but spaces around the text are kept (SEO texts are stored as typed; only blank becomes ""). */
export function bgRoAsTyped(v: unknown, max: number): BgRo {
  const o = (v ?? {}) as Partial<BgRo>;
  const one = (x: unknown) => {
    const s = String(x ?? "").replace(/[\r\n\t]+/g, " ").slice(0, max);
    return s.trim() ? s : "";
  };
  return { bg: one(o.bg), ro: one(o.ro) };
}

function fileExists(key: string): { width: number | null; height: number | null; mime: string } | null {
  return (getDb().prepare("SELECT width, height, mime FROM files WHERE name = ?").get(key) as { width: number | null; height: number | null; mime: string } | undefined) ?? null;
}

/** Largest id among the given queries + 1 (ids of deleted rows that old orders / reviews still name are skipped). */
function nextId(queries: string[]): number {
  const db = getDb();
  let max = 0;
  for (const q of queries) {
    const r = db.prepare(q).get() as { m: number | null } | undefined;
    if (r?.m && Number(r.m) > max) max = Number(r.m);
  }
  return max + 1;
}
const nextProductId = () => nextId(["SELECT MAX(id) AS m FROM products", "SELECT MAX(product_id) AS m FROM order_lines", "SELECT MAX(product_id) AS m FROM reviews"]);
const nextVariantId = () => nextId(["SELECT MAX(id) AS m FROM variants", "SELECT MAX(variant_id) AS m FROM order_lines"]);
const nextMediaId = () => nextId(["SELECT MAX(id) AS m FROM media"]);
const nextImageId = () => nextId(["SELECT MAX(image_id) AS m FROM media", "SELECT MAX(image_id) AS m FROM variants"]);

/** Theme templates for a resource ("" = the default template). */
export function themeTemplates(kind: "product" | "collection"): string[] {
  try {
    const re = new RegExp(`^${kind}\\.([\\w-]+)\\.(json|liquid)$`);
    return [
      ...new Set(
        fs
          .readdirSync(path.join(THEME_DIR, "templates"))
          .map((f) => f.match(re)?.[1])
          .filter((x): x is string => !!x),
      ),
    ].sort();
  } catch {
    return [];
  }
}

/** The Romanian market (for RON previews), or null when it is switched off. */
export function ronMarket(): RonMarket | null {
  const m = getCatalog().markets.find((x) => x.handle === "ro" && x.enabled);
  return m ? { rate: m.rate, rounding: m.rounding, format: m.money_format } : null;
}

/** Products for pickers, A–Z. */
export function pickerProducts(): PickerProduct[] {
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.title, p.handle, p.status, p.published_at,
        (SELECT m.file FROM media m WHERE m.product_id = p.id ORDER BY m.position LIMIT 1) AS file
       FROM products p ORDER BY p.title COLLATE NOCASE`,
    )
    .all() as { id: number; title: string; handle: string; status: string; published_at: string | null; file: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    handle: r.handle,
    status: r.status,
    visible: r.status === "active" && !!r.published_at,
    thumb: fileUrl(r.file, 120),
  }));
}

// ---------------------------------------------------------------------------------------------
// List

export interface ProductListRow {
  id: number;
  handle: string;
  title: string;
  status: string;
  visible: boolean;
  thumb: string;
  priceMin: number | null;
  priceMax: number | null;
  variants: number;
  /** null when no variant tracks stock */
  stock: number | null;
  hasRo: boolean;
}

export function listProducts(opts: { q?: string; status?: string }): { rows: ProductListRow[]; counts: Record<string, number> } {
  const all = getDb()
    .prepare(
      `SELECT p.id, p.handle, p.title, p.status, p.published_at,
        (SELECT m.file FROM media m WHERE m.product_id = p.id ORDER BY m.position LIMIT 1) AS file,
        (SELECT MIN(v.price) FROM variants v WHERE v.product_id = p.id) AS pmin,
        (SELECT MAX(v.price) FROM variants v WHERE v.product_id = p.id) AS pmax,
        (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id) AS nv,
        (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id AND v.inventory_management IS NOT NULL) AS ntracked,
        (SELECT SUM(v.inventory_quantity) FROM variants v WHERE v.product_id = p.id AND v.inventory_management IS NOT NULL) AS stock,
        (SELECT group_concat(v.sku, ' ') FROM variants v WHERE v.product_id = p.id) AS skus,
        (SELECT t.value FROM translations t WHERE t.locale = 'ro' AND t.owner_type = 'product' AND t.owner_id = CAST(p.id AS TEXT) AND t.field = 'title') AS title_ro
       FROM products p ORDER BY p.created_at DESC, p.id DESC`,
    )
    .all() as {
    id: number;
    handle: string;
    title: string;
    status: string;
    published_at: string | null;
    file: string | null;
    pmin: number | null;
    pmax: number | null;
    nv: number;
    ntracked: number;
    stock: number | null;
    skus: string | null;
    title_ro: string | null;
  }[];
  const counts: Record<string, number> = { all: all.length, active: 0, draft: 0, archived: 0 };
  for (const r of all) counts[r.status] = (counts[r.status] || 0) + 1;
  // filtered here, not with SQL LIKE: SQLite only folds the case of Latin letters
  const q = (opts.q || "").trim().toLocaleLowerCase("bg").slice(0, 200);
  const rows = all.filter(
    (r) =>
      (!opts.status || opts.status === "all" || r.status === opts.status) &&
      (!q || [r.title, r.handle, r.skus || "", r.title_ro || ""].some((s) => s.toLocaleLowerCase("bg").includes(q))),
  );
  return {
    counts,
    rows: rows.map((r) => ({
      id: r.id,
      handle: r.handle,
      title: r.title,
      status: r.status,
      visible: r.status === "active" && !!r.published_at,
      thumb: fileUrl(r.file, 120),
      priceMin: r.pmin,
      priceMax: r.pmax,
      variants: r.nv,
      stock: r.ntracked ? Number(r.stock || 0) : null,
      hasRo: !!r.title_ro?.trim(),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Metafields (custom.*), shared with collections

const KIND: Record<string, MetafieldKind> = {
  single_line_text_field: "text",
  multi_line_text_field: "multiline",
  rich_text_field: "rich",
  file_reference: "file",
  "list.product_reference": "products",
};

/** Labels for the shop's own metafields; others show their key. */
const MF_INFO: Record<string, { label: string; hint?: string; order: number }> = {
  "product.product_text": { label: "Кратък текст в картата на продукта", hint: "Показва се под името в списъците с продукти.", order: 1 },
  "product.collapsible_tab_why_": { label: "Раздел „Защо ще го заобичаш“", order: 10 },
  "product.collapsible_tab_ingredients_": { label: "Раздел „Основни съставки“", order: 11 },
  "product.collapsible_tab_how_to_": { label: "Раздел „Как се използва“", order: 12 },
  "product.product_rich_text_1_title": { label: "Блок „Текст и снимка“ — заглавие", order: 20 },
  "product.product_rich_text_1_description": { label: "Блок „Текст и снимка“ — текст", order: 21 },
  "product.product_rich_text_1_image_": { label: "Блок „Текст и снимка“ — снимка", order: 22 },
  "product.product_icon_1_image": { label: "Икона 1 — картинка", order: 30 },
  "product.product_icon_1_label": { label: "Икона 1 — надпис", order: 31 },
  "product.product_icon_2_image": { label: "Икона 2 — картинка", order: 32 },
  "product.product_icon_2_label": { label: "Икона 2 — надпис", order: 33 },
  "product.product_icon_3_image": { label: "Икона 3 — картинка", order: 34 },
  "product.product_icon_3_label": { label: "Икона 3 — надпис", order: 35 },
  "product.upsells": { label: "Предлагани продукти в количката", hint: "Предлагат се в количката, когато този продукт е добавен в нея.", order: 40 },
  "product.upsell_popup_variants": { label: "Изскачащ прозорец с предложения", order: 50 },
  "collection.mobile_collection_banner_image": { label: "Банер за телефон", hint: "Снимка в горната част на колекцията на мобилни устройства.", order: 1 },
};

const TEXT_KINDS = new Set<MetafieldKind>(["text", "multiline", "rich"]);

/** A readable line for a value the admin only shows (e.g. the upsell popup: its title and offered products). */
function describeReadonly(type: string, value: string): string {
  if (type !== "metaobject_reference") return "";
  const db = getDb();
  const moFields = (gid: string): Record<string, { type: string; value: string }> | null => {
    const id = Number(String(gid).match(/(\d+)$/)?.[1]);
    const row = id ? (db.prepare("SELECT fields FROM metaobjects WHERE id = ?").get(id) as { fields: string } | undefined) : undefined;
    return row ? parseJson<Record<string, { type: string; value: string }>>(row.fields, {}) : null;
  };
  const top = moFields(value);
  if (!top) return "";
  const texts: string[] = [];
  const offers: string[] = [];
  const variant = (gid: string) => {
    const id = Number(String(gid).match(/(\d+)$/)?.[1]);
    const v = id
      ? (db.prepare("SELECT v.title, p.title AS product FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?").get(id) as { title: string; product: string } | undefined)
      : undefined;
    if (v) offers.push(v.title === DEFAULT_VALUE ? v.product : `${v.product} (${v.title})`);
  };
  for (const f of Object.values(top)) {
    if (f.type === "single_line_text_field" && f.value.trim()) texts.push(`„${f.value.trim()}“`);
    else if (f.type === "variant_reference") variant(f.value);
    else if (f.type === "list.metaobject_reference") {
      for (const g of parseJson<string[]>(f.value, []).slice(0, 20)) {
        for (const inner of Object.values(moFields(g) ?? {})) if (inner.type === "variant_reference") variant(inner.value);
      }
    }
  }
  return [texts.join(", "), offers.length ? `предлага: ${offers.join(", ")}` : ""].filter(Boolean).join(" — ");
}
const metafieldOwnerId = (ownerType: string, ownerId: number, key: string) => `${ownerType}.${ownerId}.custom.${key}`;

/**
 * The custom.* metafields of a product / collection: every key that some resource of that kind has (so a new product
 * can fill them too), with this resource's values. Types the admin cannot edit are only listed when set.
 */
export function metafieldForms(ownerType: "product" | "collection", ownerId: number): MetafieldForm[] {
  const db = getDb();
  const defs = db.prepare("SELECT key, MIN(type) AS type FROM metafields WHERE owner_type = ? AND namespace = 'custom' GROUP BY key").all(ownerType) as { key: string; type: string }[];
  const own = new Map(
    (db.prepare("SELECT key, type, value FROM metafields WHERE owner_type = ? AND owner_id = ? AND namespace = 'custom'").all(ownerType, ownerId) as { key: string; type: string; value: string }[]).map(
      (r) => [r.key, r],
    ),
  );
  const out: (MetafieldForm & { order: number })[] = [];
  for (const d of defs) {
    const row = own.get(d.key);
    const type = row?.type ?? d.type;
    const kind = KIND[type] ?? "readonly";
    if (kind === "readonly" && !row) continue;
    const value = row?.value ?? "";
    const info = MF_INFO[`${ownerType}.${d.key}`];
    out.push({
      key: d.key,
      type,
      kind,
      label: info?.label ?? d.key,
      hint: kind === "readonly" ? describeReadonly(type, value) : (info?.hint ?? ""),
      value,
      ro: TEXT_KINDS.has(kind) && row ? getTranslations("metafield", metafieldOwnerId(ownerType, ownerId, d.key))["value"] ?? "" : "",
      url: kind === "file" && value ? fileUrl(value, 300) : "",
      order: info?.order ?? 1000,
    });
  }
  out.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  return out.map((f) => ({ key: f.key, type: f.type, kind: f.kind, label: f.label, hint: f.hint, value: f.value, ro: f.ro, url: f.url }));
}

/** Saves edited metafields. Unchanged ones are left exactly as they are; an emptied one is removed. */
export function saveMetafieldForms(ownerType: "product" | "collection", ownerId: number, input: unknown) {
  if (!Array.isArray(input)) return;
  const db = getDb();
  const current = new Map(metafieldForms(ownerType, ownerId).map((f) => [f.key, f]));
  const seen = new Set<string>();
  for (const raw of input.slice(0, 200) as Partial<MetafieldForm>[]) {
    const key = String(raw?.key ?? "");
    const def = current.get(key);
    if (!def || def.kind === "readonly" || seen.has(key)) continue;
    seen.add(key);
    const rawValue = String(raw.value ?? "");
    const rawRo = String(raw.ro ?? "");
    if (rawValue === def.value && (!TEXT_KINDS.has(def.kind) || rawRo === def.ro)) continue;
    let value = rawValue;
    let ro = "";
    switch (def.kind) {
      case "text":
        value = line(rawValue, 5000);
        ro = line(rawRo, 5000);
        break;
      case "multiline":
        value = longText(rawValue, 50_000, def.label).trim();
        ro = longText(rawRo, 50_000, def.label).trim();
        break;
      case "rich":
        value = longText(rawValue, 200_000, def.label).trim();
        ro = longText(rawRo, 200_000, def.label).trim();
        break;
      case "file":
        value = line(rawValue, 500);
        if (value && !fileExists(value)) throw new FormError(`${def.label}: снимката не е намерена. Качете я отново.`);
        break;
      case "products": {
        const ids = [...new Set(gidList(rawValue))].filter((id) => id !== (ownerType === "product" ? ownerId : -1)).slice(0, 50);
        const exists = db.prepare("SELECT 1 FROM products WHERE id = ?");
        const ok = ids.filter((id) => exists.get(id));
        value = ok.length ? JSON.stringify(ok.map(productGid)) : "";
        break;
      }
    }
    const tid = metafieldOwnerId(ownerType, ownerId, key);
    if (value.trim()) {
      db.prepare(
        "INSERT INTO metafields(owner_type, owner_id, namespace, key, type, value) VALUES(?, ?, 'custom', ?, ?, ?) ON CONFLICT(owner_type, owner_id, namespace, key) DO UPDATE SET type = excluded.type, value = excluded.value",
      ).run(ownerType, ownerId, key, def.type, value);
      if (TEXT_KINDS.has(def.kind)) setTranslation("metafield", tid, "value", ro);
    } else {
      db.prepare("DELETE FROM metafields WHERE owner_type = ? AND owner_id = ? AND namespace = 'custom' AND key = ?").run(ownerType, ownerId, key);
      setTranslation("metafield", tid, "value", "");
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Editor

interface ProductRec {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string;
  template_suffix: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  seo_title: string | null;
  seo_description: string | null;
  options: string;
}
interface VariantRec {
  id: number;
  position: number;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  sku: string;
  barcode: string;
  price: number;
  compare_at_price: number | null;
  inventory_management: string | null;
  inventory_policy: string;
  inventory_quantity: number;
  weight: number;
  image_id: number | null;
}
interface MediaRec {
  id: number;
  image_id: number | null;
  position: number;
  media_type: string;
  alt: string | null;
  file: string | null;
  variant_ids: string;
}

const parseJson = <T>(s: string | null | undefined, d: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : d;
  } catch {
    return d;
  }
};

export interface ProductEditorData {
  id: number;
  form: ProductForm;
  createdAt: string;
  updatedAt: string;
  visible: boolean;
  /** explicit RON prices per variant id (otherwise converted with the market rate) */
  fixedRon: Record<number, { price: number; compare_at_price: number | null }>;
}

export function productEditorData(id: number): ProductEditorData | null {
  const db = getDb();
  const p = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRec | undefined;
  if (!p) return null;
  const t = getTranslations("product", id);
  const options = parseJson<{ name: string; values: string[] }[]>(p.options, []);
  const variants = db.prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY position, id").all(id) as VariantRec[];
  const media = db.prepare("SELECT * FROM media WHERE product_id = ? ORDER BY position, id").all(id) as MediaRec[];
  const fixedRon: ProductEditorData["fixedRon"] = {};
  for (const r of db
    .prepare("SELECT mp.variant_id, mp.price, mp.compare_at_price FROM variant_market_prices mp JOIN variants v ON v.id = mp.variant_id WHERE v.product_id = ? AND mp.market = 'ro'")
    .all(id) as { variant_id: number; price: number; compare_at_price: number | null }[]) {
    fixedRon[r.variant_id] = { price: r.price, compare_at_price: r.compare_at_price };
  }
  const opt = (v: VariantRec, i: number) => (i === 0 ? v.option1 : i === 1 ? v.option2 : v.option3) ?? "";
  const form: ProductForm = {
    title: { bg: p.title, ro: t.title ?? "" },
    body: { bg: p.body_html, ro: t.body_html ?? "" },
    status: p.status,
    vendor: p.vendor,
    productType: { bg: p.product_type, ro: t.product_type ?? "" },
    tags: parseJson<string[]>(p.tags, []),
    templateSuffix: p.template_suffix ?? "",
    handle: p.handle,
    seoTitle: { bg: p.seo_title ?? "", ro: t.seo_title ?? "" },
    seoDescription: { bg: p.seo_description ?? "", ro: t.seo_description ?? "" },
    options: options.map((o, i) => ({ bg: o.name, ro: t[`option_name.${i}`] ?? "" })),
    variants: variants.map(
      (v): VariantForm => ({
        id: v.id,
        key: `v${v.id}`,
        values: options.map((_, i) => ({ bg: opt(v, i), ro: t[`option_value.${i}.${opt(v, i)}`] ?? "" })),
        price: centsText(v.price),
        compareAt: centsText(v.compare_at_price),
        sku: v.sku,
        barcode: v.barcode,
        track: !!v.inventory_management,
        qty: String(v.inventory_quantity),
        qty0: v.inventory_quantity,
        continueSelling: v.inventory_policy === "continue",
        weight: String(v.weight),
      }),
    ),
    media: media.map((m): MediaForm => ({ id: m.id, key: `m${m.id}`, type: m.media_type, file: m.file ?? "", url: fileUrl(m.file, 400), alt: m.alt ?? "" })),
    metafields: metafieldForms("product", id),
  };
  return { id, form, createdAt: p.created_at, updatedAt: p.updated_at, visible: p.status === "active" && !!p.published_at, fixedRon };
}

/** Normalised tags: trimmed, no commas, no duplicates (case-insensitive), at most 250. */
function cleanTags(input: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of Array.isArray(input) ? input.slice(0, 500) : []) {
    const tag = line(String(t).replace(/,/g, " "), 255);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out.slice(0, 250);
}

/** A handle typed by the owner, Shopify style. */
function cleanHandle(input: unknown): string {
  return handleize(line(input, 255)).slice(0, 255).replace(/-+$/, "");
}

/** Records a redirect from an old address and repoints redirects that went to it. */
export function addRedirect(from: string, to: string) {
  const db = getDb();
  db.prepare("DELETE FROM redirects WHERE path = ?").run(to);
  db.prepare("UPDATE redirects SET target = ? WHERE target = ?").run(to, from);
  db.prepare("INSERT OR REPLACE INTO redirects(path, target) VALUES(?, ?)").run(from, to);
}

interface CleanVariant {
  id: number | null;
  values: BgRo[];
  price: number;
  compare: number | null;
  sku: string;
  barcode: string;
  track: boolean;
  qty: number;
  qtyChanged: boolean;
  continueSelling: boolean;
  weight: number;
}

/** Validates and saves the whole editor; returns the fresh editor state (new rows get their ids). */
export function saveProduct(id: number, input: ProductForm): ProductForm {
  const db = getDb();
  const p = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRec | undefined;
  if (!p) throw new FormError("Продуктът не съществува (може би е изтрит).");
  if (!input || typeof input !== "object") throw new FormError("Невалидни данни.");

  // ---- basics
  const title = bgRo(input.title);
  if (!title.bg) throw new FormError("Въведете заглавие на продукта.");
  const body = { bg: longText(input.body?.bg, 200_000, "Описанието"), ro: longText(input.body?.ro, 200_000, "Описанието (RO)") };
  if (!["active", "draft", "archived"].includes(String(input.status))) throw new FormError("Изберете статус.");
  const status = String(input.status);
  const vendor = line(input.vendor);
  const productType = bgRo(input.productType);
  const tags = cleanTags(input.tags);
  const suffix = line(input.templateSuffix, 100);
  if (suffix && suffix !== p.template_suffix && !themeTemplates("product").includes(suffix)) throw new FormError("Избраният шаблон не съществува в темата.");
  // an unchanged address is kept exactly as stored (imported handles are not re-normalised)
  const handle = String(input.handle ?? "") === p.handle ? p.handle : cleanHandle(input.handle);
  if (!handle) throw new FormError("Адресът (URL) на продукта не може да е празен.");
  if (handle !== p.handle && db.prepare("SELECT 1 FROM products WHERE handle = ? AND id != ?").get(handle, id)) {
    throw new FormError(`Друг продукт вече използва адреса „${handle}“. Изберете друг.`);
  }
  const seoTitle = bgRoAsTyped(input.seoTitle, 255);
  const seoDescription = bgRoAsTyped(input.seoDescription, 1000);

  // ---- options and variants
  const variantsIn = Array.isArray(input.variants) ? (input.variants as VariantForm[]) : [];
  if (!variantsIn.length) throw new FormError("Продуктът трябва да има поне един вариант.");
  if (variantsIn.length > 100) throw new FormError("Продуктът може да има най-много 100 варианта.");
  let options = (Array.isArray(input.options) ? input.options.slice(0, 3) : []).map((o) => bgRo(o));
  const defaultOnly = !options.length || (options.length === 1 && options[0].bg === DEFAULT_OPTION && variantsIn.length === 1 && line(variantsIn[0]?.values?.[0]?.bg) === DEFAULT_VALUE);
  if (!options.length) {
    if (variantsIn.length > 1) throw new FormError("Добавете опция (напр. „Брой“), за да има продуктът няколко варианта.");
    options = [{ bg: DEFAULT_OPTION, ro: "" }];
  }
  options.forEach((o, i) => {
    if (!o.bg) throw new FormError(`Въведете име на опция ${i + 1} (напр. „Брой“ или „Размер“).`);
  });
  if (new Set(options.map((o) => o.bg.toLowerCase())).size !== options.length) throw new FormError("Две опции имат едно и също име.");

  const existingVariants = new Map((db.prepare("SELECT * FROM variants WHERE product_id = ?").all(id) as VariantRec[]).map((v) => [v.id, v]));
  const seenIds = new Set<number>();
  const variants: CleanVariant[] = variantsIn.map((v, i) => {
    const label = variantsIn.length > 1 ? `Вариант ${i + 1}: ` : "";
    const vid = v?.id == null ? null : Number(v.id);
    if (vid !== null && (!existingVariants.has(vid) || seenIds.has(vid))) throw new FormError(`${label}вариантът не е намерен. Презаредете страницата.`);
    if (vid !== null) seenIds.add(vid);
    const values = defaultOnly ? [{ bg: DEFAULT_VALUE, ro: line(v?.values?.[0]?.ro) }] : options.map((_, oi) => bgRo(v?.values?.[oi]));
    if (values.some((x) => !x.bg)) throw new FormError(`${label}попълнете стойност за всяка опция.`);
    const price = parseCents(String(v?.price ?? ""));
    if (price === null || Number.isNaN(price)) throw new FormError(`${label}въведете валидна цена (напр. 12,99).`);
    const compare = parseCents(String(v?.compareAt ?? ""));
    if (Number.isNaN(compare)) throw new FormError(`${label}въведете валидна стара цена (напр. 15,99) или оставете полето празно.`);
    if (price > MAX_PRICE || (compare ?? 0) > MAX_PRICE) throw new FormError(`${label}цената е твърде голяма.`);
    const qtyIn = parseWhole(String(v?.qty ?? ""), true);
    if (Number.isNaN(qtyIn) || Math.abs(qtyIn ?? 0) > MAX_STOCK) throw new FormError(`${label}наличността трябва да е цяло число бройки.`);
    const weight = parseWhole(String(v?.weight ?? ""));
    if (Number.isNaN(weight) || (weight ?? 0) > 1_000_000) throw new FormError(`${label}теглото трябва да е цяло число грамове.`);
    const old = vid !== null ? existingVariants.get(vid)! : null;
    const qty = qtyIn ?? 0;
    return {
      id: vid,
      values,
      price,
      compare: compare ? compare : null,
      sku: line(v?.sku),
      barcode: line(v?.barcode),
      track: !!v?.track,
      qty,
      // stock is written only when it was changed in the editor: orders change it meanwhile
      qtyChanged: !old || qty !== (typeof v?.qty0 === "number" ? v.qty0 : old.inventory_quantity),
      continueSelling: !!v?.continueSelling,
      weight: weight ?? 0,
    };
  });
  const combos = new Map<string, number>();
  variants.forEach((v, i) => {
    const k = v.values.map((x) => x.bg.toLowerCase()).join("\u0000");
    if (combos.has(k)) throw new FormError(`Варианти ${combos.get(k)! + 1} и ${i + 1} имат еднакви стойности на опциите.`);
    combos.set(k, i);
  });

  // ---- pictures
  const existingMedia = new Map((db.prepare("SELECT * FROM media WHERE product_id = ?").all(id) as MediaRec[]).map((m) => [m.id, m]));
  const mediaIn = Array.isArray(input.media) ? (input.media as MediaForm[]).slice(0, 250) : [];
  type CleanMedia = { id: number | null; file: string; alt: string; width: number | null; height: number | null };
  const media: CleanMedia[] = [];
  const keptMedia = new Set<number>();
  for (const m of mediaIn) {
    const mid = m?.id == null ? null : Number(m.id);
    if (mid !== null) {
      const old = existingMedia.get(mid);
      if (!old || keptMedia.has(mid)) continue;
      keptMedia.add(mid);
      media.push({ id: mid, file: old.file ?? "", alt: old.media_type === "image" ? line(m.alt, 512) : (old.alt ?? ""), width: null, height: null });
    } else {
      const file = line(m?.file, 500);
      const f = file ? fileExists(file) : null;
      if (!f || !f.mime.startsWith("image/")) throw new FormError("Една от новите снимки не е намерена. Качете я отново.");
      media.push({ id: null, file, alt: line(m?.alt, 512), width: f.width, height: f.height });
    }
  }
  // videos are not managed here: never dropped
  for (const m of existingMedia.values()) {
    if (m.media_type !== "image" && !keptMedia.has(m.id)) {
      keptMedia.add(m.id);
      media.push({ id: m.id, file: m.file ?? "", alt: m.alt ?? "", width: null, height: null });
    }
  }

  // ---- write
  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE products SET handle = ?, title = ?, body_html = ?, vendor = ?, product_type = ?, tags = ?, template_suffix = ?, status = ?,
        published_at = CASE WHEN ? = 'active' AND published_at IS NULL THEN ? ELSE published_at END,
        updated_at = ?, seo_title = ?, seo_description = ?, options = ? WHERE id = ?`,
    ).run(
      handle,
      title.bg,
      body.bg,
      vendor,
      productType.bg,
      JSON.stringify(tags),
      suffix || null,
      status,
      status,
      now,
      now,
      seoTitle.bg || null,
      seoDescription.bg || null,
      JSON.stringify(
        options.map((o, oi) => ({ name: o.bg, values: [...new Set(variants.map((v) => v.values[oi].bg))] })),
      ),
      id,
    );
    if (handle !== p.handle) addRedirect(`/products/${p.handle}`, `/products/${handle}`);

    setTranslation("product", id, "title", title.ro);
    setTranslation("product", id, "body_html", body.ro.trim() ? body.ro : "");
    setTranslation("product", id, "product_type", productType.ro);
    setTranslation("product", id, "seo_title", seoTitle.ro);
    setTranslation("product", id, "seo_description", seoDescription.ro);
    // option names / values: rewritten (the value keys change with the Bulgarian text)
    db.prepare("DELETE FROM translations WHERE locale = 'ro' AND owner_type = 'product' AND owner_id = ? AND (field LIKE 'option\\_name.%' ESCAPE '\\' OR field LIKE 'option\\_value.%' ESCAPE '\\')").run(
      String(id),
    );
    options.forEach((o, oi) => {
      setTranslation("product", id, `option_name.${oi}`, o.ro);
      const done = new Set<string>();
      for (const v of variants) {
        const val = v.values[oi];
        if (done.has(val.bg) || !val.ro) continue;
        done.add(val.bg);
        setTranslation("product", id, `option_value.${oi}.${val.bg}`, val.ro);
      }
    });

    // variants
    const removed = [...existingVariants.keys()].filter((vid) => !seenIds.has(vid));
    for (const vid of removed) {
      db.prepare("DELETE FROM variants WHERE id = ? AND product_id = ?").run(vid, id);
      deleteVariantData(vid);
    }
    let newVariantId = nextVariantId();
    variants.forEach((v, i) => {
      const o = [v.values[0]?.bg ?? null, v.values[1]?.bg ?? null, v.values[2]?.bg ?? null];
      const vtitle = v.values.map((x) => x.bg).join(" / ");
      const mgmt = v.track ? "shopify" : null;
      const policy = v.continueSelling ? "continue" : "deny";
      if (v.id === null) {
        db.prepare(
          `INSERT INTO variants(id, product_id, position, title, option1, option2, option3, sku, barcode, price, compare_at_price, inventory_management,
            inventory_policy, inventory_quantity, requires_shipping, taxable, weight, weight_unit, image_id, created_at, updated_at)
           VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 'kg', NULL, ?, ?)`,
        ).run(newVariantId++, id, i + 1, vtitle, o[0], o[1], o[2], v.sku, v.barcode, v.price, v.compare, mgmt, policy, v.qty, v.weight, now, now);
        return;
      }
      const old = existingVariants.get(v.id)!;
      const qty = v.qtyChanged ? v.qty : old.inventory_quantity;
      const same =
        old.position === i + 1 &&
        old.title === vtitle &&
        old.option1 === o[0] &&
        old.option2 === o[1] &&
        old.option3 === o[2] &&
        old.sku === v.sku &&
        old.barcode === v.barcode &&
        old.price === v.price &&
        old.compare_at_price === v.compare &&
        old.inventory_management === mgmt &&
        old.inventory_policy === policy &&
        old.inventory_quantity === qty &&
        old.weight === v.weight;
      if (same) return;
      db.prepare(
        `UPDATE variants SET position = ?, title = ?, option1 = ?, option2 = ?, option3 = ?, sku = ?, barcode = ?, price = ?, compare_at_price = ?,
          inventory_management = ?, inventory_policy = ?, inventory_quantity = ?, weight = ?, updated_at = ? WHERE id = ? AND product_id = ?`,
      ).run(i + 1, vtitle, o[0], o[1], o[2], v.sku, v.barcode, v.price, v.compare, mgmt, policy, qty, v.weight, now, v.id, id);
    });

    // pictures
    for (const mid of existingMedia.keys()) {
      if (!keptMedia.has(mid)) db.prepare("DELETE FROM media WHERE product_id = ? AND id = ?").run(id, mid);
    }
    let newMediaId = nextMediaId();
    let newImageId = nextImageId();
    media.forEach((m, i) => {
      if (m.id === null) {
        db.prepare(
          `INSERT INTO media(id, image_id, product_id, position, media_type, alt, file, width, height, sources, duration, created_at, updated_at, external_id, host, variant_ids)
           VALUES(?, ?, ?, ?, 'image', ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL, '[]')`,
        ).run(newMediaId++, newImageId++, id, i + 1, m.alt || null, m.file, m.width, m.height, now, now);
        return;
      }
      const old = existingMedia.get(m.id)!;
      const alt = m.alt || null;
      if (old.position === i + 1 && (old.alt ?? null) === alt) return;
      if ((old.alt ?? null) !== alt) db.prepare("UPDATE media SET position = ?, alt = ?, updated_at = ? WHERE product_id = ? AND id = ?").run(i + 1, alt, now, id, m.id);
      else db.prepare("UPDATE media SET position = ? WHERE product_id = ? AND id = ?").run(i + 1, id, m.id);
    });
    // a variant keeps its picture only while the product still has it; removed variants leave the pictures' lists
    db.prepare(
      "UPDATE variants SET image_id = NULL WHERE product_id = ? AND image_id IS NOT NULL AND image_id NOT IN (SELECT image_id FROM media WHERE product_id = ? AND image_id IS NOT NULL)",
    ).run(id, id);
    if (removed.length) {
      for (const m of db.prepare("SELECT id, variant_ids FROM media WHERE product_id = ?").all(id) as { id: number; variant_ids: string }[]) {
        const ids = parseJson<number[]>(m.variant_ids, []);
        const kept = ids.filter((x) => !removed.includes(x));
        if (kept.length !== ids.length) db.prepare("UPDATE media SET variant_ids = ? WHERE product_id = ? AND id = ?").run(JSON.stringify(kept), id, m.id);
      }
    }

    saveMetafieldForms("product", id, input.metafields);
  })();
  catalogChanged();
  return productEditorData(id)!.form;
}

/** Metafields and translations of a variant that is being removed. */
function deleteVariantData(vid: number) {
  const db = getDb();
  db.prepare("DELETE FROM metafields WHERE owner_type = 'variant' AND owner_id = ?").run(vid);
  db.prepare("DELETE FROM translations WHERE owner_type = 'variant' AND owner_id = ?").run(String(vid));
  const prefix = `variant.${vid}.`;
  db.prepare("DELETE FROM translations WHERE owner_type = 'metafield' AND substr(owner_id, 1, ?) = ?").run(prefix.length, prefix);
}

// ---------------------------------------------------------------------------------------------
// Create / delete

/** A new draft product with one variant; returns its id. */
export function createProduct(input: { title: unknown; price: unknown; sku: unknown; qty: unknown }): number {
  const db = getDb();
  const title = line(input.title);
  if (!title) throw new FormError("Въведете заглавие на продукта.");
  const price = parseCents(String(input.price ?? ""));
  if (price === null || Number.isNaN(price)) throw new FormError("Въведете валидна цена (напр. 12,99).");
  if (price > MAX_PRICE) throw new FormError("Цената е твърде голяма.");
  const qty = parseWhole(String(input.qty ?? ""));
  if (Number.isNaN(qty) || (qty ?? 0) > MAX_STOCK) throw new FormError("Наличността трябва да е цяло число бройки.");
  const sku = line(input.sku);

  const base = cleanHandle(title) || "produkt";
  let handle = base;
  for (let i = 2; db.prepare("SELECT 1 FROM products WHERE handle = ?").get(handle); i++) handle = `${base}-${i}`;
  const vendor =
    (db.prepare("SELECT vendor, COUNT(*) AS n FROM products WHERE vendor != '' GROUP BY vendor ORDER BY n DESC LIMIT 1").get() as { vendor: string } | undefined)?.vendor ??
    getCatalog().shop.name;
  const now = nowIso();
  const id = nextProductId();
  const variantId = nextVariantId();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO products(id, handle, title, body_html, vendor, product_type, tags, template_suffix, status, published_at, created_at, updated_at, seo_title, seo_description, options, gift_card)
       VALUES(?, ?, ?, '', ?, '', '[]', NULL, 'draft', NULL, ?, ?, NULL, NULL, ?, 0)`,
    ).run(id, handle, title, vendor, now, now, JSON.stringify([{ name: DEFAULT_OPTION, values: [DEFAULT_VALUE] }]));
    db.prepare(
      `INSERT INTO variants(id, product_id, position, title, option1, option2, option3, sku, barcode, price, compare_at_price, inventory_management,
        inventory_policy, inventory_quantity, requires_shipping, taxable, weight, weight_unit, image_id, created_at, updated_at)
       VALUES(?, ?, 1, ?, ?, NULL, NULL, ?, '', ?, NULL, 'shopify', 'deny', ?, 1, 1, 0, 'kg', NULL, ?, ?)`,
    ).run(variantId, id, DEFAULT_VALUE, DEFAULT_VALUE, sku, price, qty ?? 0, now, now);
    // an old redirect away from this address would send the new product's visitors elsewhere
    db.prepare("DELETE FROM redirects WHERE path = ?").run(`/products/${handle}`);
  })();
  catalogChanged();
  return id;
}

/** Deletes a product with its variants, pictures, metafields and translations. Orders keep their own copy. */
export function deleteProduct(id: number) {
  const db = getDb();
  const p = db.prepare("SELECT id FROM products WHERE id = ?").get(id);
  if (!p) throw new FormError("Продуктът вече е изтрит.");
  db.transaction(() => {
    for (const v of db.prepare("SELECT id FROM variants WHERE product_id = ?").all(id) as { id: number }[]) deleteVariantData(v.id);
    db.prepare("DELETE FROM metafields WHERE owner_type = 'product' AND owner_id = ?").run(id);
    db.prepare("DELETE FROM translations WHERE owner_type = 'product' AND owner_id = ?").run(String(id));
    const prefix = `product.${id}.`;
    db.prepare("DELETE FROM translations WHERE owner_type = 'metafield' AND substr(owner_id, 1, ?) = ?").run(prefix.length, prefix);
    // other products' "upsells" lists stop naming it
    const gid = productGid(id);
    for (const m of db.prepare("SELECT owner_type, owner_id, namespace, key, value FROM metafields WHERE type = 'list.product_reference' AND instr(value, ?) > 0").all(`"${gid}"`) as {
      owner_type: string;
      owner_id: number;
      namespace: string;
      key: string;
      value: string;
    }[]) {
      const kept = gidList(m.value).filter((x) => x !== id);
      if (kept.length) {
        db.prepare("UPDATE metafields SET value = ? WHERE owner_type = ? AND owner_id = ? AND namespace = ? AND key = ?").run(JSON.stringify(kept.map(productGid)), m.owner_type, m.owner_id, m.namespace, m.key);
      } else {
        db.prepare("DELETE FROM metafields WHERE owner_type = ? AND owner_id = ? AND namespace = ? AND key = ?").run(m.owner_type, m.owner_id, m.namespace, m.key);
      }
    }
    // variants, prices per market, pictures and collection places go with the product (ON DELETE CASCADE)
    db.prepare("DELETE FROM products WHERE id = ?").run(id);
  })();
  catalogChanged();
}
