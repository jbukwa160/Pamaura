// Storefront entry point: Shopify URL structure on top of this backend.
import { getCatalog, isPublished } from "../catalog";
import { DropFactory, productJson, type ProductDrop } from "../liquid/drops/catalog";
import { createEnv, renderSectionById, renderStaticSection } from "../liquid/render";
import { localePath } from "../liquid/state";
import { buildRequest, cookie, encodePath, parseCookies, parseMarketPath, LOCALIZATION_COOKIE, type StoreRequest } from "./context";
import { handleCartApi, handlePermalink, json } from "./cart-api";
import { render404, renderPredictive, renderResolved, recommendationsEnv, resolvePage } from "./pages";
import { serveCdn } from "./static";
import { handleForms } from "./forms";
import { handleAccount } from "./account";
import { robotsTxt, sitemapIndex, sitemapFor } from "./sitemap";

function withCookies(res: Response, sr: StoreRequest): Response {
  if (!sr.setCookies.length) return res;
  const headers = new Headers(res.headers);
  for (const c of sr.setCookies) headers.append("Set-Cookie", c);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function html(body: string, status = 200, extra: Record<string, string> = {}) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...extra } });
}

const AJAX_PATHS = /^\/(cart(\.js|\.json|\/.*)?|products\/[^/]+\.(js|json|oembed)|search\/suggest(\.json)?|recommendations\/products(\.json)?|localization|contact|account(\/.*)?|password)$/;

export async function handleStorefront(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/{2,}/g, "/");

  if (pathname.startsWith("/cdn/")) {
    const res = await serveCdn(req, pathname, url.searchParams);
    if (res) return res;
  }
  if (pathname === "/robots.txt") return robotsTxt(req);
  if (pathname === "/sitemap.xml") return sitemapIndex(req);

  const cookies = parseCookies(req.headers.get("cookie"));
  const parsed = parseMarketPath(pathname, cookies);
  const cat = getCatalog();

  // Shopify redirects unprefixed storefront pages to the visitor's market; AJAX endpoints work everywhere.
  if (!parsed.prefixed && !AJAX_PATHS.test(pathname) && !/^\/sitemap_/.test(pathname)) {
    const target = cat.redirects.get(decodeURI(pathname));
    const loc = target ? (target.startsWith("http") ? target : `/${parsed.market.path}${encodePath(target)}`) : `/${parsed.market.path}${pathname === "/" ? "" : pathname}${url.search}`;
    return new Response(null, { status: 302, headers: { Location: loc } });
  }
  const sm = parsed.rest.match(/^\/sitemap_(products|pages|collections|blogs|articles)_1\.xml$/);
  if (sm) return sitemapFor(req, parsed.market, sm[1]);

  const sr = buildRequest(req, parsed);
  const s = sr.state;
  const rest = parsed.rest;

  // remember the market for unprefixed AJAX calls
  if (parsed.prefixed && cookies[LOCALIZATION_COOKIE] !== parsed.market.handle) {
    sr.setCookies.push(cookie(LOCALIZATION_COOKIE, parsed.market.handle, { maxAge: 365 * 86400, secure: sr.secure }));
  }

  try {
    // ---- AJAX cart
    let m = rest.match(/^\/cart(?:\/(add|change|update|clear|shipping_rates|prepare_shipping_rates|async_shipping_rates))?(\.js|\.json)?$/);
    if (m && (m[1] || m[2])) return withCookies(await handleCartApi(sr, m[1] || "", !!m[2] || (m[1] === "shipping_rates")), sr);
    m = rest.match(/^\/cart\/(\d+:\d+(?:,\d+:\d+)*)$/);
    if (m) return withCookies(handlePermalink(sr, m[1]), sr);
    if (rest === "/cart" && req.method === "POST") return withCookies(await handleForms(sr, "cart"), sr);

    // ---- product JSON
    m = rest.match(/^\/products\/([^/]+)\.(js|json|oembed)$/);
    if (m) {
      const handle = decodeURIComponent(m[1]);
      const p = cat.productByHandle.get(handle);
      if (!p || !isPublished(p)) return json({ status: 404, message: "Not Found", description: "Not Found" }, 404);
      const f = new DropFactory(s);
      const pd = f.product(p.id) as ProductDrop;
      if (m[2] === "js") return withCookies(json(productJson(s, pd)), sr);
      return withCookies(json({ product: productJson(s, pd) }), sr);
    }

    // ---- predictive search
    if (/^\/search\/suggest(\.json)?$/.test(rest)) {
      const env = await renderPredictive(sr);
      const sectionId = url.searchParams.get("section_id");
      if (sectionId) {
        const out = await renderStaticSection(env, sectionId);
        return withCookies(html(out), sr);
      }
      const ps = env.globals.predictive_search as { resources: Record<string, unknown[]> };
      const r = ps.resources;
      return withCookies(
        json({
          resources: {
            results: {
              products: (r.products as ProductDrop[]).map((p) => ({ ...productJson(s, p), image: p.featured_image ? "https:" + String(p.featured_image.src) : null })),
              collections: (r.collections as { handle: string; title: string; url: string }[]).map((c) => ({ handle: c.handle, title: c.title, url: c.url })),
              pages: (r.pages as { handle: string; title: string; url: string }[]).map((p) => ({ handle: p.handle, title: p.title, url: p.url })),
              articles: (r.articles as { handle: string; title: string; url: string }[]).map((a) => ({ handle: a.handle, title: a.title, url: a.url })),
              queries: r.queries,
            },
          },
        }),
        sr,
      );
    }

    // ---- recommendations
    if (/^\/recommendations\/products(\.json)?$/.test(rest)) {
      const sectionId = url.searchParams.get("section_id");
      // Shopify's answers for a missing / invalid / unknown product_id
      const pid = (url.searchParams.get("product_id") || "").trim();
      const fail = (status: number, message: string, description: string) =>
        withCookies(sectionId ? html("", status) : json({ status, message, description }, status), sr);
      if (!pid) return fail(422, "Missing parameter error", "A product_id value is missing");
      if (!/^\d+$/.test(pid)) return fail(422, "Invalid parameter error", `product_id must be a number but received: ${pid}`);
      const target = s.catalog.productById.get(Number(pid));
      if (!target || !isPublished(target)) return fail(404, "Product not found", `No product with id ${pid} is published in the online store`);
      const env = recommendationsEnv(sr);
      if (sectionId) {
        const out = await renderSectionById(env, sectionId, "product", null);
        return withCookies(html(out ?? "", out === null ? 404 : 200), sr);
      }
      const rec = env.globals.recommendations as { products: ProductDrop[] };
      return withCookies(json({ intent: url.searchParams.get("intent") || "related", products: rec.products.map((p) => productJson(s, p)) }), sr);
    }

    // ---- forms & account
    if (req.method === "POST" && (rest === "/contact" || rest === "/localization")) return withCookies(await handleForms(sr, rest.slice(1)), sr);
    if (rest === "/account" || rest.startsWith("/account/")) return withCookies(await handleAccount(sr), sr);

    // ---- checkout
    if (rest === "/checkout" || rest === "/checkouts") {
      return withCookies(new Response(null, { status: 302, headers: { Location: `/checkouts/${s.cart.token}?locale=${s.market.path}` } }), sr);
    }

    // ---- pages
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const r = resolvePage(sr);
    if (!r) {
      const target = cat.redirects.get(decodeURI(rest));
      if (target) return withCookies(new Response(null, { status: 301, headers: { Location: target.startsWith("http") ? target : localePath(s, encodePath(target)) } }), sr);
      const out = await render404(sr);
      return withCookies(html(out.body, 404), sr);
    }
    const out = await renderResolved(sr, r);
    return withCookies(new Response(out.body, { status: out.status, headers: { "Content-Type": out.contentType, "Cache-Control": "no-store", "Content-Language": s.locale } }), sr);
  } catch (e) {
    console.error("[storefront]", req.method, pathname, e);
    return html(`<!doctype html><meta charset="utf-8"><title>Error</title><p>Възникна грешка. Моля, опитайте отново.</p>`, 500);
  }
}

export { createEnv };
