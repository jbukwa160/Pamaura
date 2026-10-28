// Resolves a storefront path to a theme template + Liquid objects, and renders it.
import { isPublished } from "../catalog";
import { createEnv, renderPage, renderSectionById, type PageEnv, type PageObjects } from "../liquid/render";
import { enc, type ProductDrop } from "../liquid/drops/catalog";
import { tr } from "../liquid/state";
import { SearchDrop, PredictiveSearchDrop, RecommendationsDrop } from "../liquid/drops/search";
import type { StoreRequest } from "./context";
import { getSetting } from "../db";

const SYSTEM_TITLES: Record<string, Record<string, string>> = {
  bg: {
    cart: "Вашата количка за пазаруване",
    account: "Профил",
    login: "Профил",
    register: "Създаване на профил",
    addresses: "Адреси",
    order: "Поръчка",
    reset_password: "Нулиране на паролата",
    activate_account: "Активиране на профил",
    collections: "Колекции",
    "404": "404 Не е открито",
    search: "Търсене",
    password: "PAMAURA",
  },
  ro: {
    cart: "Coșul tău de cumpărături",
    account: "Cont",
    login: "Cont",
    register: "Creează un cont",
    addresses: "Adrese",
    order: "Comandă",
    reset_password: "Resetează parola",
    activate_account: "Activează contul",
    collections: "Colecții",
    "404": "404 negăsit",
    search: "Căutare",
    password: "PAMAURA",
  },
};

export function systemTitle(locale: string, key: string) {
  return SYSTEM_TITLES[locale]?.[key] ?? SYSTEM_TITLES.bg[key] ?? key;
}

export interface SeoHome {
  title: Record<string, string>;
  description: Record<string, string>;
}
export const DEFAULT_SEO_HOME: SeoHome = {
  title: { bg: "PAMAURA - козметика от пшеница", ro: "PAMAURA - produse cosmetice din grâu" },
  description: {
    bg: "В сърцевината на Pamaura се крие златната ни съставка - пшеницата и вдъхновението да се възползваме от нейните безценни блага.",
    ro: "În centrul Pamaura se află ingredientul nostru de aur - grâul și inspirația de a profita de bunurile sale neprețuite.",
  },
};

export function shopDescription(locale: string) {
  const seo = { ...DEFAULT_SEO_HOME, ...getSetting<Partial<SeoHome>>("seo.home", {}) };
  return seo.description[locale] ?? seo.description.bg ?? "";
}

function autoDescription(html: string) {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 320 ? text.slice(0, 320) : text;
}

export interface Resolved {
  status: number;
  template: string;
  suffix: string | null;
  pageType: string;
  objects: PageObjects;
  title: string;
  description: string | null;
  canonical: string;
  handle?: string | null;
  redirect?: string;
}

/** Maps a market-relative path to a template and its objects. Returns null for 404. */
export function resolvePage(sr: StoreRequest, env: PageEnv | null = null): Resolved | null {
  void env;
  const s = sr.state;
  const cat = s.catalog;
  const path = s.path;
  const L = s.locale;
  const canon = (p: string) => `${s.origin}/${s.market.path}${p === "/" ? "" : p}`;
  const view = sr.url.searchParams.get("view");
  const seg = path.split("/").filter(Boolean).map((x) => {
    try {
      return decodeURIComponent(x);
    } catch {
      return x;
    }
  });

  if (path === "/" || path === "") {
    const seo = { ...DEFAULT_SEO_HOME, ...getSetting<Partial<SeoHome>>("seo.home", {}) };
    return { status: 200, template: "index", suffix: view, pageType: "index", objects: {}, title: seo.title[L] ?? seo.title.bg, description: seo.description[L] ?? seo.description.bg, canonical: canon("/") };
  }

  // /products/<handle>, /collections/<c>/products/<handle>
  if ((seg[0] === "products" && seg.length === 2) || (seg[0] === "collections" && seg[2] === "products" && seg.length === 4)) {
    const handle = seg[0] === "products" ? seg[1] : seg[3];
    const p = cat.productByHandle.get(handle);
    if (!p || !isPublished(p)) return null;
    const objects: PageObjects = {};
    const title = tr(s, "product", p.id, "seo_title", p.seo_title || "") || tr(s, "product", p.id, "title", p.title);
    const desc = tr(s, "product", p.id, "seo_description", p.seo_description || "") || autoDescription(tr(s, "product", p.id, "body_html", p.body_html));
    const res: Resolved = { status: 200, template: "product", suffix: view || p.template_suffix, pageType: "product", objects, title, description: desc || null, canonical: canon(`/products/${enc(p.handle)}`), handle: p.handle };
    if (seg[0] === "collections") {
      const c = cat.collectionByHandle.get(seg[1]);
      if (c && c.published) objects.__collectionHandle = c.handle;
    }
    objects.__productId = p.id;
    return res;
  }

  if (seg[0] === "collections" && seg.length === 1) {
    return { status: 200, template: "list-collections", suffix: view, pageType: "list-collections", objects: {}, title: systemTitle(L, "collections"), description: shopDescription(L), canonical: canon("/collections") };
  }
  if (seg[0] === "collections" && seg.length === 2) {
    const c = cat.collectionByHandle.get(seg[1]);
    if (!c || !c.published) return null;
    const title = tr(s, "collection", c.id, "seo_title", c.seo_title || "") || tr(s, "collection", c.id, "title", c.title);
    const desc = tr(s, "collection", c.id, "seo_description", c.seo_description || "") || autoDescription(tr(s, "collection", c.id, "body_html", c.body_html)) || null;
    return { status: 200, template: "collection", suffix: view || c.template_suffix, pageType: "collection", objects: { __collectionId: c.id }, title, description: desc, canonical: canon(`/collections/${enc(c.handle)}`), handle: c.handle };
  }
  if (seg[0] === "pages" && seg.length === 2) {
    const p = cat.pageByHandle.get(seg[1]);
    if (!p || !p.published) return null;
    const title = tr(s, "page", p.id, "seo_title", p.seo_title || "") || tr(s, "page", p.id, "title", p.title);
    const desc = tr(s, "page", p.id, "seo_description", p.seo_description || "") || autoDescription(tr(s, "page", p.id, "body_html", p.body_html)) || null;
    return { status: 200, template: "page", suffix: view || p.template_suffix, pageType: "page", objects: { __pageId: p.id }, title, description: desc, canonical: canon(`/pages/${enc(p.handle)}`), handle: p.handle };
  }
  if (seg[0] === "blogs" && (seg.length === 2 || (seg.length === 4 && seg[2] === "tagged"))) {
    const b = cat.blogByHandle.get(seg[1]);
    if (!b) return null;
    const title = tr(s, "blog", b.id, "title", b.title);
    return { status: 200, template: "blog", suffix: view || b.template_suffix, pageType: "blog", objects: { __blogId: b.id, current_tags: seg[3] ? [seg[3]] : null }, title, description: shopDescription(L), canonical: canon(`/blogs/${enc(b.handle)}`), handle: b.handle };
  }
  if (seg[0] === "blogs" && seg.length === 3) {
    const b = cat.blogByHandle.get(seg[1]);
    const a = b && cat.articles.find((x) => x.blog_id === b.id && x.handle === seg[2] && x.published);
    if (!b || !a) return null;
    const title = tr(s, "article", a.id, "seo_title", a.seo_title || "") || tr(s, "article", a.id, "title", a.title);
    const desc = tr(s, "article", a.id, "seo_description", a.seo_description || "") || autoDescription(tr(s, "article", a.id, "summary_html", a.summary_html) || tr(s, "article", a.id, "body_html", a.body_html)) || null;
    return { status: 200, template: "article", suffix: view || a.template_suffix, pageType: "article", objects: { __blogId: b.id, __articleId: a.id }, title, description: desc, canonical: canon(`/blogs/${enc(b.handle)}/${enc(a.handle)}`), handle: a.handle };
  }
  if (seg[0] === "search" && seg.length === 1) {
    return { status: 200, template: "search", suffix: view, pageType: "search", objects: { __search: true }, title: systemTitle(L, "search"), description: shopDescription(L), canonical: canon("/search") };
  }
  if (seg[0] === "cart" && seg.length === 1) {
    return { status: 200, template: "cart", suffix: view, pageType: "cart", objects: {}, title: systemTitle(L, "cart"), description: shopDescription(L), canonical: canon("/cart") };
  }
  return null;
}

/** Builds the Liquid objects for a resolved page and renders it (or one section of it). */
export async function renderResolved(sr: StoreRequest, r: Resolved): Promise<{ body: string; contentType: string; status: number }> {
  const s = sr.state;
  s.templateName = r.template;
  s.templateSuffix = r.suffix && r.template !== "customers/order" ? r.suffix : r.suffix;
  s.pageType = r.pageType;
  const env = createEnv(s, {}, { pageTitle: r.title, pageDescription: r.description, canonicalUrl: r.canonical, handle: r.handle ?? null });
  const f = env.f;
  const o = r.objects;
  const g = env.globals;
  if (o.__productId) {
    const p = f.product(o.__productId as number) as ProductDrop;
    g.product = p;
    if (o.__collectionHandle) g.collection = f.collectionByHandle(String(o.__collectionHandle));
  }
  if (o.__collectionId) g.collection = f.collection(o.__collectionId as number);
  if (o.__pageId) g.page = f.page(o.__pageId as number);
  if (o.__blogId) {
    const blog = f.blogByHandle(s.catalog.blogById.get(o.__blogId as number)!.handle)!;
    g.blog = blog;
    if (o.__articleId) {
      blog.currentArticleId = o.__articleId as number;
      g.article = f.article(o.__articleId as number);
    }
  }
  if (o.__search) g.search = new SearchDrop(env);
  if (o.current_tags) g.current_tags = o.current_tags;
  for (const [k, v] of Object.entries(o)) if (!k.startsWith("__") && k !== "current_tags") g[k] = v;

  // Section Rendering API
  const sectionId = sr.url.searchParams.get("section_id");
  const sections = sr.url.searchParams.get("sections");
  if (sectionId) {
    const html = await renderSectionById(env, sectionId, r.template, s.templateSuffix);
    if (html === null) return { body: "", contentType: "text/html; charset=utf-8", status: 404 };
    return { body: html, contentType: "text/html; charset=utf-8", status: r.status };
  }
  if (sections) {
    const out: Record<string, string | null> = {};
    for (const id of sections.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 5)) {
      out[id] = await renderSectionById(env, id, r.template, s.templateSuffix);
    }
    return { body: JSON.stringify(out), contentType: "application/json; charset=utf-8", status: 200 };
  }
  const html = await renderPage(env, r.template, s.templateSuffix);
  return { body: html, contentType: "text/html; charset=utf-8", status: r.status };
}

export async function render404(sr: StoreRequest) {
  const s = sr.state;
  const r: Resolved = { status: 404, template: "404", suffix: null, pageType: "404", objects: {}, title: systemTitle(s.locale, "404"), description: shopDescription(s.locale), canonical: `${s.origin}${s.fullPath}` };
  return renderResolved(sr, r);
}

export async function renderPredictive(sr: StoreRequest) {
  const s = sr.state;
  s.pageType = "search";
  const env = createEnv(s, {}, { pageTitle: "", pageDescription: null, canonicalUrl: "" });
  env.globals.predictive_search = new PredictiveSearchDrop(env);
  return env;
}

export function recommendationsEnv(sr: StoreRequest) {
  const s = sr.state;
  s.pageType = "product";
  const env = createEnv(s, {}, { pageTitle: "", pageDescription: null, canonicalUrl: "" });
  env.globals.recommendations = new RecommendationsDrop(env);
  return env;
}
