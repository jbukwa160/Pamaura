// Per-request rendering state shared by drops, filters and tags (stored in LiquidJS globals as __s).
import type { Catalog, Market } from "../catalog";
import type { CartData } from "../cart";
import type { CustomerRec } from "../customers";

export interface FormState {
  type: string;
  posted_successfully: boolean;
  errors: Record<string, string[]> | null; // field → messages ("form" = general)
  values: Record<string, string>;
}

export interface RenderState {
  catalog: Catalog;
  market: Market;
  locale: string; // iso code of the language (bg, ro)
  host: string; // request host (pamaura.com or localhost:3005)
  origin: string; // https://pamaura.com
  path: string; // request path without market prefix, e.g. /products/x
  fullPath: string; // with prefix
  query: URLSearchParams;
  /** the request's query string as sent ("?q=scrub"), for return_to */
  rawSearch?: string;
  templateName: string; // product, collection, customers/login …
  templateSuffix: string | null;
  pageType: string;
  cart: CartData;
  customer: CustomerRec | null;
  /** The form posted on this request (if any), used by {% form %} to show errors / success. */
  postedForm: FormState | null;
  designMode: false;
  /** Section ids already rendered in this response (static sections render once). */
  themeId: number;
  /** id of the JSON template, used in section ids: template--<id>__<key> */
  templateId: number;
  /** Collected while rendering, for content_for_header */
  headExtras: string[];
  now: Date;
  csrf: string;
}

/** Market-prefixed path: /bg-bg/products/x. Root path is "/bg-bg". */
export function localePath(s: RenderState, p: string): string {
  const prefix = "/" + s.market.path;
  if (!p || p === "/") return prefix;
  if (p.startsWith(prefix + "/") || p === prefix) return p;
  return prefix + (p.startsWith("/") ? p : "/" + p);
}

/** Where forms return to: the page with its query string, like Shopify (minus Section Rendering parameters). */
export function returnTo(s: RenderState): string {
  if (!s.rawSearch) return s.fullPath;
  if (!/[?&](section_id|sections)=/.test(s.rawSearch)) return s.fullPath + s.rawSearch;
  const q = new URLSearchParams(s.rawSearch);
  q.delete("section_id");
  q.delete("sections");
  const rest = q.toString();
  return rest ? `${s.fullPath}?${rest}` : s.fullPath;
}

/** Translated field of a resource, falling back to the source value. */
export function tr(s: RenderState, ownerType: string, ownerId: number | string, field: string, fallback: string): string {
  if (s.locale === s.catalog.shop.primary_locale) return fallback;
  const m = s.catalog.translations.get(s.locale);
  if (!m) return fallback;
  const v = m.get(`${ownerType}:${ownerId}:${field}`);
  return v === undefined || v === "" ? fallback : v;
}
