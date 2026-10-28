// search, predictive_search and recommendations objects.
import { isPublished, type Product } from "../../catalog";
import { applyFilters, buildFilters, sortProducts } from "../../collections";
import { getDb } from "../../db";
import { SORT_VALUES, shopifyText } from "../../shopify-i18n";
import type { Env } from "../settings";
import { localePath, tr } from "../state";
import { SDrop } from "./base";
import { ArticleDrop, FilterDrop, PageDrop, ProductDrop, handleize } from "./catalog";

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/<[^>]*>/g, " ");
}

function terms(q: string): string[] {
  return norm(q)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/** All words must occur; the last one may be a prefix (Shopify's options[prefix]=last). */
function matches(text: string, words: string[], prefixLast: boolean) {
  const t = " " + norm(text).replace(/[^\p{L}\p{N}]+/gu, " ") + " ";
  return words.every((w, i) => (i === words.length - 1 && prefixLast ? t.includes(" " + w) : t.includes(" " + w + " ") || t.includes(" " + w)));
}

function productText(env: Env, p: Product) {
  const s = env.s;
  return [
    tr(s, "product", p.id, "title", p.title),
    p.title,
    p.vendor,
    tr(s, "product", p.id, "product_type", p.product_type),
    p.tags.join(" "),
    p.variants.map((v) => `${v.title} ${v.sku}`).join(" "),
    tr(s, "product", p.id, "body_html", p.body_html),
  ].join(" ");
}

export function searchProducts(env: Env, q: string, prefixLast = true): Product[] {
  const words = terms(q);
  if (!words.length) return [];
  const cat = env.s.catalog;
  // like the live store, hidden upsell products (tag no_pdp) are found too
  const list = cat.products.filter((p) => isPublished(p) && matches(productText(env, p), words, prefixLast));
  const titleOf = (p: Product) => tr(env.s, "product", p.id, "title", p.title);
  return list.sort((a, b) => Number(matches(titleOf(b), words, prefixLast)) - Number(matches(titleOf(a), words, prefixLast)));
}

export class SearchDrop extends SDrop {
  pageSize: number | null = null;
  page = 1;
  private cached: unknown[] | null = null;
  constructor(private env: Env) {
    super({ q: env.s.query.get("q") || "" });
  }
  get terms() {
    return this.env.s.query.get("q") || "";
  }
  get performed() {
    return this.terms.trim().length > 0;
  }
  get types() {
    const t = this.env.s.query.get("type");
    return t ? t.split(",") : ["product", "page", "article"];
  }
  private productsAll(): Product[] {
    const prefix = this.env.s.query.get("options[prefix]") !== "none";
    const found = searchProducts(this.env, this.terms, prefix);
    const sortBy = this.env.s.query.get("sort_by") || "relevance";
    const sorted = sortBy === "relevance" || sortBy === "most-relevant" ? found : sortProducts(this.env.s, found, sortBy, []);
    return applyFilters(this.env.s, sorted, []);
  }
  private all(): unknown[] {
    if (this.cached) return this.cached;
    if (!this.performed) return (this.cached = []);
    const types = this.types;
    const out: unknown[] = [];
    if (types.includes("product")) for (const p of this.productsAll()) out.push(this.env.f.product(p.id));
    const words = terms(this.terms);
    if (types.includes("page")) {
      for (const pg of this.env.s.catalog.pages) {
        if (!pg.published) continue;
        const text = `${tr(this.env.s, "page", pg.id, "title", pg.title)} ${tr(this.env.s, "page", pg.id, "body_html", pg.body_html)}`;
        if (matches(text, words, true)) out.push(this.env.f.page(pg.id));
      }
    }
    if (types.includes("article")) {
      for (const a of this.env.s.catalog.articles) {
        if (!a.published) continue;
        const text = `${tr(this.env.s, "article", a.id, "title", a.title)} ${tr(this.env.s, "article", a.id, "body_html", a.body_html)} ${a.tags.join(" ")}`;
        if (matches(text, words, true)) out.push(this.env.f.article(a.id));
      }
    }
    this.cached = out.filter(Boolean);
    return this.cached;
  }
  get results() {
    const all = this.all();
    if (this.pageSize) {
      const start = (this.page - 1) * this.pageSize;
      return all.slice(start, start + this.pageSize);
    }
    return all.slice(0, 50);
  }
  get results_count() {
    return this.all().length;
  }
  paginateTotal() {
    return this.all().length;
  }
  get filters() {
    if (!this.performed) return [];
    const base = localePath(this.env.s, `/search`);
    const found = searchProducts(this.env, this.terms, this.env.s.query.get("options[prefix]") !== "none");
    return buildFilters(this.env.s, found, base + `?q=${encodeURIComponent(this.terms)}&options%5Bprefix%5D=last`).map((f) => new FilterDrop(f));
  }
  get sort_by() {
    return this.env.s.query.get("sort_by") || null;
  }
  get default_sort_by() {
    return "relevance";
  }
  get sort_options() {
    return [{ value: "relevance", name: shopifyText(this.env.s.locale, "sort.most-relevant") }, ...SORT_VALUES.filter((v) => v !== "manual" && v !== "most-relevant" && v !== "best-selling").map((v) => ({ value: v, name: shopifyText(this.env.s.locale, `sort.${v}`) }))];
  }
}

export class PredictiveSearchDrop extends SDrop {
  constructor(private env: Env) {
    super({ q: env.s.query.get("q") || "" });
  }
  private get q() {
    return (this.env.s.query.get("q") || this.env.s.query.get("query") || "").trim();
  }
  get terms() {
    return this.q;
  }
  get performed() {
    return this.q.length > 0;
  }
  private limit() {
    return Math.max(1, Math.min(10, Number(this.env.s.query.get("resources[limit]") || this.env.s.query.get("limit") || 10)));
  }
  get resources() {
    const env = this.env;
    const q = this.q;
    const words = terms(q);
    const limit = this.limit();
    const products = q ? searchProducts(env, q).slice(0, limit).map((p) => env.f.product(p.id)) : [];
    const collections = q
      ? env.s.catalog.collections
          .filter((c) => c.published && !c.all_products && matches(tr(env.s, "collection", c.id, "title", c.title), words, true))
          .slice(0, limit)
          .map((c) => env.f.collection(c.id))
      : [];
    const pages = q
      ? env.s.catalog.pages
          .filter((p) => p.published && matches(tr(env.s, "page", p.id, "title", p.title), words, true))
          .slice(0, limit)
          .map((p) => env.f.page(p.id))
      : [];
    const articles = q
      ? env.s.catalog.articles
          .filter((a) => a.published && matches(tr(env.s, "article", a.id, "title", a.title), words, true))
          .slice(0, limit)
          .map((a) => env.f.article(a.id))
      : [];
    const queries = q ? [{ text: q, styled_text: `<mark>${q.replace(/[<>&]/g, "")}</mark>`, url: localePath(env.s, `/search?q=${encodeURIComponent(q)}`) }] : [];
    return { products, collections, pages, articles, queries };
  }
}

/** Product recommendations: the Search & Discovery related list if set, then co-purchases, then shared collections. */
export class RecommendationsDrop extends SDrop {
  constructor(private env: Env) {
    super({ id: env.s.query.get("product_id") });
  }
  private productId() {
    return Number(this.env.s.query.get("product_id"));
  }
  get intent() {
    return this.env.s.query.get("intent") || "related";
  }
  get performed() {
    return !!this.env.s.catalog.productById.get(this.productId());
  }
  private list(): ProductDrop[] {
    const env = this.env;
    const cat = env.s.catalog;
    const p = cat.productById.get(this.productId());
    if (!p) return [];
    const limit = Math.max(1, Math.min(10, Number(env.s.query.get("limit") || 10)));
    const intent = this.intent;
    const key = intent === "complementary" ? "complementary_products" : "related_products";
    const mf = (cat.metafields.get(`product:${p.id}`) || []).find((m) => m.namespace === "shopify--discovery--product_recommendation" && m.key === key);
    const out: number[] = [];
    if (mf) {
      try {
        for (const gid of JSON.parse(mf.value) as string[]) {
          const id = Number(String(gid).split("/").pop());
          const rp = cat.productById.get(id);
          if (rp && isPublished(rp) && id !== p.id) out.push(id);
        }
      } catch {
        /* ignore */
      }
      return out.slice(0, limit).map((id) => env.f.product(id)!).filter(Boolean);
    }
    if (intent === "complementary") return [];
    // bought together
    const rows = getDb()
      .prepare(
        "SELECT l2.product_id AS id, COUNT(*) AS n FROM order_lines l1 JOIN order_lines l2 ON l1.order_id = l2.order_id AND l2.product_id != l1.product_id WHERE l1.product_id = ? GROUP BY l2.product_id ORDER BY n DESC LIMIT 20",
      )
      .all(p.id) as { id: number; n: number }[];
    for (const r of rows) {
      const rp = cat.productById.get(r.id);
      if (rp && isPublished(rp) && !rp.tags.includes("no_pdp")) out.push(r.id);
    }
    // same collections
    const mine = new Set(cat.collections.filter((c) => !c.all_products && c.product_ids.includes(p.id)).map((c) => c.id));
    const scored = cat.products
      .filter((x) => x.id !== p.id && isPublished(x) && !x.tags.includes("no_pdp") && !out.includes(x.id))
      .map((x) => ({ id: x.id, n: cat.collections.filter((c) => mine.has(c.id) && c.product_ids.includes(x.id)).length }))
      .sort((a, b) => b.n - a.n);
    for (const x of scored) out.push(x.id);
    return out.slice(0, limit).map((id) => env.f.product(id)!).filter(Boolean);
  }
  get products() {
    return this.list();
  }
  get products_count() {
    return this.list().length;
  }
}

export { PageDrop, ArticleDrop, handleize };
