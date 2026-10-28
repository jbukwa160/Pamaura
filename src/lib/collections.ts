// Collection / search listing: sorting and Shopify's default storefront filters
// (availability + price range), with the same URL parameters as Shopify.
import { marketPrice, type Product } from "./catalog";
import { getDb } from "./db";
import { shopifyText } from "./shopify-i18n";
import type { RenderState } from "./liquid/state";

export interface FilterValue {
  label: string;
  value: string;
  count: number;
  active: boolean;
  param_name: string;
  url_to_add: string;
  url_to_remove: string;
}
export interface FilterSpec {
  label: string;
  param_name: string;
  type: "list" | "boolean" | "price_range";
  presentation: string | null;
  operator: "OR" | "AND";
  values: FilterValue[];
  min_value: FilterValue | null;
  max_value: FilterValue | null;
  range_max: number | null;
  url_to_remove: string;
}

const IGNORED_PARAMS = new Set(["page", "section_id", "sections", "view", "_", "variant"]);

function minPrice(s: RenderState, p: Product) {
  const prices = p.variants.map((v) => marketPrice(v, s.market).price);
  return prices.length ? Math.min(...prices) : 0;
}
function available(p: Product) {
  return p.variants.some((v) => !v.inventory_management || v.inventory_policy === "continue" || v.inventory_quantity > 0);
}

let salesCache: { at: number; map: Map<number, number> } | null = null;
function unitsSold(): Map<number, number> {
  if (salesCache && Date.now() - salesCache.at < 60_000) return salesCache.map;
  const map = new Map<number, number>();
  const rows = getDb()
    .prepare(
      "SELECT l.product_id AS id, SUM(l.quantity) AS q FROM order_lines l JOIN orders o ON o.id = l.order_id WHERE o.status NOT IN ('cancelled') AND l.product_id IS NOT NULL GROUP BY l.product_id",
    )
    .all() as { id: number; q: number }[];
  for (const r of rows) map.set(r.id, r.q);
  salesCache = { at: Date.now(), map };
  return map;
}

export function sortProducts(s: RenderState, list: Product[], sortBy: string, manualOrder: number[]): Product[] {
  const out = [...list];
  const title = (p: Product) => p.title;
  const created = (p: Product) => p.created_at;
  switch (sortBy) {
    case "title-ascending":
      return out.sort((a, b) => title(a).localeCompare(title(b), s.locale));
    case "title-descending":
      return out.sort((a, b) => title(b).localeCompare(title(a), s.locale));
    case "price-ascending":
      return out.sort((a, b) => minPrice(s, a) - minPrice(s, b));
    case "price-descending":
      return out.sort((a, b) => minPrice(s, b) - minPrice(s, a));
    case "created-ascending":
      return out.sort((a, b) => created(a).localeCompare(created(b)));
    case "created-descending":
      return out.sort((a, b) => created(b).localeCompare(created(a)));
    case "best-selling": {
      const sold = unitsSold();
      const pos = new Map(manualOrder.map((id, i) => [id, i]));
      return out.sort((a, b) => (sold.get(b.id) || 0) - (sold.get(a.id) || 0) || (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
    }
    default: {
      if (!manualOrder.length) return out;
      const pos = new Map(manualOrder.map((id, i) => [id, i]));
      return out.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
    }
  }
}

function currentParams(s: RenderState): [string, string][] {
  const out: [string, string][] = [];
  s.query.forEach((v, k) => {
    if (!IGNORED_PARAMS.has(k)) out.push([k, v]);
  });
  return out;
}

function urlWith(base: string, params: [string, string][]) {
  if (!params.length) return base;
  const q = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  return `${base}?${q}`;
}

/** Filters for a listing; `baseUrl` is the collection / search URL (search keeps q). */
export function buildFilters(s: RenderState, products: Product[], baseUrl: string): FilterSpec[] {
  const params = currentParams(s);
  const has = (k: string, v: string) => params.some(([pk, pv]) => pk === k && pv === v);
  const without = (pred: (k: string, v: string) => boolean) => params.filter(([k, v]) => !pred(k, v));

  // Products matching every filter except the given one (Shopify counts within other filters).
  const priceGte = s.query.get("filter.v.price.gte");
  const priceLte = s.query.get("filter.v.price.lte");
  const avail = s.query.getAll("filter.v.availability");
  const byPrice = (p: Product) => {
    const price = minPrice(s, p);
    if (priceGte && price < parseMajor(priceGte)) return false;
    if (priceLte && price > parseMajor(priceLte)) return false;
    return true;
  };
  const byAvail = (p: Product) => !avail.length || avail.some((a) => (a === "1" ? available(p) : !available(p)));

  const filters: FilterSpec[] = [];
  // Shopify offers no filters on a collection without products
  if (!products.length) return filters;
  const availPool = products.filter(byPrice);
  const availValues: FilterValue[] = [
    ["1", shopifyText(s.locale, "filter.availability.in"), availPool.filter(available).length],
    ["0", shopifyText(s.locale, "filter.availability.out"), availPool.filter((p) => !available(p)).length],
  ].map(([value, label, count]) => {
    const active = has("filter.v.availability", value as string);
    return {
      label: label as string,
      value: value as string,
      count: count as number,
      active,
      param_name: "filter.v.availability",
      url_to_add: urlWith(baseUrl, [...params, ["filter.v.availability", value as string]]),
      url_to_remove: urlWith(baseUrl, without((k, v) => k === "filter.v.availability" && v === value)),
    };
  });
  filters.push({
    label: shopifyText(s.locale, "filter.availability"),
    param_name: "filter.v.availability",
    type: "list",
    presentation: "text",
    operator: "OR",
    values: availValues,
    min_value: null,
    max_value: null,
    range_max: null,
    url_to_remove: urlWith(baseUrl, without((k) => k === "filter.v.availability")),
  });

  // Shopify offers the price filter only when prices are shown in the shop currency.
  if (s.market.rate === 1) {
    const pricePool = products.filter(byAvail);
    const max = pricePool.reduce((m, p) => Math.max(m, ...p.variants.map((v) => marketPrice(v, s.market).price)), 0);
    const removePrice = urlWith(baseUrl, without((k) => k === "filter.v.price.gte" || k === "filter.v.price.lte"));
    const pv = (param: string, raw: string | null): FilterValue => ({
      label: "",
      value: raw === null ? (null as unknown as string) : (parseMajor(raw) as unknown as string),
      count: 0,
      active: raw !== null,
      param_name: param,
      url_to_add: "",
      url_to_remove: removePrice,
    });
    filters.push({
      label: shopifyText(s.locale, "filter.price"),
      param_name: "filter.v.price",
      type: "price_range",
      presentation: null,
      operator: "OR",
      values: [],
      min_value: pv("filter.v.price.gte", priceGte),
      max_value: pv("filter.v.price.lte", priceLte),
      range_max: max,
      url_to_remove: removePrice,
    });
  }
  return filters;
}

/** "12,50" / "12.5" major units → minor units */
function parseMajor(v: string): number {
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function applyFilters(s: RenderState, list: Product[], _filters: FilterSpec[]): Product[] {
  void _filters;
  const avail = s.query.getAll("filter.v.availability");
  const gte = s.query.get("filter.v.price.gte");
  const lte = s.query.get("filter.v.price.lte");
  return list.filter((p) => {
    if (avail.length && !avail.some((a) => (a === "1" ? available(p) : !available(p)))) return false;
    if (s.market.rate === 1) {
      const price = minPrice(s, p);
      if (gte && price < parseMajor(gte)) return false;
      if (lte && price > parseMajor(lte)) return false;
    }
    return true;
  });
}
