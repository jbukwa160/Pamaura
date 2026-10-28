// In-memory catalog loaded from SQLite. The shop has tens of products, so rendering reads plain
// objects instead of querying per property. The cache reloads when meta.catalog_version changes.
import { catalogVersion, getDb, getSetting } from "./db";

export interface ProductOption {
  name: string;
  values: string[];
}
export interface Variant {
  id: number;
  product_id: number;
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
  requires_shipping: boolean;
  taxable: boolean;
  weight: number;
  weight_unit: string;
  image_id: number | null;
  created_at: string;
  updated_at: string;
  market_prices: Record<string, { price: number; compare_at_price: number | null }>;
}
export interface VideoSource {
  format: string;
  mime_type: string;
  url: string; // file name (videos folder) or absolute URL
  width: number;
  height: number;
}
export interface Media {
  id: number;
  image_id: number | null;
  product_id: number | null;
  position: number;
  media_type: "image" | "video" | "external_video" | "model";
  alt: string | null;
  file: string | null;
  width: number | null;
  height: number | null;
  sources: VideoSource[];
  /** video length in ms */
  duration: number | null;
  created_at: string | null;
  updated_at: string | null;
  external_id: string | null;
  host: string | null;
  variant_ids: number[];
}
export interface Product {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  template_suffix: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  seo_title: string | null;
  seo_description: string | null;
  options: ProductOption[];
  gift_card: boolean;
  variants: Variant[];
  media: Media[];
}
export interface Collection {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  image_file: string | null;
  image_alt: string | null;
  sort_order: string;
  template_suffix: string | null;
  published: boolean;
  published_at: string | null;
  updated_at: string;
  seo_title: string | null;
  seo_description: string | null;
  rules: { disjunctive: boolean; rules: { column: string; relation: string; condition: string }[] } | null;
  all_products: boolean;
  product_ids: number[]; // manual order
}
export interface Page {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  template_suffix: string | null;
  published: boolean;
  author: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
}
export interface Blog {
  id: number;
  handle: string;
  title: string;
  template_suffix: string | null;
  commentable: string;
  created_at: string;
  updated_at: string;
}
export interface Article {
  id: number;
  blog_id: number;
  handle: string;
  title: string;
  author: string;
  body_html: string;
  summary_html: string;
  image_file: string | null;
  image_alt: string | null;
  tags: string[];
  template_suffix: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  seo_title: string | null;
  seo_description: string | null;
}
export interface MenuItem {
  title: string;
  url: string;
  items: MenuItem[];
}
export interface Menu {
  handle: string;
  title: string;
  items: MenuItem[];
}
export interface FileRec {
  /** key: the file name for Content → Files, "<folder>/<name>" for products / collections / articles images */
  name: string;
  /** the file name inside its folder */
  plain: string;
  folder: string;
  mime: string;
  width: number | null;
  height: number | null;
  size: number;
  alt: string | null;
  version: string;
  meta: { sources?: VideoSource[]; preview?: string | null; width?: number; height?: number; media_id?: number } | null;
}
export interface Metafield {
  namespace: string;
  key: string;
  type: string;
  value: string;
}
export interface Metaobject {
  id: number;
  type: string;
  handle: string;
  fields: Record<string, { type: string; value: string }>;
}
export interface Market {
  handle: string; // bg, ro
  path: string; // url prefix without slash: bg-bg
  name: string;
  country: string; // BG
  country_name: string;
  language: string; // bg
  language_name: string; // endonym
  currency: string; // EUR
  currency_symbol: string;
  rate: number; // shop currency → market currency
  rounding: "none" | "whole_up" | "whole" | "99";
  money_format: string;
  money_with_currency_format: string;
  enabled: boolean;
  primary: boolean;
}
export interface ShopInfo {
  name: string;
  email: string;
  phone: string;
  domain: string; // public host, e.g. pamaura.com
  description: string;
  currency: string; // shop (base) currency
  timezone: string;
  primary_locale: string;
  taxes_included: boolean;
  address: { street: string; city: string; zip: string; province: string; country: string; company: string };
  myshopify_domain: string;
  customer_accounts_enabled: boolean;
  password_enabled: boolean;
  password_message: string;
}

export interface Catalog {
  version: string;
  products: Product[];
  productById: Map<number, Product>;
  productByHandle: Map<string, Product>;
  variantById: Map<number, Variant>;
  mediaById: Map<number, Media>;
  collections: Collection[];
  collectionById: Map<number, Collection>;
  collectionByHandle: Map<string, Collection>;
  pages: Page[];
  pageByHandle: Map<string, Page>;
  pageById: Map<number, Page>;
  blogs: Blog[];
  blogByHandle: Map<string, Blog>;
  blogById: Map<number, Blog>;
  articles: Article[];
  articleById: Map<number, Article>;
  menus: Map<string, Menu>;
  files: Map<string, FileRec>;
  metafields: Map<string, Metafield[]>; // key: owner_type:owner_id
  metaobjects: Map<number, Metaobject>;
  metaobjectByHandle: Map<string, Metaobject>; // type/handle
  translations: Map<string, Map<string, string>>; // locale → owner_type:owner_id:field → value
  redirects: Map<string, string>;
  shop: ShopInfo;
  markets: Market[];
}

const DEFAULT_SHOP: ShopInfo = {
  name: "PAMAURA",
  email: "hello@pamaura.com",
  phone: "+359 886 537 710",
  domain: "pamaura.com",
  description: "",
  currency: "EUR",
  timezone: "Europe/Sofia",
  primary_locale: "bg",
  taxes_included: true,
  address: { street: "ул. Иван Радоев 34", city: "София", zip: "", province: "", country: "Bulgaria", company: "ДИЛОН ЕООД" },
  myshopify_domain: "pamaura-2-rz.myshopify.com",
  customer_accounts_enabled: true,
  password_enabled: false,
  password_message: "",
};

export const DEFAULT_MARKETS: Market[] = [
  {
    handle: "bg",
    path: "bg-bg",
    name: "Bulgaria",
    country: "BG",
    country_name: "България",
    language: "bg",
    language_name: "български",
    currency: "EUR",
    currency_symbol: "€",
    rate: 1,
    rounding: "none",
    money_format: "€{{amount_with_comma_separator}}",
    money_with_currency_format: "€{{amount_with_comma_separator}} EUR",
    enabled: true,
    primary: true,
  },
  {
    handle: "ro",
    path: "ro-ro",
    name: "Romania",
    country: "RO",
    country_name: "România",
    language: "ro",
    language_name: "română",
    currency: "RON",
    currency_symbol: "Lei",
    rate: 5.4562554,
    rounding: "whole_up",
    money_format: "{{amount_with_comma_separator}} lei",
    money_with_currency_format: "{{amount_with_comma_separator}} RON",
    enabled: true,
    primary: false,
  },
];

let cached: Catalog | null = null;
let checkedAt = 0;

const j = <T>(s: string | null | undefined, d: T): T => {
  if (!s) return d;
  try {
    return JSON.parse(s) as T;
  } catch {
    return d;
  }
};

export function getCatalog(): Catalog {
  const now = Date.now();
  if (cached && now - checkedAt < 1000) return cached;
  checkedAt = now;
  const v = catalogVersion();
  if (cached && cached.version === v) return cached;
  cached = loadCatalog(v);
  return cached;
}

export function invalidateCatalog() {
  cached = null;
}

type Row = Record<string, unknown>;

function loadCatalog(version: string): Catalog {
  const db = getDb();
  const s = (x: unknown) => (x === null || x === undefined ? null : String(x));

  const marketPrices = new Map<number, Variant["market_prices"]>();
  for (const r of db.prepare("SELECT * FROM variant_market_prices").all() as Row[]) {
    const id = Number(r.variant_id);
    const m = marketPrices.get(id) || {};
    m[String(r.market)] = { price: Number(r.price), compare_at_price: r.compare_at_price == null ? null : Number(r.compare_at_price) };
    marketPrices.set(id, m);
  }

  const variantsByProduct = new Map<number, Variant[]>();
  const variantById = new Map<number, Variant>();
  for (const r of db.prepare("SELECT * FROM variants ORDER BY product_id, position").all() as Row[]) {
    const v: Variant = {
      id: Number(r.id),
      product_id: Number(r.product_id),
      position: Number(r.position),
      title: String(r.title),
      option1: s(r.option1),
      option2: s(r.option2),
      option3: s(r.option3),
      sku: String(r.sku ?? ""),
      barcode: String(r.barcode ?? ""),
      price: Number(r.price),
      compare_at_price: r.compare_at_price == null ? null : Number(r.compare_at_price),
      inventory_management: s(r.inventory_management),
      inventory_policy: String(r.inventory_policy),
      inventory_quantity: Number(r.inventory_quantity),
      requires_shipping: !!r.requires_shipping,
      taxable: !!r.taxable,
      weight: Number(r.weight),
      weight_unit: String(r.weight_unit),
      image_id: r.image_id == null ? null : Number(r.image_id),
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      market_prices: marketPrices.get(Number(r.id)) || {},
    };
    variantById.set(v.id, v);
    const list = variantsByProduct.get(v.product_id) || [];
    list.push(v);
    variantsByProduct.set(v.product_id, list);
  }

  const mediaByProduct = new Map<number, Media[]>();
  const mediaById = new Map<number, Media>();
  for (const r of db.prepare("SELECT * FROM media ORDER BY product_id, position").all() as Row[]) {
    const m: Media = {
      id: Number(r.id),
      image_id: r.image_id == null ? null : Number(r.image_id),
      product_id: r.product_id == null ? null : Number(r.product_id),
      position: Number(r.position),
      media_type: String(r.media_type) as Media["media_type"],
      alt: s(r.alt),
      file: s(r.file),
      width: r.width == null ? null : Number(r.width),
      height: r.height == null ? null : Number(r.height),
      sources: j(s(r.sources), []),
      duration: r.duration == null ? null : Number(r.duration),
      created_at: s(r.created_at),
      updated_at: s(r.updated_at),
      external_id: s(r.external_id),
      host: s(r.host),
      variant_ids: j(s(r.variant_ids), []),
    };
    if (!mediaById.has(m.id)) mediaById.set(m.id, m);
    if (m.product_id != null) {
      const list = mediaByProduct.get(m.product_id) || [];
      list.push(m);
      mediaByProduct.set(m.product_id, list);
    }
  }

  const products: Product[] = (db.prepare("SELECT * FROM products ORDER BY id").all() as Row[]).map((r) => ({
    id: Number(r.id),
    handle: String(r.handle),
    title: String(r.title),
    body_html: String(r.body_html ?? ""),
    vendor: String(r.vendor ?? ""),
    product_type: String(r.product_type ?? ""),
    tags: j(s(r.tags), []),
    template_suffix: s(r.template_suffix) || null,
    status: String(r.status),
    published_at: s(r.published_at),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    seo_title: s(r.seo_title),
    seo_description: s(r.seo_description),
    options: j(s(r.options), []),
    gift_card: !!r.gift_card,
    variants: variantsByProduct.get(Number(r.id)) || [],
    media: mediaByProduct.get(Number(r.id)) || [],
  }));

  const cp = new Map<number, number[]>();
  for (const r of db.prepare("SELECT collection_id, product_id FROM collection_products ORDER BY collection_id, position").all() as Row[]) {
    const list = cp.get(Number(r.collection_id)) || [];
    list.push(Number(r.product_id));
    cp.set(Number(r.collection_id), list);
  }
  const collections: Collection[] = (db.prepare("SELECT * FROM collections ORDER BY id").all() as Row[]).map((r) => ({
    id: Number(r.id),
    handle: String(r.handle),
    title: String(r.title),
    body_html: String(r.body_html ?? ""),
    image_file: s(r.image_file),
    image_alt: s(r.image_alt),
    sort_order: String(r.sort_order),
    template_suffix: s(r.template_suffix) || null,
    published: !!r.published,
    published_at: s(r.published_at),
    updated_at: String(r.updated_at),
    seo_title: s(r.seo_title),
    seo_description: s(r.seo_description),
    rules: j(s(r.rules), null),
    all_products: !!r.all_products,
    product_ids: cp.get(Number(r.id)) || [],
  }));

  const pages: Page[] = (db.prepare("SELECT * FROM pages ORDER BY id").all() as Row[]).map((r) => ({
    id: Number(r.id),
    handle: String(r.handle),
    title: String(r.title),
    body_html: String(r.body_html ?? ""),
    template_suffix: s(r.template_suffix) || null,
    published: !!r.published,
    author: s(r.author),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    published_at: s(r.published_at),
    seo_title: s(r.seo_title),
    seo_description: s(r.seo_description),
  }));
  const blogs: Blog[] = (db.prepare("SELECT * FROM blogs ORDER BY id").all() as Row[]).map((r) => ({
    id: Number(r.id),
    handle: String(r.handle),
    title: String(r.title),
    template_suffix: s(r.template_suffix) || null,
    commentable: String(r.commentable),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
  const articles: Article[] = (db.prepare("SELECT * FROM articles ORDER BY published_at DESC, id DESC").all() as Row[]).map((r) => ({
    id: Number(r.id),
    blog_id: Number(r.blog_id),
    handle: String(r.handle),
    title: String(r.title),
    author: String(r.author ?? ""),
    body_html: String(r.body_html ?? ""),
    summary_html: String(r.summary_html ?? ""),
    image_file: s(r.image_file),
    image_alt: s(r.image_alt),
    tags: j(s(r.tags), []),
    template_suffix: s(r.template_suffix) || null,
    published: !!r.published,
    published_at: s(r.published_at),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    seo_title: s(r.seo_title),
    seo_description: s(r.seo_description),
  }));

  const menus = new Map<string, Menu>();
  for (const r of db.prepare("SELECT * FROM menus").all() as Row[]) {
    menus.set(String(r.handle), { handle: String(r.handle), title: String(r.title), items: j(s(r.items), []) });
  }
  const files = new Map<string, FileRec>();
  for (const r of db.prepare("SELECT * FROM files").all() as Row[]) {
    const folder = String(r.folder);
    const key = String(r.name);
    files.set(key, {
      name: key,
      plain: folder !== "files" && key.startsWith(folder + "/") ? key.slice(folder.length + 1) : key,
      folder,
      mime: String(r.mime),
      width: r.width == null ? null : Number(r.width),
      height: r.height == null ? null : Number(r.height),
      size: Number(r.size),
      alt: s(r.alt),
      version: String(r.version),
      meta: j(s(r.meta), null),
    });
  }
  const metafields = new Map<string, Metafield[]>();
  for (const r of db.prepare("SELECT * FROM metafields").all() as Row[]) {
    const k = `${r.owner_type}:${r.owner_id}`;
    const list = metafields.get(k) || [];
    list.push({ namespace: String(r.namespace), key: String(r.key), type: String(r.type), value: String(r.value) });
    metafields.set(k, list);
  }
  // Shopify's standard product rating metafields, computed from our reviews (as Judge.me kept them)
  const stats = db
    .prepare("SELECT product_id AS id, COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE status = 'published' AND product_id IS NOT NULL GROUP BY product_id")
    .all() as { id: number; n: number; avg: number }[];
  for (const st of stats) {
    const k = `product:${st.id}`;
    const list = (metafields.get(k) || []).filter((m) => m.namespace !== "reviews");
    const avg = (Math.round(st.avg * 100) / 100).toFixed(2);
    list.push({ namespace: "reviews", key: "rating", type: "rating", value: JSON.stringify({ value: avg, scale_min: "1.0", scale_max: "5.0" }) });
    list.push({ namespace: "reviews", key: "rating_count", type: "number_integer", value: String(st.n) });
    metafields.set(k, list);
  }
  const metaobjects = new Map<number, Metaobject>();
  const metaobjectByHandle = new Map<string, Metaobject>();
  for (const r of db.prepare("SELECT * FROM metaobjects").all() as Row[]) {
    const mo: Metaobject = { id: Number(r.id), type: String(r.type), handle: String(r.handle), fields: j(s(r.fields), {}) };
    metaobjects.set(mo.id, mo);
    metaobjectByHandle.set(`${mo.type}/${mo.handle}`, mo);
  }
  const translations = new Map<string, Map<string, string>>();
  for (const r of db.prepare("SELECT * FROM translations").all() as Row[]) {
    const loc = String(r.locale);
    const m = translations.get(loc) || new Map<string, string>();
    m.set(`${r.owner_type}:${r.owner_id}:${r.field}`, String(r.value));
    translations.set(loc, m);
  }
  const redirects = new Map<string, string>();
  for (const r of db.prepare("SELECT * FROM redirects").all() as Row[]) redirects.set(String(r.path), String(r.target));

  const shop = { ...DEFAULT_SHOP, ...getSetting<Partial<ShopInfo>>("shop", {}) };
  const markets = getSetting<Market[]>("markets", DEFAULT_MARKETS);

  return {
    version,
    products,
    productById: new Map(products.map((p) => [p.id, p])),
    productByHandle: new Map(products.map((p) => [p.handle, p])),
    variantById,
    mediaById,
    collections,
    collectionById: new Map(collections.map((c) => [c.id, c])),
    collectionByHandle: new Map(collections.map((c) => [c.handle, c])),
    pages,
    pageByHandle: new Map(pages.map((p) => [p.handle, p])),
    pageById: new Map(pages.map((p) => [p.id, p])),
    blogs,
    blogByHandle: new Map(blogs.map((b) => [b.handle, b])),
    blogById: new Map(blogs.map((b) => [b.id, b])),
    articles,
    articleById: new Map(articles.map((a) => [a.id, a])),
    menus,
    files,
    metafields,
    metaobjects,
    metaobjectByHandle,
    translations,
    redirects,
    shop,
    markets,
  };
}

export function isPublished(p: Product) {
  return p.status === "active" && !!p.published_at;
}

/** Price of a variant in a market's currency (minor units). */
export function marketPrice(v: Variant, market: Market): { price: number; compare_at_price: number | null } {
  const explicit = v.market_prices[market.handle];
  if (explicit) return explicit;
  if (market.rate === 1 && market.rounding === "none") return { price: v.price, compare_at_price: v.compare_at_price };
  return {
    price: convertPrice(v.price, market),
    compare_at_price: v.compare_at_price == null ? null : convertPrice(v.compare_at_price, market),
  };
}

/** Converts a shop-currency amount (minor units) into the market currency, with its rounding rule. */
export function convertPrice(cents: number, market: Market): number {
  if (market.rate === 1 && market.rounding === "none") return cents;
  const raw = (cents * market.rate) / 100; // in major units
  let major: number;
  switch (market.rounding) {
    case "whole_up":
      major = Math.ceil(raw - 1e-9);
      break;
    case "whole":
      major = Math.round(raw);
      break;
    case "99":
      major = Math.ceil(raw - 1e-9) - 0.01;
      break;
    default:
      major = Math.round(raw * 100) / 100;
  }
  return Math.round(major * 100);
}

/** Converts a non-price amount (e.g. a free-shipping threshold) without price rounding. */
export function convertAmount(cents: number, market: Market): number {
  return Math.round(cents * market.rate);
}
