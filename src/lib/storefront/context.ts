// Request → RenderState: market from the URL prefix (/bg-bg, /ro-ro) or the localization cookie,
// the cart from the "cart" cookie, the customer from the session cookie.
import { CART_COOKIE, loadCart, pruneCart, saveCart } from "../cart";
import { getCatalog, type Market } from "../catalog";
import { CUSTOMER_COOKIE, customerFromSession } from "../customers";
import type { FormState, RenderState } from "../liquid/state";

export const LOCALIZATION_COOKIE = "localization";

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function cookie(name: string, value: string, opts: { maxAge?: number; httpOnly?: boolean; secure?: boolean; path?: string } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || "/"}`, "SameSite=Lax"];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function requestOrigin(req: Request): { origin: string; host: string; secure: boolean } {
  const url = new URL(req.url);
  const fwdHost = req.headers.get("x-forwarded-host");
  const fwdProto = req.headers.get("x-forwarded-proto");
  // `host` (theme assets, pictures: //host/cdn/…) is always the address being browsed, so the files
  // come from this server; SITE_URL only sets `origin` for public links (canonical, e-mails, sitemaps)
  const host = fwdHost || req.headers.get("host") || url.host;
  const site = process.env.SITE_URL ? new URL(process.env.SITE_URL) : null;
  const reqProto = fwdProto || url.protocol.replace(":", "");
  const origin = site ? `${site.protocol}//${site.host}` : `${reqProto}://${host}`;
  // Secure cookies when the request is https (also when SITE_URL is https and this is that host behind a proxy)
  const secure = reqProto === "https" || (site?.protocol === "https:" && site.host === host);
  return { origin, host, secure };
}

export interface ParsedPath {
  market: Market;
  prefixed: boolean;
  rest: string; // path without market prefix, starting with "/"
}

export function parseMarketPath(pathname: string, cookies: Record<string, string>): ParsedPath {
  const cat = getCatalog();
  const markets = cat.markets.filter((m) => m.enabled);
  const seg = pathname.split("/")[1] || "";
  const m = markets.find((x) => x.path === seg.toLowerCase());
  if (m) {
    const rest = pathname.slice(seg.length + 1) || "/";
    return { market: m, prefixed: true, rest };
  }
  const fromCookie = markets.find((x) => x.handle === cookies[LOCALIZATION_COOKIE] || x.country === cookies[LOCALIZATION_COOKIE]);
  return { market: fromCookie || markets.find((x) => x.primary) || markets[0], prefixed: false, rest: pathname || "/" };
}

export interface StoreRequest {
  req: Request;
  url: URL;
  cookies: Record<string, string>;
  setCookies: string[];
  state: RenderState;
  secure: boolean;
}

export function buildRequest(req: Request, parsed: ParsedPath, overrides: Partial<RenderState> = {}): StoreRequest {
  const url = new URL(req.url);
  const cookies = parseCookies(req.headers.get("cookie"));
  const { origin, host, secure } = requestOrigin(req);
  const cat = getCatalog();
  const cart = loadCart(cookies[CART_COOKIE], parsed.market.handle);
  if (cart.items.length && pruneCart(cart)) saveCart(cart);
  const customer = customerFromSession(cookies[CUSTOMER_COOKIE]);
  const state: RenderState = {
    catalog: cat,
    market: parsed.market,
    locale: parsed.market.language,
    host,
    origin,
    path: parsed.rest,
    fullPath: parsed.rest === "/" ? `/${parsed.market.path}` : `/${parsed.market.path}${encodePath(parsed.rest)}`,
    query: url.searchParams,
    rawSearch: url.search,
    templateName: "index",
    templateSuffix: null,
    pageType: "index",
    cart,
    customer,
    postedForm: null as FormState | null,
    designMode: false,
    themeId: Number(process.env.THEME_ID || 1),
    templateId: 0,
    headExtras: [],
    now: new Date(),
    csrf: "",
    ...overrides,
  };
  return { req, url, cookies, setCookies: [], state, secure };
}

/** Percent-encodes each path segment the way Shopify prints URLs (Cyrillic handles). */
export function encodePath(p: string): string {
  return p
    .split("/")
    .map((seg) => {
      try {
        return encodeURIComponent(decodeURIComponent(seg));
      } catch {
        return encodeURIComponent(seg);
      }
    })
    .join("/");
}
