// SQLite database (better-sqlite3). One file, DATA_DIR/store.db, holds the catalog and the shop data.
// DATA_DIR defaults to ../pamaura-data — outside the project, so the Next.js dev watcher never
// touches the database files (it drops SQLite locks on files it re-reads).
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Runtime data outside the code (not traced into builds).
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR || "../pamaura-data");
export const FILES_DIR = path.join(/*turbopackIgnore: true*/ DATA_DIR, "files");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Catalog ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  vendor TEXT NOT NULL DEFAULT '',
  product_type TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  template_suffix TEXT,
  status TEXT NOT NULL DEFAULT 'active',          -- active | draft | archived
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  seo_title TEXT,
  seo_description TEXT,
  options TEXT NOT NULL DEFAULT '[]',             -- [{name, values[]}]
  gift_card INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  option1 TEXT, option2 TEXT, option3 TEXT,
  sku TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,                         -- minor units of the shop currency (EUR cents)
  compare_at_price INTEGER,
  inventory_management TEXT,                      -- 'shopify' (tracked) or NULL
  inventory_policy TEXT NOT NULL DEFAULT 'deny',  -- deny | continue
  inventory_quantity INTEGER NOT NULL DEFAULT 0,
  requires_shipping INTEGER NOT NULL DEFAULT 1,
  taxable INTEGER NOT NULL DEFAULT 1,
  weight INTEGER NOT NULL DEFAULT 0,              -- grams
  weight_unit TEXT NOT NULL DEFAULT 'kg',
  image_id INTEGER,                               -- media.image_id of the variant's image
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS variants_product ON variants(product_id, position);
-- Explicit prices per market (otherwise converted with the market's rate and rounding)
CREATE TABLE IF NOT EXISTS variant_market_prices (
  variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  price INTEGER NOT NULL,
  compare_at_price INTEGER,
  PRIMARY KEY (variant_id, market)
);
CREATE TABLE IF NOT EXISTS media (
  id INTEGER NOT NULL,                            -- media id (Shopify MediaImage / Video id; shared when a file is on several products)
  image_id INTEGER,                               -- product image id (images[] in the AJAX API)
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  media_type TEXT NOT NULL,                       -- image | video | external_video
  alt TEXT,
  file TEXT,                                      -- files.name (image or video preview)
  width INTEGER, height INTEGER,
  sources TEXT,                                   -- video: [{format, mime_type, url(file), width, height}]
  duration INTEGER,                               -- video length in ms
  created_at TEXT, updated_at TEXT,               -- product image dates (images[] in the AJAX API)
  external_id TEXT, host TEXT,                    -- external_video
  variant_ids TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (product_id, id)
);
CREATE INDEX IF NOT EXISTS media_product ON media(product_id, position);
-- Uploaded files (Shopify "Files": shop_images, product images, videos)
CREATE TABLE IF NOT EXISTS files (
  name TEXT PRIMARY KEY,                          -- e.g. pamaura_logo_dark.svg, preview_images/abc.jpg
  folder TEXT NOT NULL DEFAULT 'files',           -- files | products | videos
  mime TEXT NOT NULL,
  width INTEGER, height INTEGER,
  size INTEGER NOT NULL DEFAULT 0,
  alt TEXT,
  version TEXT NOT NULL,                          -- ?v= cache buster (Shopify's value kept on import; can exceed 2^63)
  source_url TEXT,
  meta TEXT,                                      -- videos: {sources:[...], preview, width, height}
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  image_file TEXT, image_alt TEXT,
  sort_order TEXT NOT NULL DEFAULT 'manual',
  template_suffix TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  published_at TEXT,
  updated_at TEXT NOT NULL,
  seo_title TEXT, seo_description TEXT,
  rules TEXT,                                     -- smart collection: {disjunctive, rules:[{column, relation, condition}]}
  all_products INTEGER NOT NULL DEFAULT 0          -- the built-in "all" collection
);
CREATE TABLE IF NOT EXISTS collection_products (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (collection_id, product_id)
);
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  template_suffix TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  author TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT,
  seo_title TEXT, seo_description TEXT
);
CREATE TABLE IF NOT EXISTS blogs (
  id INTEGER PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  template_suffix TEXT,
  commentable TEXT NOT NULL DEFAULT 'no',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY,
  blog_id INTEGER NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  handle TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  summary_html TEXT NOT NULL DEFAULT '',
  image_file TEXT, image_alt TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  template_suffix TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  published_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  seo_title TEXT, seo_description TEXT,
  UNIQUE (blog_id, handle)
);
CREATE TABLE IF NOT EXISTS menus (
  handle TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]'                -- [{title, url, items:[...]}], url may be shopify://
);
CREATE TABLE IF NOT EXISTS metafields (
  owner_type TEXT NOT NULL,                       -- shop | product | variant | collection | page | article | blog
  owner_id INTEGER NOT NULL,
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  type TEXT NOT NULL,                             -- Shopify metafield type (rich_text_field, list.product_reference …)
  value TEXT NOT NULL,                            -- Shopify's serialized value
  PRIMARY KEY (owner_type, owner_id, namespace, key)
);
CREATE TABLE IF NOT EXISTS metaobjects (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  handle TEXT NOT NULL,
  fields TEXT NOT NULL DEFAULT '{}',              -- {key: {type, value}}
  UNIQUE (type, handle)
);
-- Translations of resources and theme content for non-default languages
CREATE TABLE IF NOT EXISTS translations (
  locale TEXT NOT NULL,
  owner_type TEXT NOT NULL,                       -- product | variant | collection | page | article | blog | menu | metafield | theme
  owner_id TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (locale, owner_type, owner_id, field)
);
CREATE TABLE IF NOT EXISTS redirects (
  path TEXT PRIMARY KEY,
  target TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Reviews (Judge.me replacement) -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT UNIQUE,
  product_id INTEGER,                             -- NULL = shop review
  rating INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  email TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  pictures TEXT NOT NULL DEFAULT '[]',
  reply TEXT,
  status TEXT NOT NULL DEFAULT 'published',      -- pending | published | hidden
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_product ON reviews(product_id, status, created_at);

-- Carts, customers, orders ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carts (
  token TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  note TEXT,
  attributes TEXT NOT NULL DEFAULT '{}',
  items TEXT NOT NULL DEFAULT '[]',               -- [{key, variant_id, quantity, properties}]
  discount_code TEXT,
  customer_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  password_hash TEXT,                             -- NULL = guest / not activated
  accepts_marketing INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  locale TEXT,
  state TEXT NOT NULL DEFAULT 'enabled',          -- enabled | disabled | invited
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  first_name TEXT, last_name TEXT, company TEXT,
  address1 TEXT, address2 TEXT, city TEXT, province TEXT, province_code TEXT,
  country TEXT, country_code TEXT, zip TEXT, phone TEXT,
  is_default INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS customer_sessions (
  token_hash TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_tokens (
  token_hash TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                             -- reset | activate
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,                 -- shown as #1001
  token TEXT NOT NULL UNIQUE,                     -- order status page key
  idempotency_key TEXT UNIQUE,
  customer_id INTEGER,
  email TEXT NOT NULL,
  phone TEXT,
  market TEXT NOT NULL,
  locale TEXT NOT NULL,
  currency TEXT NOT NULL,
  subtotal INTEGER NOT NULL,                      -- after line discounts, before order discount
  discount_total INTEGER NOT NULL DEFAULT 0,
  shipping_total INTEGER NOT NULL DEFAULT 0,
  cod_fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  tax_included INTEGER NOT NULL DEFAULT 1,
  tax_total INTEGER NOT NULL DEFAULT 0,
  discount_code TEXT,
  payment_method TEXT NOT NULL,                   -- cod | bank_transfer
  financial_status TEXT NOT NULL,                 -- pending | paid | refunded | voided
  fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled',  -- unfulfilled | fulfilled
  status TEXT NOT NULL DEFAULT 'new',             -- new | confirmed | shipped | delivered | cancelled | returned
  shipping_method TEXT NOT NULL,                  -- e.g. econt_office
  shipping_title TEXT NOT NULL,
  shipping_address TEXT NOT NULL,                 -- JSON (name, phone, address1, city, zip, office…)
  billing_address TEXT,
  note TEXT,
  admin_note TEXT,
  attributes TEXT NOT NULL DEFAULT '{}',
  tracking_number TEXT,
  tracking_company TEXT,
  tracking_url TEXT,
  waybill TEXT,                                   -- courier waybill data JSON
  cancel_reason TEXT,
  cancelled_at TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer_id, created_at);
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);
CREATE TABLE IF NOT EXISTS order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER, variant_id INTEGER,
  title TEXT NOT NULL,                            -- product title at purchase
  variant_title TEXT,
  sku TEXT,
  image TEXT,                                     -- files.name
  handle TEXT,
  quantity INTEGER NOT NULL,
  price INTEGER NOT NULL,                         -- unit price after automatic reductions
  original_price INTEGER NOT NULL,
  compare_at_price INTEGER,
  discount_allocated INTEGER NOT NULL DEFAULT 0,  -- order-level discount share
  properties TEXT NOT NULL DEFAULT '{}',
  requires_shipping INTEGER NOT NULL DEFAULT 1,
  weight INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  author TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS discounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind TEXT NOT NULL,                             -- percentage | fixed_amount | free_shipping
  value INTEGER NOT NULL DEFAULT 0,               -- percent (10 = 10 %) or cents
  min_subtotal INTEGER NOT NULL DEFAULT 0,        -- cents, shop currency
  applies_to TEXT NOT NULL DEFAULT '{"type":"all"}',
  starts_at TEXT, ends_at TEXT,
  usage_limit INTEGER,
  once_per_customer INTEGER NOT NULL DEFAULT 0,
  times_used INTEGER NOT NULL DEFAULT 0,
  combines_with_sales INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'subscribed',      -- subscribed | unsubscribed
  source TEXT,
  locale TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, email TEXT, phone TEXT, body TEXT NOT NULL,
  fields TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new',
  ip TEXT,
  created_at TEXT NOT NULL
);

-- Admin ----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_changed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ip TEXT
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_key ON rate_limits(key, at);
CREATE TABLE IF NOT EXISTS courier_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
`;

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
  const conn = new Database(path.join(DATA_DIR, "store.db"));
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.pragma("busy_timeout = 5000");
  conn.exec(SCHEMA);
  // columns added after databases were first created
  addColumn(conn, "media", "duration", "INTEGER");
  addColumn(conn, "media", "created_at", "TEXT");
  addColumn(conn, "media", "updated_at", "TEXT");
  addColumn(conn, "orders", "discount_title", "TEXT");
  db = conn;
  return conn;
}

function addColumn(conn: Database.Database, table: string, column: string, type: string) {
  const cols = conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export function nowIso() {
  return new Date().toISOString();
}

/** Bumped on every catalog change so the in-memory catalog cache reloads. */
export function bumpCatalogVersion() {
  getDb()
    .prepare("INSERT INTO meta(key, value) VALUES('catalog_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(String(Date.now()));
}

export function catalogVersion(): string {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = 'catalog_version'").get() as { value: string } | undefined;
  return row?.value || "0";
}

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown) {
  getDb()
    .prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}
