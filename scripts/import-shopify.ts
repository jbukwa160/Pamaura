/**
 * Imports the Pamaura catalog from the live Shopify storefront (public data only):
 * products, variants, media, collections, pages, blog articles, menus, files, fonts and the
 * Romanian translations. Shopify ids are kept, so existing links (?variant=…) keep working.
 *
 *   npm run import                    # first import (refuses to overwrite an existing catalog)
 *   npm run import -- --replace       # re-import, replacing products/collections/pages/menus
 *   npm run import -- --refresh       # ignore the HTTP cache (DATA_DIR/import-cache)
 *   npm run import -- --no-videos     # skip downloading video files
 *
 * Metafields, theme video settings and theme-text translations are recovered afterwards by
 * `npm run import:align` (compares our rendering with the live pages).
 */
import fs from "node:fs";
import path from "node:path";
import { parse, type HTMLElement } from "node-html-parser";
import sharp from "sharp";
import { DATA_DIR, FILES_DIR, bumpCatalogVersion, getDb, nowIso, setSetting } from "../src/lib/db";
import { DEFAULT_MARKETS } from "../src/lib/catalog";
import { Fetcher } from "./import/fetch";
import { THEME_DIR } from "../src/lib/liquid/theme";
import { seedDiscounts } from "../src/lib/discounts";

const args = new Set(process.argv.slice(2));
const BASE = (process.env.SHOP_URL || "https://pamaura.com").replace(/\/$/, "");
const PRIMARY = "bg-bg";
const OTHER: { path: string; locale: string }[] = [{ path: "ro-ro", locale: "ro" }];
const fetcher = new Fetcher(path.join(DATA_DIR, "import-cache"), args.has("--refresh"));
const WITH_VIDEOS = !args.has("--no-videos");
const STOCK_CSV = process.env.STOCK_CSV || path.resolve(process.cwd(), "../entire products_export (9).csv");

const log = (...a: unknown[]) => console.log("[import]", ...a);

// ---------------------------------------------------------------------------------------------
// Types of the public Shopify JSON

interface PjVariant {
  id: number;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  sku: string | null;
  requires_shipping: boolean;
  taxable: boolean;
  featured_image: { id: number } | null;
  available: boolean;
  price: string;
  grams: number;
  compare_at_price: string | null;
  position: number;
  product_id: number;
  created_at: string;
  updated_at: string;
}
interface PjImage {
  id: number;
  created_at: string;
  position: number;
  updated_at: string;
  product_id: number;
  variant_ids: number[];
  src: string;
  width: number;
  height: number;
}
interface PjProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: PjVariant[];
  images: PjImage[];
  options: { name: string; position: number; values: string[] }[];
}
interface JsMedia {
  alt: string | null;
  id: number;
  position: number;
  preview_image?: { aspect_ratio: number; height: number; width: number; src: string };
  aspect_ratio?: number;
  height?: number;
  width?: number;
  media_type: string;
  src?: string;
  sources?: { format: string; height: number; mime_type: string; url: string; width: number }[];
  duration?: number | null;
  external_id?: string;
  host?: string;
}
interface JsVariant {
  id: number;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  sku: string | null;
  barcode: string | null;
  available: boolean;
  price: number;
  compare_at_price: number | null;
  inventory_management: string | null;
  weight: number;
  featured_image: { id: number } | null;
}
interface JsProduct {
  id: number;
  title: string;
  handle: string;
  description: string;
  type: string;
  vendor: string;
  tags: string[];
  variants: JsVariant[];
  media: JsMedia[];
  options: { name: string; position: number; values: string[] }[];
}
interface CjCollection {
  id: number;
  title: string;
  handle: string;
  description: string;
  published_at: string;
  updated_at: string;
  image: { id: number; created_at: string; src: string; alt: string | null; width?: number; height?: number } | null;
  products_count: number;
}

// ---------------------------------------------------------------------------------------------
// Files

interface FileOut {
  name: string;
  plain: string;
  folder: string;
  mime: string;
  width: number | null;
  height: number | null;
  size: number;
  version: string;
  source_url: string;
  meta: unknown;
}
const files = new Map<string, FileOut>();
const pendingDownloads: { url: string; name: string; folder: string; version: string; meta?: unknown }[] = [];

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  pdf: "application/pdf",
};

/** Parses a Shopify CDN url → { name, folder, version } (version kept as a string: it can exceed 2^63) */
function cdnRef(u: string): { name: string; folder: string; version: string; url: string } | null {
  const abs = (u.startsWith("//") ? "https:" + u : u.startsWith("/") ? BASE + u : u).replace(/&amp;/g, "&");
  let m = abs.match(/\/s\/files\/1\/\d+\/\d+\/\d+\/(files|products|collections|articles)\/([^?#]+)(?:\?([^#]*))?/);
  if (!m) m = abs.match(/\/cdn\/shop\/(files|products|collections|articles)\/([^?#]+)(?:\?([^#]*))?/);
  if (!m) return null;
  const vq = (m[3] || "").match(/(?:^|&)v=(\d+)/);
  const folder = m[1] === "files" ? "files" : m[1];
  let name = decodeURIComponent(m[2]);
  // strip legacy size suffixes from rendered urls: name_600x.jpg, name_1000x1000_crop_center.png
  name = name.replace(/_(\d+x\d*|x\d+|pico|icon|thumb|small|compact|medium|large|grande|original|master)(_crop_[a-z]+)?(@\dx)?(\.progressive)?(\.[a-z0-9]+)$/i, "$5");
  const version = vq ? vq[1] : "";
  return { name, folder, version, url: `${BASE}/cdn/shop/${m[1]}/${encodeURIComponent(name).replace(/%2F/g, "/")}${version ? `?v=${version}` : ""}` };
}

function fileKey(folder: string, name: string) {
  return folder === "files" ? name : `${folder}/${name}`;
}

function addFile(u: string, extra: { meta?: unknown } = {}): string | null {
  const ref = cdnRef(u);
  if (!ref) return null;
  const key = fileKey(ref.folder, ref.name);
  const existing = files.get(key);
  if (existing) {
    if (!existing.version && ref.version) existing.version = ref.version;
    return key;
  }
  const ext = key.split(".").pop()!.toLowerCase();
  files.set(key, { name: key, plain: ref.name, folder: ref.folder, mime: MIME[ext] || "application/octet-stream", width: null, height: null, size: 0, version: ref.version, source_url: ref.url, meta: extra.meta ?? null });
  return key;
}

// ---------------------------------------------------------------------------------------------

function textOf(el: HTMLElement | null | undefined) {
  return el ? el.text.replace(/\s+/g, " ").trim() : "";
}
function decodeHtml(s: string) {
  return s
    .replace(/&ndash;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}
/** Inner HTML of the first <div> with this class (tolerant of markup the HTML parser trips over). */
function divInner(html: string, cls: string): string {
  const start = html.search(new RegExp(`<div class="${cls}"[^>]*>`));
  if (start < 0) return "";
  const from = html.indexOf(">", start) + 1;
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (!depth) return html.slice(from, m.index);
  }
  return "";
}

function pageMeta(html: string) {
  const title = decodeHtml((html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").trim()).replace(/\s+–\s+PAMAURA$/, "").trim();
  const description = decodeHtml(html.match(/<meta name="description" content="([^"]*)"/)?.[1] || "");
  const body = html.match(/<body[^>]*class="([^"]*)"/)?.[1].replace(/\s+/g, " ") || "";
  const tm = body.match(/template-(\w+) template-([\w-]+)/);
  let suffix: string | null = null;
  if (tm) {
    const base = tm[1];
    const full = tm[2];
    if (full.startsWith(base + "-")) suffix = full.slice(base.length + 1);
  }
  const resource = html.match(/"pageType":"(\w+)","resourceType":"(\w+)","resourceId":(\d+)/);
  return { title, description, suffix, resourceType: resource?.[2] || null, resourceId: resource ? Number(resource[3]) : null };
}

/** Theme templates exist with the suffix? Body classes handleize the suffix (dots → dashes). */
function resolveSuffix(type: string, handleized: string | null): string | null {
  if (!handleized) return null;
  const dir = path.join(THEME_DIR, "templates");
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(new RegExp(`^${type}\\.(.+)\\.(json|liquid)$`));
    if (m && m[1].replace(/[^a-z0-9]+/gi, "-").toLowerCase() === handleized) return m[1];
  }
  return null;
}

function locs(xml: string | null) {
  if (!xml) return [];
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}

function cents(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  return Math.round(Number(v) * 100);
}

function relPath(href: string): string {
  // /bg-bg/pages/%D0%BD… → /pages/направи-си-сет ; "/bg-bg" → "/"
  let p = href.replace(BASE, "");
  p = p.replace(new RegExp(`^/(${[PRIMARY, ...OTHER.map((o) => o.path)].join("|")})(?=/|$)`), "");
  if (!p) p = "/";
  try {
    p = decodeURI(p);
  } catch {
    /* keep */
  }
  return p;
}

// ---------------------------------------------------------------------------------------------
// Menus

interface MenuItemOut {
  title: string;
  url: string;
  items: MenuItemOut[];
}

function parseNavList(ul: HTMLElement): MenuItemOut[] {
  const out: MenuItemOut[] = [];
  for (const li of ul.childNodes.filter((n) => (n as HTMLElement).tagName === "LI") as HTMLElement[]) {
    const a = li.querySelector("a");
    if (!a) continue;
    const sub = li.querySelector("ul");
    out.push({ title: textOf(a.querySelector(".text-animation--underline-in-header") || a), url: relPath(a.getAttribute("href") || "/"), items: sub ? parseNavList(sub) : [] });
  }
  return out;
}

function parseMenus(html: string) {
  const root = parse(html);
  const menus: Record<string, MenuItemOut[]> = {};
  const nav = root.querySelector(".site-nav.style--classic nav > ul.link-list");
  if (nav) menus["pamaura-menu"] = parseNavList(nav);
  const footerNavs = root.querySelectorAll("nav.footer-item__menu");
  const keys = ["footer-1", "footer-2"];
  footerNavs.forEach((n, i) => {
    if (!keys[i]) return;
    menus[keys[i]] = n.querySelectorAll("a").map((a) => ({ title: textOf(a), url: relPath(a.getAttribute("href") || "/"), items: [] }));
  });
  return menus;
}

// ---------------------------------------------------------------------------------------------
// Stock estimate (the storefront does not expose quantities)

function loadStock(): Map<string, number> {
  const out = new Map<string, number>();
  if (!fs.existsSync(STOCK_CSV)) return out;
  const text = fs.readFileSync(STOCK_CSV, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!/pamaura/i.test(line)) continue;
    const cols = line.split(",");
    const sku = cols[0], ean = cols[2], inv = Number(cols[6]);
    if (sku.startsWith("Dilon-") && ean && Number.isFinite(inv)) out.set(ean, Math.max(out.get(ean) || 0, inv));
  }
  return out;
}

function packSize(option: string | null) {
  const m = String(option || "").trim().match(/^(\d+)\s*\D/);
  return m ? Number(m[1]) : 1;
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const db = getDb();
  const existing = (db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number }).n;
  if (existing && !args.has("--replace")) {
    console.error(`The catalog already has ${existing} products. Run with --replace to overwrite products, collections, pages, blogs and menus (orders and customers are kept).`);
    process.exit(1);
  }

  // 1. what exists
  const smUrl = (kind: string) => `${BASE}/${PRIMARY}/sitemap_${kind}_1.xml`;
  const productHandles = locs(await fetcher.text(smUrl("products") + "?from=1&to=99999999999999"))
    .map((u) => u.match(/\/products\/([^/?#]+)$/)?.[1])
    .filter(Boolean)
    .map((h) => decodeURIComponent(h!));
  const pageHandles = locs(await fetcher.text(smUrl("pages") + "?from=1&to=99999999999999"))
    .map((u) => u.match(/\/pages\/([^/?#]+)$/)?.[1])
    .filter(Boolean)
    .map((h) => decodeURIComponent(h!));
  const collectionHandles = locs(await fetcher.text(smUrl("collections") + "?from=1&to=99999999999999"))
    .map((u) => u.match(/\/collections\/([^/?#]+)$/)?.[1])
    .filter(Boolean)
    .map((h) => decodeURIComponent(h!));
  const blogHandles = locs(await fetcher.text(smUrl("blogs")))
    .map((u) => u.match(/\/blogs\/([^/?#]+)$/)?.[1])
    .filter(Boolean)
    .map((h) => decodeURIComponent(h!));
  log(`sitemap: ${productHandles.length} products, ${collectionHandles.length} collections, ${pageHandles.length} pages, ${blogHandles.length} blogs`);

  const stock = loadStock();
  log(`stock file: ${stock.size} Pamaura barcodes from ${path.basename(STOCK_CSV)}`);

  // 2. products
  const pj = await fetcher.json<{ products: PjProduct[] }>(`${BASE}/${PRIMARY}/products.json?limit=250`);
  const pjByHandle = new Map((pj?.products || []).map((p) => [p.handle, p]));
  const products: Record<string, unknown>[] = [];
  const variants: Record<string, unknown>[] = [];
  const media: Record<string, unknown>[] = [];
  const translations: [string, string, string, string, string][] = [];
  const marketPrices: [number, string, number, number | null][] = [];
  const stockNotes: string[] = [];

  for (const handle of productHandles) {
    const enc = encodeURIComponent(handle);
    const js = await fetcher.json<JsProduct>(`${BASE}/${PRIMARY}/products/${enc}.js`);
    const html = (await fetcher.text(`${BASE}/${PRIMARY}/products/${enc}`)) || "";
    const p = pjByHandle.get(handle);
    if (!js || !p) {
      log(`! product ${handle}: missing JSON, skipped`);
      continue;
    }
    const meta = pageMeta(html);
    const suffix = resolveSuffix("product", meta.suffix);
    const stockLabelOut = /class="stock-label sold_out_variant"/.test(html);
    products.push({
      id: p.id,
      handle,
      title: p.title,
      body_html: p.body_html || "",
      vendor: p.vendor,
      product_type: p.product_type,
      tags: JSON.stringify(js.tags),
      template_suffix: suffix,
      status: "active",
      published_at: p.published_at,
      created_at: p.created_at,
      updated_at: p.updated_at,
      seo_title: meta.title && meta.title !== p.title ? meta.title : null,
      seo_description: meta.description || null,
      options: JSON.stringify(js.options.map((o) => ({ name: o.name, values: o.values }))),
    });

    // media: .js has every media (videos too); products.json has image ids and variant links
    const imageBySrc = new Map<string, PjImage>();
    for (const im of p.images) imageBySrc.set(cdnRef(im.src)?.name || im.src, im);
    for (const m of js.media) {
      let file: string | null = null;
      let imageId: number | null = null;
      let imageDates: [string | null, string | null] = [null, null];
      let variantIds: number[] = [];
      let width = m.width ?? null, height = m.height ?? null;
      const sources = (m.sources || []).map((s) => ({ ...s }));
      if (m.media_type === "image" && m.src) {
        file = addFile(m.src);
        const im = imageBySrc.get(file || "");
        if (im) {
          imageId = im.id;
          imageDates = [im.created_at, im.updated_at];
          variantIds = im.variant_ids;
          width = im.width;
          height = im.height;
        }
      } else if (m.preview_image) {
        file = addFile(m.preview_image.src);
      }
      if (m.media_type === "video") {
        for (const s of sources) {
          const vm = s.url.match(/\/videos\/(c\/vp\/[^?]+)/);
          if (!vm) continue;
          const name = vm[1];
          if (s.format === "mp4" && WITH_VIDEOS) pendingDownloads.push({ url: s.url, name, folder: "videos", version: "" });
          s.url = name;
        }
      }
      media.push({
        id: m.id,
        image_id: imageId,
        product_id: p.id,
        position: m.position,
        media_type: m.media_type,
        alt: m.alt,
        file,
        width: width ?? m.preview_image?.width ?? null,
        height: height ?? m.preview_image?.height ?? null,
        sources: m.media_type === "video" ? JSON.stringify(sources) : null,
        duration: m.duration ?? null,
        created_at: imageDates[0],
        updated_at: imageDates[1],
        external_id: m.external_id ?? null,
        host: m.host ?? null,
        variant_ids: JSON.stringify(variantIds),
      });
    }

    for (const v of p.variants) {
      const jv = js.variants.find((x) => x.id === v.id)!;
      const barcode = jv?.barcode || "";
      const tracked = jv?.inventory_management || null;
      let qty = 0;
      let policy = "deny";
      if (jv?.available) {
        const base = barcode ? stock.get(barcode) : undefined;
        qty = base !== undefined ? Math.floor(base / packSize(v.option1)) : 100;
        if (qty <= 0 || stockLabelOut) {
          // live shows it as purchasable but not "in stock": overselling allowed
          qty = 0;
          policy = "continue";
        }
        if (base === undefined) stockNotes.push(`${handle} / ${v.title}: no stock data → 100`);
      }
      variants.push({
        id: v.id,
        product_id: p.id,
        position: v.position,
        title: v.title,
        option1: v.option1,
        option2: v.option2,
        option3: v.option3,
        sku: v.sku || "",
        barcode,
        price: cents(v.price)!,
        compare_at_price: cents(v.compare_at_price),
        inventory_management: tracked,
        inventory_policy: policy,
        inventory_quantity: qty,
        requires_shipping: v.requires_shipping ? 1 : 0,
        taxable: v.taxable ? 1 : 0,
        weight: v.grams || 0,
        weight_unit: "kg",
        image_id: v.featured_image?.id ?? null,
        created_at: v.created_at,
        updated_at: v.updated_at,
      });
    }

    // other markets: translations + prices
    for (const mk of OTHER) {
      const tjs = await fetcher.json<JsProduct>(`${BASE}/${mk.path}/products/${enc}.js`);
      const thtml = (await fetcher.text(`${BASE}/${mk.path}/products/${enc}`)) || "";
      if (!tjs) continue;
      const tmeta = pageMeta(thtml);
      const t = (field: string, value: string | null | undefined, base: string | null | undefined) => {
        if (value !== null && value !== undefined && value !== base) translations.push([mk.locale, "product", String(p.id), field, value]);
      };
      t("title", tjs.title, js.title);
      t("body_html", tjs.description, js.description);
      t("product_type", tjs.type, js.type);
      if (tmeta.title && tmeta.title !== tjs.title) t("seo_title", tmeta.title, null);
      if (tmeta.description) t("seo_description", tmeta.description, null);
      tjs.options.forEach((o, i) => {
        t(`option_name.${i}`, o.name, js.options[i]?.name);
        o.values.forEach((val, j) => t(`option_value.${i}.${js.options[i]?.values[j]}`, val, js.options[i]?.values[j]));
      });
      for (const tv of tjs.variants) marketPrices.push([tv.id, mk.path, tv.price, tv.compare_at_price]);
    }
    log(`product ${handle} (${suffix || "default"}): ${p.variants.length} variants, ${js.media.length} media`);
  }

  // 3. collections
  const cj = await fetcher.json<{ collections: CjCollection[] }>(`${BASE}/${PRIMARY}/collections.json?limit=250`);
  const cjByHandle = new Map((cj?.collections || []).map((c) => [c.handle, c]));
  const collections: Record<string, unknown>[] = [];
  const collectionProducts: [number, number, number][] = [];
  const productIdByHandle = new Map(products.map((p) => [String(p.handle), Number(p.id)]));
  for (const handle of collectionHandles) {
    const enc = encodeURIComponent(handle);
    const html = (await fetcher.text(`${BASE}/${PRIMARY}/collections/${enc}`)) || "";
    const meta = pageMeta(html);
    const c = cjByHandle.get(handle);
    const list = await fetcher.json<{ products: { handle: string }[] }>(`${BASE}/${PRIMARY}/collections/${enc}/products.json?limit=250`);
    const isAll = handle === "all" && !c && !meta.resourceId;
    const id = c?.id ?? meta.resourceId ?? 0;
    // the order shown on the live page (default sort) is the collection order
    const htmlOrder = [...html.matchAll(/id="product-item-(\d+)"/g)].map((m) => Number(m[1])).filter((x, i, a) => a.indexOf(x) === i);
    const imageFile = c?.image?.src ? addFile(c.image.src) : null;
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1];
    collections.push({
      id,
      handle,
      title: c?.title ?? decodeHtml(textOf(parse(h1 || "").querySelector("*")) || meta.title || handle),
      body_html: c?.description ?? "",
      image_file: imageFile,
      image_alt: c?.image?.alt ?? null,
      sort_order: "manual",
      template_suffix: resolveSuffix("collection", meta.suffix),
      published: 1,
      published_at: c?.published_at ?? nowIso(),
      updated_at: c?.updated_at ?? nowIso(),
      seo_title: c && meta.title && meta.title !== c.title ? meta.title : null,
      seo_description: meta.description || null,
      // "all" on pamaura.com is a smart collection that leaves out the upsell-only (no_pdp) products
      rules: handle === "all" && !c ? JSON.stringify({ disjunctive: false, rules: [{ column: "tag", relation: "not_equals", condition: "no_pdp" }] }) : null,
      all_products: isAll ? 1 : 0,
    });
    if (!isAll) {
      const ids = htmlOrder.length ? htmlOrder.filter((pid) => products.some((p) => p.id === pid)) : (list?.products || []).map((p) => productIdByHandle.get(p.handle)).filter(Boolean) as number[];
      ids.forEach((pid, i) => collectionProducts.push([id, pid, i + 1]));
    }
    for (const mk of OTHER) {
      const tc = await fetcher.json<{ collections: CjCollection[] }>(`${BASE}/${mk.path}/collections.json?limit=250`);
      const t = tc?.collections.find((x) => x.id === id);
      const thtml = (await fetcher.text(`${BASE}/${mk.path}/collections/${enc}`)) || "";
      const tmeta = pageMeta(thtml);
      if (t && c) {
        if (t.title !== c.title) translations.push([mk.locale, "collection", String(id), "title", t.title]);
        if (t.description !== c.description) translations.push([mk.locale, "collection", String(id), "body_html", t.description]);
      } else if (isAll && tmeta.title) {
        translations.push([mk.locale, "collection", String(id), "title", tmeta.title]);
      }
      if (tmeta.description) translations.push([mk.locale, "collection", String(id), "seo_description", tmeta.description]);
    }
    log(`collection ${handle}: ${(list?.products || []).length} products`);
  }

  // 4. pages
  const pages: Record<string, unknown>[] = [];
  for (const handle of pageHandles) {
    const enc = encodeURIComponent(handle);
    const html = (await fetcher.text(`${BASE}/${PRIMARY}/pages/${enc}`)) || "";
    const meta = pageMeta(html);
    // comments are kept: they are part of the page content (translated bodies carry some)
    const root = parse(html, { comment: true });
    const main = root.querySelector("#main");
    const rte = main?.querySelector(".rte");
    const id = meta.resourceId ?? 0;
    pages.push({
      id,
      handle,
      title: meta.title,
      body_html: rte ? rte.innerHTML.trim() : "",
      template_suffix: resolveSuffix("page", meta.suffix),
      published: 1,
      author: null,
      created_at: nowIso(),
      updated_at: nowIso(),
      published_at: nowIso(),
      seo_title: null,
      seo_description: meta.description || null,
    });
    for (const mk of OTHER) {
      const thtml = (await fetcher.text(`${BASE}/${mk.path}/pages/${enc}`)) || "";
      const tmeta = pageMeta(thtml);
      const trte = parse(thtml, { comment: true }).querySelector("#main")?.querySelector(".rte");
      if (tmeta.title && tmeta.title !== meta.title) translations.push([mk.locale, "page", String(id), "title", tmeta.title]);
      if (trte && rte && trte.innerHTML.trim() !== rte.innerHTML.trim()) translations.push([mk.locale, "page", String(id), "body_html", trte.innerHTML.trim()]);
      if (tmeta.description) translations.push([mk.locale, "page", String(id), "seo_description", tmeta.description]);
    }
    log(`page ${handle} (${resolveSuffix("page", meta.suffix) || "default"})`);
  }

  // 5. blogs & articles (Atom feed has full content)
  const blogs: Record<string, unknown>[] = [];
  const articles: Record<string, unknown>[] = [];
  for (const handle of blogHandles) {
    const atom = (await fetcher.text(`${BASE}/${PRIMARY}/blogs/${encodeURIComponent(handle)}.atom`)) || "";
    const bhtml = (await fetcher.text(`${BASE}/${PRIMARY}/blogs/${encodeURIComponent(handle)}`)) || "";
    const bmeta = pageMeta(bhtml);
    const blogId = Number(atom.match(/<id>[^<]*?\/(\d+)<\/id>/)?.[1] || bmeta.resourceId || 1);
    const blogTitle = decodeHtml(atom.match(/<title>([^<]*)<\/title>/)?.[1] || handle).replace(/^PAMAURA - /, "");
    blogs.push({ id: blogId, handle, title: bmeta.title || blogTitle, template_suffix: resolveSuffix("blog", bmeta.suffix), commentable: "no", created_at: nowIso(), updated_at: nowIso() });
    for (const mk of OTHER) {
      const tmeta = pageMeta((await fetcher.text(`${BASE}/${mk.path}/blogs/${encodeURIComponent(handle)}`)) || "");
      if (tmeta.title && tmeta.title !== (bmeta.title || blogTitle)) translations.push([mk.locale, "blog", String(blogId), "title", tmeta.title]);
    }
    const entries = atom.split("<entry>").slice(1);
    for (const e of entries) {
      const link = e.match(/<link[^>]*href="([^"]+)"/)?.[1] || "";
      const ahandle = decodeURIComponent(link.split("/").pop() || "");
      const title = decodeHtml(e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
      const published = e.match(/<published>([^<]+)<\/published>/)?.[1] || nowIso();
      const updated = e.match(/<updated>([^<]+)<\/updated>/)?.[1] || published;
      const author = decodeHtml(e.match(/<author>\s*<name>([^<]*)<\/name>/)?.[1] || "");
      // HTML is either CDATA or entity-encoded; the feed appends a "read more" link to the excerpt
      const feedHtml = (tag: string) => {
        const raw = (e.match(new RegExp(`<${tag} type="html">([\\s\\S]*?)<\\/${tag}>`))?.[1] || "").trim();
        const cdata = raw.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
        return (cdata ? cdata[1] : decodeHtml(raw)).trim();
      };
      const content = feedHtml("content");
      const summary = feedHtml("summary").replace(/<p><a class="read-more"[^>]*>[\s\S]*?<\/a><\/p>$/, "").trim();
      const ahtml = (await fetcher.text(`${BASE}/${PRIMARY}/blogs/${encodeURIComponent(handle)}/${encodeURIComponent(ahandle)}`)) || "";
      let tags = [...e.matchAll(/<category term="([^"]+)"/g)].map((m) => decodeHtml(m[1]));
      if (!tags.length) tags = [...ahtml.matchAll(/class="pill[^"]*" href="[^"]*\/tagged\/[^"]*">([^<]+)<\/a>/g)].map((m) => decodeHtml(m[1]).trim());
      const ameta = pageMeta(ahtml);
      // the feed's <id> is the article URL; the page reports the article id
      const id = Number(e.match(/<id>[^<]*Article\/(\d+)<\/id>/)?.[1] || (ameta.resourceType?.toLowerCase() === "article" ? ameta.resourceId : 0));
      if (!id) {
        log(`! article ${handle}/${ahandle}: no id, skipped`);
        continue;
      }
      const ogImage = ahtml.match(/<meta property="og:image:secure_url" content="([^"]+)"/)?.[1];
      const imageFile = ogImage && /\/(articles|files)\//.test(ogImage) ? addFile(ogImage) : null;
      // a <title> that differs from the article title is its SEO title
      const seoTitle = ameta.title && ameta.title !== title ? ameta.title : null;
      articles.push({
        id,
        blog_id: blogId,
        handle: ahandle,
        title,
        author,
        body_html: content,
        summary_html: summary,
        image_file: imageFile,
        image_alt: null,
        tags: JSON.stringify(tags),
        template_suffix: resolveSuffix("article", ameta.suffix),
        published: 1,
        published_at: published,
        created_at: published,
        updated_at: updated,
        seo_title: seoTitle,
        seo_description: ameta.description || null,
      });
      for (const mk of OTHER) {
        // the Atom feed is not translated; the article page is
        const thtml = (await fetcher.text(`${BASE}/${mk.path}/blogs/${encodeURIComponent(handle)}/${encodeURIComponent(ahandle)}`)) || "";
        const tmeta = pageMeta(thtml);
        const troot = parse(thtml);
        const tcontent = divInner(thtml, "article-content-wrapper").trim();
        const bcontent = divInner(ahtml, "article-content-wrapper").trim();
        // the heading carries the translated title; <title> may be a shortened SEO title
        const ttitle = decodeHtml(textOf(troot.querySelector("h1")));
        if (ttitle && ttitle !== title) translations.push([mk.locale, "article", String(id), "title", ttitle]);
        if (tmeta.title && tmeta.title !== (ttitle || title)) translations.push([mk.locale, "article", String(id), "seo_title", tmeta.title]);
        if (tcontent && tcontent !== bcontent) translations.push([mk.locale, "article", String(id), "body_html", tcontent]);
        if (tmeta.description) translations.push([mk.locale, "article", String(id), "seo_description", tmeta.description]);
        // the excerpt only shows as plain text in the blog listing
        const tlist = (await fetcher.text(`${BASE}/${mk.path}/blogs/${encodeURIComponent(handle)}`)) || "";
        const at = tlist.indexOf(`/blogs/${encodeURIComponent(handle)}/${encodeURIComponent(ahandle)}"`);
        const texcerpt = at >= 0 ? decodeHtml(tlist.slice(at).match(/class="blog-item__excerpt"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/)?.[1] || "").trim() : "";
        if (texcerpt && texcerpt !== summary.replace(/<[^>]*>/g, "").trim()) translations.push([mk.locale, "article", String(id), "summary_html", `<p>${texcerpt}</p>`]);
      }
      log(`article ${handle}/${ahandle}`);
    }
  }

  // 6. menus (from the rendered header / footer)
  const homeHtml = (await fetcher.text(`${BASE}/${PRIMARY}`)) || "";
  const menus = parseMenus(homeHtml);
  for (const mk of OTHER) {
    const t = parseMenus((await fetcher.text(`${BASE}/${mk.path}`)) || "");
    for (const [handle, items] of Object.entries(menus)) {
      const titles = (list: MenuItemOut[], tlist: MenuItemOut[] | undefined, prefix: string) => {
        list.forEach((it, i) => {
          const ti = tlist?.[i];
          if (ti && ti.title !== it.title) translations.push([mk.locale, "menu", handle, `${prefix}${i}.title`, ti.title]);
          titles(it.items, ti?.items, `${prefix}${i}.`);
        });
      };
      titles(items, t[handle], "");
    }
  }
  log(`menus: ${Object.entries(menus).map(([k, v]) => `${k} (${v.length})`).join(", ")}`);

  // 7. files referenced by the theme (shopify://shop_images/…) and every CDN file on crawled pages
  const themeRefs = new Set<string>();
  for (const dir of ["templates", "sections", "config"]) {
    for (const f of fs.readdirSync(path.join(THEME_DIR, dir))) {
      if (!f.endsWith(".json")) continue;
      const s = fs.readFileSync(path.join(THEME_DIR, dir, f), "utf8");
      for (const m of s.matchAll(/shopify:\\?\/\\?\/shop_images\\?\/([^"\\]+)/g)) themeRefs.add(m[1]);
    }
  }
  const crawled = fs.readdirSync(fetcher.cacheDir).flatMap((d) => fs.readdirSync(path.join(fetcher.cacheDir, d)).map((f) => path.join(fetcher.cacheDir, d, f)));
  const versionByName = new Map<string, string>();
  const pageFileRefs = new Set<string>();
  for (const f of crawled) {
    const s = fs.readFileSync(f, "utf8");
    if (s.startsWith("\u0000")) continue;
    for (const m of s.matchAll(/(?:\/\/pamaura\.com\/cdn\/shop|https?:\\?\/\\?\/cdn\.shopify\.com\\?\/s\\?\/files\\?\/1\\?\/\d+\\?\/\d+\\?\/\d+)\\?\/(files|products|collections|articles)\\?\/([^"'?\s)\\]+)(?:\?((?:[a-z_]+=[^"'&\s)]*(?:&amp;|&)?)+))?/g)) {
      const ref = cdnRef(`https://pamaura.com/cdn/shop/${m[1]}/${m[2]}${m[3] ? `?${m[3]}` : ""}`);
      if (!ref) continue;
      if (ref.version) versionByName.set(fileKey(ref.folder, ref.name), ref.version);
      pageFileRefs.add(`${m[1]}/${ref.name}`);
    }
  }
  for (const name of themeRefs) addFile(`${BASE}/cdn/shop/files/${encodeURIComponent(name)}${versionByName.get(name) ? `?v=${versionByName.get(name)}` : ""}`);
  for (const ref of pageFileRefs) {
    const [folder, ...rest] = ref.split("/");
    const name = rest.join("/");
    addFile(`${BASE}/cdn/shop/${folder}/${name.split("/").map(encodeURIComponent).join("/")}${versionByName.get(name) ? `?v=${versionByName.get(name)}` : ""}`);
  }
  for (const f of files.values()) if (!f.version && versionByName.get(f.name)) f.version = versionByName.get(f.name)!;

  // body HTML: point Shopify CDN urls at our /cdn/shop/files
  const rewriteBody = (h: string) =>
    h.replace(/(?:https?:)?\/\/(?:cdn\.shopify\.com\/s\/files\/1\/\d+\/\d+\/\d+|pamaura\.com\/cdn\/shop)\/(files|products)\/([^"'?\s]+)(\?v=\d+)?/g, (all, folder, name, v) => {
      addFile(all.startsWith("//") ? "https:" + all : all);
      return `/cdn/shop/${folder}/${name}${v || ""}`;
    });
  for (const rec of [...products, ...pages, ...articles, ...collections]) rec.body_html = rewriteBody(String(rec.body_html || ""));
  for (const t of translations) if (t[3] === "body_html" || t[3] === "summary_html") t[4] = rewriteBody(t[4]);

  // 8. downloads
  log(`downloading ${files.size} files…`);
  let bytes = 0;
  for (const f of files.values()) {
    const dest = path.join(FILES_DIR, f.folder, f.plain);
    try {
      bytes += await fetcher.download(f.source_url, dest);
      f.size = fs.statSync(dest).size;
      if (f.mime.startsWith("image/") && f.mime !== "image/svg+xml") {
        const md = await sharp(dest).metadata();
        f.width = md.width ?? null;
        f.height = md.height ?? null;
      } else if (f.mime === "image/svg+xml") {
        const svg = fs.readFileSync(dest, "utf8");
        const vb = svg.match(/viewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/);
        const w = svg.match(/<svg[^>]*\swidth="([\d.]+)/), h = svg.match(/<svg[^>]*\sheight="([\d.]+)/);
        f.width = w ? Math.round(Number(w[1])) : vb ? Math.round(Number(vb[1])) : null;
        f.height = h ? Math.round(Number(h[1])) : vb ? Math.round(Number(vb[2])) : null;
      }
      if (!f.version) f.version = String(Math.floor(fs.statSync(dest).mtimeMs / 1000));
    } catch (e) {
      log(`! file ${f.name}: ${(e as Error).message}`);
      files.delete(f.name);
    }
  }
  let vbytes = 0;
  for (const v of pendingDownloads) {
    try {
      vbytes += await fetcher.download(v.url, path.join(FILES_DIR, "videos", v.name));
    } catch (e) {
      log(`! video ${v.name}: ${(e as Error).message}`);
    }
  }
  log(`downloaded ${(bytes / 1e6).toFixed(1)} MB of files, ${(vbytes / 1e6).toFixed(1)} MB of videos`);

  // 9. fonts used by the live store
  const fontEntries = new Map<string, { handle: string; dir: string; family: string; style: string; weight: number; fallback: string; woff2: string | null; woff: string | null }>();
  const FAM: Record<string, string> = { fira_sans: "Fira Sans", nunito_sans: "Nunito Sans", josefin_sans: "Josefin Sans", assistant: "Assistant", dm_sans: "DM Sans" };
  for (const f of crawled) {
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(/\/cdn\/fonts\/([a-z_]+)\/([a-z0-9]+)_([ni])(\d)\.([0-9a-f]+)\.(woff2?)/g)) {
      const [, dir, , style, w, , ext] = m;
      const handle = `${dir}_${style}${w}`;
      const e = fontEntries.get(handle) || { handle, dir, family: FAM[dir] || dir, style: style === "i" ? "italic" : "normal", weight: Number(w) * 100, fallback: "sans-serif", woff2: null, woff: null };
      const file = m[0].split("/").pop()!;
      if (ext === "woff2") e.woff2 = file;
      else e.woff = file;
      fontEntries.set(handle, e);
    }
  }
  const fontsDir = path.join(DATA_DIR, "fonts");
  for (const e of fontEntries.values()) {
    for (const file of [e.woff2, e.woff]) {
      if (!file) continue;
      try {
        await fetcher.download(`${BASE}/cdn/fonts/${e.dir}/${file}`, path.join(fontsDir, e.dir, file));
      } catch (err) {
        log(`! font ${file}: ${(err as Error).message}`);
      }
    }
  }
  fs.mkdirSync(fontsDir, { recursive: true });
  fs.writeFileSync(path.join(fontsDir, "fonts.json"), JSON.stringify([...fontEntries.values()], null, 2));
  log(`fonts: ${[...fontEntries.keys()].join(", ")}`);

  // 10. write
  const now = nowIso();
  db.transaction(() => {
    for (const t of ["collection_products", "variant_market_prices", "media", "variants", "products", "collections", "pages", "articles", "blogs", "menus"]) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare("DELETE FROM translations WHERE owner_type IN ('product','variant','collection','page','article','blog','menu')").run();
    const ins = (table: string, rows: Record<string, unknown>[]) => {
      if (!rows.length) return;
      const cols = Object.keys(rows[0]);
      const stmt = db.prepare(`INSERT OR REPLACE INTO ${table}(${cols.join(",")}) VALUES(${cols.map((c) => "@" + c).join(",")})`);
      for (const r of rows) stmt.run(r);
    };
    ins("products", products);
    ins("variants", variants);
    ins("media", media);
    ins("collections", collections);
    const cps = db.prepare("INSERT OR IGNORE INTO collection_products(collection_id, product_id, position) VALUES(?, ?, ?)");
    for (const r of collectionProducts) cps.run(...r);
    ins("pages", pages);
    ins("blogs", blogs);
    ins("articles", articles);
    const menuTitles: Record<string, string> = { "pamaura-menu": "Pamaura menu", "footer-1": "МАГАЗИН", "footer-2": "ПОВЕРИТЕЛНОСТ" };
    const mins = db.prepare("INSERT INTO menus(handle, title, items) VALUES(?, ?, ?)");
    for (const [h, items] of Object.entries(menus)) mins.run(h, menuTitles[h] || h, JSON.stringify(items));
    const fins = db.prepare(
      `INSERT INTO files(name, folder, mime, width, height, size, alt, version, source_url, meta, created_at) VALUES(@name, @folder, @mime, @width, @height, @size, NULL, @version, @source_url, @meta, @created_at)
       ON CONFLICT(name) DO UPDATE SET folder=excluded.folder, mime=excluded.mime, width=excluded.width, height=excluded.height, size=excluded.size, version=excluded.version, source_url=excluded.source_url`,
    );
    for (const f of files.values()) {
      const { plain: _plain, ...row } = f;
      void _plain;
      fins.run({ ...row, meta: f.meta ? JSON.stringify(f.meta) : null, created_at: now });
    }
    const tins = db.prepare("INSERT OR REPLACE INTO translations(locale, owner_type, owner_id, field, value) VALUES(?, ?, ?, ?, ?)");
    for (const t of translations) tins.run(...t);
  })();
  // Shopify converts market prices with a daily exchange rate; keep the rate of the crawled pages.
  const markets = DEFAULT_MARKETS.map((m) => ({ ...m }));
  for (const mk of OTHER) {
    const html = (await fetcher.text(`${BASE}/${mk.path}`)) || "";
    const rate = Number(html.match(/Shopify\.currency = \{"active":"\w+","rate":"([\d.]+)"\}/)?.[1]);
    const m = markets.find((x) => x.path === mk.path);
    if (m && rate > 0) m.rate = rate;
    if (m) log(`market ${mk.path}: rate ${m.rate} (${marketPrices.length} variant prices checked against it)`);
  }
  setSetting("markets", markets);
  setSetting("import.last", { at: now, base: BASE, stockNotes });
  // discount code announced on the store ("END10"), only into an empty discounts table
  seedDiscounts();
  bumpCatalogVersion();
  log(`done: ${products.length} products, ${variants.length} variants, ${media.length} media, ${collections.length} collections, ${pages.length} pages, ${articles.length} articles, ${files.size} files, ${translations.length} translations`);
  if (stockNotes.length) log(`stock estimates: ${stockNotes.length} variants without warehouse data were set to 100`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
