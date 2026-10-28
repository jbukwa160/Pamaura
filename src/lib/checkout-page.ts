// Shared server helpers for the checkout and order pages (outside the theme): brand fonts, logo,
// links into the storefront.
import "server-only";
import { getCatalog, type Market } from "./catalog";
import { fontTable } from "./liquid/fonts";

/** @font-face rules for the theme's fonts (Fira Sans headings, Nunito Sans text), served from /cdn/fonts. */
export function brandFontCss(): string {
  const table = fontTable();
  const out: string[] = [];
  for (const handle of ["fira_sans_n3", "fira_sans_n4", "nunito_sans_n3", "nunito_sans_n4", "nunito_sans_n5"]) {
    const e = table.get(handle);
    if (!e) continue;
    const src = [e.woff2 && `url("/cdn/fonts/${e.dir}/${e.woff2}") format("woff2")`, e.woff && `url("/cdn/fonts/${e.dir}/${e.woff}") format("woff")`].filter(Boolean).join(", ");
    if (src) out.push(`@font-face{font-family:"${e.family}";font-weight:${e.weight};font-style:${e.style};font-display:swap;src:${src}}`);
  }
  return out.join("\n");
}

export function logoUrl(): string | null {
  const f = getCatalog().files.get("pamaura_logo_dark.svg");
  return f ? `/cdn/shop/${f.folder}/${encodeURIComponent(f.plain)}?v=${f.version}` : null;
}

export function faviconUrl(): string | null {
  const f = getCatalog().files.get("favicon.png");
  return f ? `/cdn/shop/${f.folder}/${encodeURIComponent(f.plain)}?v=${f.version}&width=48` : null;
}

/** Storefront links for a market (terms / privacy pages as the footer links them). */
export function storeLinks(market: Market) {
  const base = `/${market.path}`;
  const page = (handle: string) => `${base}/pages/${encodeURIComponent(handle)}`;
  return { home: base, cart: `${base}/cart`, terms: page("общи-условия"), privacy: page("политика-за-поверителност") };
}

/** Thumbnail URL of a stored file (order lines keep the file key). */
export function fileThumb(name: string | null, width = 160): string | null {
  if (!name) return null;
  const f = getCatalog().files.get(name);
  if (!f) return null;
  return `/cdn/shop/${f.folder}/${f.plain.split("/").map(encodeURIComponent).join("/")}?v=${f.version}&width=${width}`;
}

export const ORDER_STATUS_TEXT: Record<string, Record<string, string>> = {
  bg: { new: "Приета", confirmed: "Потвърдена", shipped: "Изпратена", delivered: "Доставена", cancelled: "Отказана", returned: "Върната" },
  ro: { new: "Primită", confirmed: "Confirmată", shipped: "Expediată", delivered: "Livrată", cancelled: "Anulată", returned: "Returnată" },
};
