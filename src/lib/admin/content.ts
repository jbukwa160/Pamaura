// Server helpers for the content pages of the admin: pages, blog posts and menus (templates, dates, links,
// lists and input checks).
import "server-only";
import { getDb } from "../db";
import { jsonTemplate, liquidTemplateExists, sectionGroup, templateSuffixes } from "../liquid/theme";
import type { LinkTargets, MenuInfo, MenuItemForm, TemplateChoice } from "@/components/admin/content/types";
import type { MenuItem } from "../catalog";
import { getTranslations } from "./common";

// ---------------------------------------------------------------------------------------------
// Templates (theme/templates/page.<suffix>.json …)

const TEMPLATE_LABELS: Record<string, string> = {
  contact: "Контакти (с форма за съобщение)",
  "bundle-builder": "„Направи си сет“ (избор на продукти)",
  faq: "Въпроси и отговори",
  lookbook: "Lookbook (галерия с продукти)",
  philosophy: "Философия",
  sale: "Разпродажба (с обратно броене)",
  story: "История",
  "story-2": "История (вариант 2)",
  testimonials: "Мнения на клиенти",
};

/** Does the template print the page / article text (an enabled main-page / main-article section)? */
function templateShowsText(kind: "page" | "article", suffix: string): boolean {
  const name = suffix ? `${kind}.${suffix}` : kind;
  const json = jsonTemplate(name);
  if (!json) return liquidTemplateExists(name);
  const main = kind === "page" ? "main-page" : "main-article";
  return Object.values(json.sections || {}).some((s) => s.type === main && !s.disabled);
}

/** The templates a page (or article) can use; `current` is kept even when the theme no longer has it. */
export function templateChoices(kind: "page" | "article", current: string | null = null): TemplateChoice[] {
  const out: TemplateChoice[] = [{ value: "", label: kind === "page" ? "Стандартна страница" : "Стандартна публикация", showsText: true }];
  for (const s of templateSuffixes(kind)) out.push({ value: s, label: TEMPLATE_LABELS[s] ?? s, showsText: templateShowsText(kind, s) });
  if (current && !out.some((c) => c.value === current)) out.push({ value: current, label: `${current} (липсва в темата)`, showsText: true });
  return out;
}

export function templateLabel(suffix: string | null): string {
  if (!suffix) return "Стандартна";
  return TEMPLATE_LABELS[suffix] ?? suffix;
}

// ---------------------------------------------------------------------------------------------
// Dates in Sofia time ("YYYY-MM-DDTHH:mm", as <input type="datetime-local"> shows them)

const SOFIA = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function sofiaLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : SOFIA.format(d).replace(" ", "T");
}

/** "2026-10-28T14:30" (Sofia) → "2026-10-28T14:30:00+02:00" (the format Shopify used); null when invalid. */
export function sofiaLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  for (const off of ["+03:00", "+02:00"]) {
    const iso = `${local}:00${off}`;
    if (sofiaLocal(iso) === local) return iso;
  }
  const iso = `${local}:00+03:00`; // the hour skipped when the clocks go forward
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

// ---------------------------------------------------------------------------------------------
// Menus

export const MENU_ITEMS_MAX = 200;

/** Where each menu is shown, from the theme's header / footer groups. */
function menuPlacements(): Map<string, { label: string; description: string; maxDepth: number; order: number }> {
  const out = new Map<string, { label: string; description: string; maxDepth: number; order: number }>();
  for (const s of Object.values(sectionGroup("header-group")?.sections || {})) {
    if (s.disabled) continue;
    for (const b of Object.values(s.blocks || {})) {
      const h = b.type === "menu" ? String(b.settings?.linklist || "") : "";
      if (h && !out.has(h)) out.set(h, { label: "Главно меню", description: "Най-горе на всяка страница. Може да има подменюта (до 3 нива).", maxDepth: 3, order: out.size });
    }
  }
  for (const s of Object.values(sectionGroup("footer-group")?.sections || {})) {
    if (s.disabled) continue;
    for (const b of Object.values(s.blocks || {})) {
      const h = b.type === "menu" ? String(b.settings?.menu || "") : "";
      if (h && !out.has(h) && !b.disabled) {
        const title = String(b.settings?.title || "").trim();
        out.set(h, {
          label: title ? `Долу: „${title}“` : "Меню долу на сайта",
          description: `Колона${title ? ` „${title}“` : ""} в долната част на сайта. Показва само един ред връзки, без подменюта.`,
          maxDepth: 1,
          order: out.size,
        });
      }
    }
  }
  return out;
}

function withTranslations(items: MenuItem[], ro: Record<string, string>, prefix = ""): MenuItemForm[] {
  return (items || []).map((it, i) => {
    const path = `${prefix}${i}`;
    return { title: String(it.title ?? ""), ro: ro[`${path}.title`] ?? "", url: String(it.url ?? ""), orig: path, items: withTranslations(it.items || [], ro, `${path}.`) };
  });
}

export function menusForEdit(): MenuInfo[] {
  const rows = getDb().prepare("SELECT handle, title, items FROM menus").all() as { handle: string; title: string; items: string }[];
  const places = menuPlacements();
  const order = (h: string) => places.get(h)?.order ?? 100;
  return rows
    .sort((a, b) => order(a.handle) - order(b.handle) || a.handle.localeCompare(b.handle))
    .map((r) => {
      let items: MenuItem[] = [];
      try {
        items = JSON.parse(r.items) as MenuItem[];
      } catch {
        /* keep empty */
      }
      const p = places.get(r.handle);
      return {
        handle: r.handle,
        title: r.title,
        label: p?.label ?? r.title,
        description: p?.description ?? "Това меню не е поставено в темата и не се вижда в сайта.",
        maxDepth: p?.maxDepth ?? 3,
        items: withTranslations(items, getTranslations("menu", r.handle)),
      };
    });
}

/** Everything a menu item can link to. */
export function linkTargets(): LinkTargets {
  const db = getDb();
  type Named = { handle: string; title: string };
  const list = (table: string) => db.prepare(`SELECT handle, title FROM ${table} ORDER BY title COLLATE NOCASE`).all() as Named[];
  return {
    collections: list("collections"),
    products: list("products"),
    pages: list("pages"),
    blogs: list("blogs"),
    articles: db.prepare("SELECT b.handle AS blog, a.handle, a.title FROM articles a JOIN blogs b ON b.id = a.blog_id ORDER BY a.title COLLATE NOCASE").all() as LinkTargets["articles"],
  };
}

function decodePath(url: string): string {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

/** Market-neutral path of a stored menu link (shopify://pages/x → /pages/x), without ?query / #hash. */
function linkPath(url: string): string {
  const m = url.match(/^shopify:\/\/(\w+)\/?(.*)$/);
  const p = m ? `/${m[1]}${m[2] ? `/${m[2]}` : ""}` : url;
  return decodePath(p.replace(/[?#].*$/, ""));
}

/** Menus (labels) with an item linking to `path` (e.g. "/pages/contact"). */
export function menusLinkingTo(path: string): string[] {
  const out = new Set<string>();
  const labels = new Map(menusForEdit().map((m) => [m.handle, m.label]));
  for (const r of getDb().prepare("SELECT handle, items FROM menus").all() as { handle: string; items: string }[]) {
    const walk = (items: MenuItem[]) => {
      for (const it of items || []) {
        if (linkPath(String(it.url || "")) === path) out.add(labels.get(r.handle) ?? r.handle);
        walk(it.items || []);
      }
    };
    try {
      walk(JSON.parse(r.items) as MenuItem[]);
    } catch {
      /* skip */
    }
  }
  return [...out];
}

/** All market-neutral paths the menus link to (for "in the menu" badges). */
export function menuLinkedPaths(): Set<string> {
  const out = new Set<string>();
  for (const r of getDb().prepare("SELECT items FROM menus").all() as { items: string }[]) {
    const walk = (items: MenuItem[]) => {
      for (const it of items || []) {
        out.add(linkPath(String(it.url || "")));
        walk(it.items || []);
      }
    };
    try {
      walk(JSON.parse(r.items) as MenuItem[]);
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * After a page / post changed its address: menu links to the old path follow it, and (when asked) the old
 * address redirects to the new one. Runs inside the caller's transaction.
 */
export function moveLinks(oldPath: string, newPath: string, redirect: boolean) {
  const db = getDb();
  for (const r of db.prepare("SELECT handle, items FROM menus").all() as { handle: string; items: string }[]) {
    let items: MenuItem[];
    try {
      items = JSON.parse(r.items) as MenuItem[];
    } catch {
      continue;
    }
    let changed = false;
    const walk = (list: MenuItem[]) => {
      for (const it of list || []) {
        const url = String(it.url || "");
        if (linkPath(url) === oldPath) {
          const tail = url.match(/[?#].*$/)?.[0] ?? "";
          it.url = newPath + tail;
          changed = true;
        }
        walk(it.items || []);
      }
    };
    walk(items);
    if (changed) db.prepare("UPDATE menus SET items = ? WHERE handle = ?").run(JSON.stringify(items), r.handle);
  }
  // the new address is a real page now; an old redirect away from it would never be used
  db.prepare("DELETE FROM redirects WHERE path = ?").run(newPath);
  if (redirect) {
    db.prepare("INSERT OR REPLACE INTO redirects(path, target) VALUES(?, ?)").run(oldPath, newPath);
    db.prepare("UPDATE redirects SET target = ? WHERE target = ?").run(newPath, oldPath);
  }
}

// ---------------------------------------------------------------------------------------------
// Text helpers

/** A short plain-text preview of stored HTML. */
export function htmlExcerpt(html: string, max = 140): string {
  const t = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Case-insensitive match of a search term (Cyrillic too, which SQLite's LIKE does not fold). */
export function matches(q: string, ...texts: (string | null | undefined)[]): boolean {
  const t = q.trim().toLowerCase();
  return !t || texts.some((x) => !!x && x.toLowerCase().includes(t));
}

/** Romanian titles of all resources of a type: owner_id → title. */
export function roTitles(ownerType: string): Map<string, string> {
  const rows = getDb().prepare("SELECT owner_id, value FROM translations WHERE locale = 'ro' AND owner_type = ? AND field = 'title'").all(ownerType) as { owner_id: string; value: string }[];
  return new Map(rows.map((r) => [r.owner_id, r.value]));
}

/** Resources of a type that have a Romanian text for `field`. */
export function roHas(ownerType: string, field: string): Set<string> {
  const rows = getDb().prepare("SELECT owner_id FROM translations WHERE locale = 'ro' AND owner_type = ? AND field = ? AND value != ''").all(ownerType, field) as { owner_id: string }[];
  return new Set(rows.map((r) => r.owner_id));
}

// ---------------------------------------------------------------------------------------------
// Pages

export interface PageRow {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  template_suffix: string | null;
  published: number;
  updated_at: string;
  seo_title: string | null;
  seo_description: string | null;
}

export function pageRow(id: number): PageRow | null {
  return (getDb().prepare("SELECT id, handle, title, body_html, template_suffix, published, updated_at, seo_title, seo_description FROM pages WHERE id = ?").get(id) as PageRow | undefined) ?? null;
}

export function listPages(q: string) {
  const rows = getDb().prepare("SELECT id, handle, title, body_html, template_suffix, published, updated_at, seo_title, seo_description FROM pages ORDER BY updated_at DESC, title COLLATE NOCASE").all() as PageRow[];
  const ro = roTitles("page");
  const roBody = roHas("page", "body_html");
  const linked = menuLinkedPaths();
  return rows
    .filter((p) => matches(q, p.title, p.handle, ro.get(String(p.id)), htmlExcerpt(p.body_html, 100_000)))
    .map((p) => ({
      id: p.id,
      handle: p.handle,
      title: p.title,
      roTitle: ro.get(String(p.id)) ?? "",
      roMissing: !ro.get(String(p.id)) || (!!p.body_html.trim() && !roBody.has(String(p.id))),
      template: p.template_suffix,
      published: !!p.published,
      inMenu: linked.has(`/pages/${p.handle}`),
      updatedAt: p.updated_at,
    }));
}

// ---------------------------------------------------------------------------------------------
// Input checks for the server actions (values come from the browser and are never trusted)

export class InputError extends Error {}

/** A string of at most `max` characters (longer → InputError with `what` in the message). */
export function str(v: unknown, max: number, what: string): string {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  if (s.length > max) throw new InputError(`${what}: текстът е твърде дълъг (най-много ${max.toLocaleString("bg-BG")} знака).`);
  return s;
}

export function bgro(v: unknown, max: number, what: string, trim = true): { bg: string; ro: string } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const bg = str(o.bg, max, what);
  const ro = str(o.ro, max, `${what} (RO)`);
  return trim ? { bg: bg.trim(), ro: ro.trim() } : { bg, ro };
}

export function errorResult(e: unknown): { error: string } {
  if (e instanceof InputError) return { error: e.message };
  console.error("[admin]", e);
  return { error: "Възникна грешка при записа. Опитайте отново." };
}

// ---------------------------------------------------------------------------------------------
// Blog

export interface BlogRow {
  id: number;
  handle: string;
  title: string;
}

export interface ArticleRow {
  id: number;
  blog_id: number;
  handle: string;
  title: string;
  author: string;
  body_html: string;
  summary_html: string;
  image_file: string | null;
  image_alt: string | null;
  tags: string;
  template_suffix: string | null;
  published: number;
  published_at: string | null;
  updated_at: string;
  seo_title: string | null;
  seo_description: string | null;
}

export function blogsList(): BlogRow[] {
  return getDb().prepare("SELECT id, handle, title FROM blogs ORDER BY id").all() as BlogRow[];
}

export function articleRow(id: number): ArticleRow | null {
  return (getDb().prepare("SELECT * FROM articles WHERE id = ?").get(id) as ArticleRow | undefined) ?? null;
}

export function parseTags(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json || "[]") as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Tags used by any article, most used first. */
export function articleTags(): string[] {
  const count = new Map<string, number>();
  for (const r of getDb().prepare("SELECT tags FROM articles").all() as { tags: string }[]) for (const t of parseTags(r.tags)) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "bg")).map(([t]) => t);
}

export type ArticleState = "published" | "scheduled" | "draft";

export function articleState(a: { published: number | boolean; published_at: string | null }): ArticleState {
  if (!a.published) return "draft";
  return a.published_at && new Date(a.published_at).getTime() > Date.now() ? "scheduled" : "published";
}

export function listArticles(q: string, blogId: number | null) {
  const rows = getDb().prepare("SELECT * FROM articles ORDER BY published_at DESC, id DESC").all() as ArticleRow[];
  const blogs = new Map(blogsList().map((b) => [b.id, b]));
  const ro = roTitles("article");
  const roBody = roHas("article", "body_html");
  return rows
    .filter((a) => (blogId === null || a.blog_id === blogId) && matches(q, a.title, a.handle, a.author, ro.get(String(a.id)), a.tags))
    .map((a) => ({
      id: a.id,
      title: a.title,
      roTitle: ro.get(String(a.id)) ?? "",
      roMissing: !ro.get(String(a.id)) || (!!a.body_html.trim() && !roBody.has(String(a.id))),
      handle: a.handle,
      blog: blogs.get(a.blog_id)?.title ?? "",
      blogHandle: blogs.get(a.blog_id)?.handle ?? "",
      author: a.author,
      image: a.image_file,
      tags: parseTags(a.tags),
      state: articleState(a),
      publishedAt: a.published_at,
    }));
}
