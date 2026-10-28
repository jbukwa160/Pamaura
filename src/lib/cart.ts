// Server-side cart with Shopify's AJAX cart semantics (line keys, properties, /cart/*.js JSON).
import crypto from "node:crypto";
import { getCatalog, isPublished, marketPrice, type Catalog, type Market, type Product, type Variant } from "./catalog";
import { getDb, nowIso } from "./db";

export interface CartItem {
  key: string;
  variant_id: number;
  quantity: number;
  properties: Record<string, string>;
}
export interface CartData {
  token: string;
  market: string;
  note: string | null;
  attributes: Record<string, string>;
  items: CartItem[];
  discount_code: string | null;
  customer_id: number | null;
  created_at: string;
  updated_at: string;
  /** not persisted: true when the cart has no row yet */
  transient?: boolean;
}

export const CART_COOKIE = "cart";

export function newCartToken() {
  return crypto.randomBytes(16).toString("hex");
}

export function emptyCart(token: string, market: string): CartData {
  const now = nowIso();
  return { token, market, note: null, attributes: {}, items: [], discount_code: null, customer_id: null, created_at: now, updated_at: now, transient: true };
}

export function loadCart(token: string | null | undefined, market: string): CartData {
  if (token && /^[a-f0-9]{16,64}$/.test(token)) {
    const row = getDb().prepare("SELECT * FROM carts WHERE token = ?").get(token) as Record<string, unknown> | undefined;
    if (row) {
      return {
        token,
        market: String(row.market),
        note: (row.note as string) ?? null,
        attributes: JSON.parse(String(row.attributes || "{}")),
        items: JSON.parse(String(row.items || "[]")),
        discount_code: (row.discount_code as string) ?? null,
        customer_id: (row.customer_id as number) ?? null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      };
    }
    return emptyCart(token, market);
  }
  return emptyCart(newCartToken(), market);
}

export function saveCart(cart: CartData) {
  cart.updated_at = nowIso();
  getDb()
    .prepare(
      `INSERT INTO carts(token, market, note, attributes, items, discount_code, customer_id, created_at, updated_at)
       VALUES(@token, @market, @note, @attributes, @items, @discount_code, @customer_id, @created_at, @updated_at)
       ON CONFLICT(token) DO UPDATE SET market=excluded.market, note=excluded.note, attributes=excluded.attributes,
       items=excluded.items, discount_code=excluded.discount_code, customer_id=excluded.customer_id, updated_at=excluded.updated_at`,
    )
    .run({ ...cart, attributes: JSON.stringify(cart.attributes), items: JSON.stringify(cart.items) });
  cart.transient = false;
}

export function deleteCart(token: string) {
  getDb().prepare("DELETE FROM carts WHERE token = ?").run(token);
}

export function lineKey(variantId: number, properties: Record<string, string>) {
  const h = crypto.createHash("md5").update(JSON.stringify(sortObj(properties))).digest("hex");
  return `${variantId}:${h}`;
}

function sortObj(o: Record<string, string>) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

export class CartError extends Error {
  constructor(
    public status: number,
    public description: string,
    public messageText = "Cart Error",
  ) {
    super(description);
  }
}

export function findVariant(cat: Catalog, id: number): { v: Variant; p: Product } | null {
  const v = cat.variantById.get(id);
  if (!v) return null;
  const p = cat.productById.get(v.product_id);
  if (!p || !isPublished(p)) return null;
  return { v, p };
}

function tracked(v: Variant) {
  return !!v.inventory_management && v.inventory_policy !== "continue";
}

const MESSAGES: Record<string, Record<string, string>> = {
  bg: {
    sold_out: "Продуктът {{title}} е изчерпан.",
    all_in_cart: "Всички {{qty}} {{title}} са във вашата количка.",
    not_found: "Не може да се намери вариант",
    only_some: "Можете да добавите само {{qty}} {{title}} в количката си.",
  },
  ro: {
    sold_out: "Produsul {{title}} nu mai este în stoc.",
    all_in_cart: "Toate cele {{qty}} {{title}} sunt în coș.",
    not_found: "Nu se poate găsi varianta",
    only_some: "Puteți adăuga doar {{qty}} {{title}} în coș.",
  },
  en: {
    sold_out: "The product '{{title}}' is already sold out.",
    all_in_cart: "All {{qty}} {{title}} are in your cart.",
    not_found: "Cannot find variant",
    only_some: "You can only add {{qty}} {{title}} to the cart.",
  },
};

export function cartMessage(locale: string, key: string, vars: Record<string, string | number> = {}) {
  const t = MESSAGES[locale]?.[key] ?? MESSAGES.en[key];
  return t.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? ""));
}

/** Adds a quantity of a variant. Returns the resulting line. */
export function addItem(cart: CartData, variantId: number, quantity: number, properties: Record<string, string>, locale: string): CartItem {
  const cat = getCatalog();
  const found = findVariant(cat, variantId);
  if (!found) throw new CartError(404, cartMessage(locale, "not_found"));
  const { v, p } = found;
  const qty = Math.max(0, Math.floor(quantity || 0)) || 1;
  const props = cleanProps(properties);
  const key = lineKey(v.id, props);
  const existing = cart.items.find((i) => i.key === key);
  const inCart = cart.items.filter((i) => i.variant_id === v.id).reduce((n, i) => n + i.quantity, 0);
  const title = p.title + (p.variants.length > 1 ? ` - ${v.title}` : "");
  if (tracked(v)) {
    if (v.inventory_quantity <= 0) throw new CartError(422, cartMessage(locale, "sold_out", { title }));
    if (inCart >= v.inventory_quantity) throw new CartError(422, cartMessage(locale, "all_in_cart", { qty: v.inventory_quantity, title }));
    if (inCart + qty > v.inventory_quantity) throw new CartError(422, cartMessage(locale, "only_some", { qty: v.inventory_quantity - inCart, title }));
  }
  if (existing) {
    existing.quantity += qty;
    return existing;
  }
  const item: CartItem = { key, variant_id: v.id, quantity: qty, properties: props };
  cart.items.push(item);
  return item;
}

function cleanProps(p: Record<string, string> | undefined) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p || {})) {
    if (v === undefined || v === null || String(v) === "") continue;
    out[String(k).slice(0, 255)] = String(v).slice(0, 2000);
  }
  return out;
}

/** Sets a line's quantity (0 removes). `id` may be a line key or a variant id; `line` is 1-based. */
export function changeItem(cart: CartData, opts: { id?: string | number; line?: number; quantity: number; properties?: Record<string, string> }, locale: string) {
  let idx = -1;
  if (opts.line) idx = opts.line - 1;
  else if (opts.id !== undefined) {
    const id = String(opts.id);
    idx = id.includes(":") ? cart.items.findIndex((i) => i.key === id) : cart.items.findIndex((i) => String(i.variant_id) === id);
  }
  if (idx < 0 || idx >= cart.items.length) throw new CartError(400, "no valid id or line parameter", "Cart Error");
  const item = cart.items[idx];
  if (opts.properties) {
    item.properties = cleanProps(opts.properties);
    item.key = lineKey(item.variant_id, item.properties);
  }
  setQuantity(cart, idx, opts.quantity, locale);
}

function setQuantity(cart: CartData, idx: number, quantity: number, locale: string) {
  const item = cart.items[idx];
  const q = Math.max(0, Math.floor(Number(quantity) || 0));
  if (q === 0) {
    cart.items.splice(idx, 1);
    return;
  }
  const found = findVariant(getCatalog(), item.variant_id);
  if (found && tracked(found.v)) {
    const others = cart.items.filter((i, j) => j !== idx && i.variant_id === item.variant_id).reduce((n, i) => n + i.quantity, 0);
    const max = Math.max(0, found.v.inventory_quantity - others);
    // Shopify caps the quantity silently on change/update
    item.quantity = Math.min(q, max);
    if (item.quantity === 0) cart.items.splice(idx, 1);
    void locale;
    return;
  }
  item.quantity = q;
}

/** /cart/update.js: updates by key/variant id (object) or by position (array). */
export function updateItems(cart: CartData, updates: Record<string, number> | number[], locale: string) {
  if (Array.isArray(updates)) {
    // apply from the end so splices do not shift positions still to process
    const pairs = updates.map((q, i) => [i, q] as const).reverse();
    for (const [i, q] of pairs) if (i < cart.items.length) setQuantity(cart, i, Number(q), locale);
    return;
  }
  for (const [id, q] of Object.entries(updates)) {
    const qty = Number(q);
    if (id.includes(":")) {
      const idx = cart.items.findIndex((i) => i.key === id);
      if (idx >= 0) setQuantity(cart, idx, qty, locale);
      continue;
    }
    const vid = Number(id);
    const idx = cart.items.findIndex((i) => i.variant_id === vid);
    if (idx >= 0) setQuantity(cart, idx, qty, locale);
    else if (qty > 0) addItem(cart, vid, qty, {}, locale);
  }
}

// ---------------------------------------------------------------------------------------------
// Priced view

export interface PricedLine {
  index: number;
  item: CartItem;
  product: Product;
  variant: Variant;
  price: number; // unit, market currency
  compare_at_price: number | null;
  line_price: number;
}
export interface PricedCart {
  lines: PricedLine[];
  item_count: number;
  total_price: number;
  original_total_price: number;
  total_discount: number;
  total_weight: number;
  requires_shipping: boolean;
}

export function priceCart(cart: CartData, market: Market, cat: Catalog = getCatalog()): PricedCart {
  const lines: PricedLine[] = [];
  cart.items.forEach((item, index) => {
    const found = findVariant(cat, item.variant_id);
    if (!found) return;
    const mp = marketPrice(found.v, market);
    lines.push({ index, item, product: found.p, variant: found.v, price: mp.price, compare_at_price: mp.compare_at_price, line_price: mp.price * item.quantity });
  });
  const total = lines.reduce((n, l) => n + l.line_price, 0);
  return {
    lines,
    item_count: lines.reduce((n, l) => n + l.item.quantity, 0),
    total_price: total,
    original_total_price: total,
    total_discount: 0,
    total_weight: lines.reduce((n, l) => n + l.variant.weight * l.item.quantity, 0),
    requires_shipping: lines.some((l) => l.variant.requires_shipping),
  };
}

/** Removes lines whose variant no longer exists or is unpublished. */
export function pruneCart(cart: CartData): boolean {
  const cat = getCatalog();
  const before = cart.items.length;
  cart.items = cart.items.filter((i) => findVariant(cat, i.variant_id));
  return cart.items.length !== before;
}
