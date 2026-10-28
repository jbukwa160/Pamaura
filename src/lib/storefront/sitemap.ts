// robots.txt and sitemaps in Shopify's layout (index + per-market resource sitemaps).
import { getCatalog, isPublished, type Market } from "../catalog";
import { enc } from "../liquid/drops/catalog";
import { requestOrigin } from "./context";

const xml = (body: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function robotsTxt(req: Request) {
  const { origin } = requestOrigin(req);
  const body = `User-agent: *
Disallow: /admin
Disallow: /cart
Disallow: /checkouts/
Disallow: /checkout
Disallow: /account
Disallow: /*/cart
Disallow: /*/account
Disallow: /*/search
Disallow: /search
Disallow: /api/
Disallow: /*?*sort_by*
Disallow: /*?*filter*
Disallow: /*/recommendations/
Disallow: /*/search/suggest

Sitemap: ${origin}/sitemap.xml
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export function sitemapIndex(req: Request) {
  const { origin } = requestOrigin(req);
  const markets = getCatalog().markets.filter((m) => m.enabled);
  const items = markets.flatMap((m) => ["products", "pages", "collections", "blogs", "articles"].map((k) => `<sitemap><loc>${origin}/${m.path}/sitemap_${k}_1.xml</loc></sitemap>`));
  return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join("")}</sitemapindex>`);
}

export function sitemapFor(req: Request, market: Market, kind: string) {
  const { origin } = requestOrigin(req);
  const cat = getCatalog();
  const base = `${origin}/${market.path}`;
  const urls: { loc: string; lastmod?: string; image?: string }[] = [];
  if (kind === "products") {
    urls.push({ loc: base });
    for (const p of cat.products.filter(isPublished)) {
      const img = p.media.find((m) => m.media_type === "image" && m.file);
      urls.push({ loc: `${base}/products/${enc(p.handle)}`, lastmod: p.updated_at, image: img?.file ? `${origin}/cdn/shop/files/${encodeURIComponent(img.file)}` : undefined });
    }
  } else if (kind === "collections") {
    for (const c of cat.collections.filter((c) => c.published)) urls.push({ loc: `${base}/collections/${enc(c.handle)}`, lastmod: c.updated_at });
  } else if (kind === "pages") {
    for (const p of cat.pages.filter((p) => p.published)) urls.push({ loc: `${base}/pages/${enc(p.handle)}`, lastmod: p.updated_at });
  } else if (kind === "blogs") {
    for (const b of cat.blogs) urls.push({ loc: `${base}/blogs/${enc(b.handle)}`, lastmod: b.updated_at });
  } else if (kind === "articles") {
    for (const a of cat.articles.filter((a) => a.published)) {
      const b = cat.blogById.get(a.blog_id);
      if (b) urls.push({ loc: `${base}/blogs/${enc(b.handle)}/${enc(a.handle)}`, lastmod: a.updated_at });
    }
  }
  const body = urls
    .map(
      (u) =>
        `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : ""}<changefreq>daily</changefreq>${u.image ? `<image:image><image:loc>${esc(u.image)}</image:loc></image:image>` : ""}</url>`,
    )
    .join("");
  return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${body}</urlset>`);
}
