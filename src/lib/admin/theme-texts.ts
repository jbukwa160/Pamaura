// "Текстове в сайта": the texts of the theme's sections (headings, paragraphs, buttons…) that the shop
// owner can change without touching the theme files. Changes are stored as translations with owner_type
// "theme_edit" (locale bg / ro, owner_id = the setting's scope key) and win over the theme's own text and
// the imported Romanian translation (src/lib/liquid/settings.ts). The importers never delete them.
import "server-only";
import fs from "node:fs";
import { getCatalog, isPublished } from "../catalog";
import { getDb } from "../db";
import { hashText } from "../liquid/settings";
import { stableId } from "../liquid/render";
import { jsonTemplate, readJson, sectionGroup, sectionSchema, settingsData, settingsSchema, themePath, type JsonTemplate, type SettingSchema } from "../liquid/theme";
import { catalogChanged } from "./common";

const TEXT_TYPES = new Set(["text", "textarea", "richtext", "inline_richtext"]);

export interface TextField {
  scope: string;
  type: string;
  label: string;
  /** what the theme itself has for Bulgarian */
  bgOriginal: string;
  /** what /ro-ro shows without admin changes (imported translation or the Bulgarian text) */
  roOriginal: string;
  bg: string;
  ro: string;
  bgEdited: boolean;
  roEdited: boolean;
}
export interface TextSection {
  id: string;
  title: string;
  kind: string;
  fields: TextField[];
}
export interface TextGroup {
  key: string;
  label: string;
  usage: string;
  sections: TextSection[];
}

let schemaLabels: Record<string, unknown> | null = null;
/** "t:sections.rich-text.name" → English label from the theme's schema locale (labels have no Bulgarian). */
function label(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("t:")) return raw;
  schemaLabels ??= readJson<Record<string, unknown>>(themePath("locales", "en.default.schema.json")) || {};
  let cur: unknown = schemaLabels;
  for (const part of raw.slice(2).split(".")) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[part] : undefined;
  return typeof cur === "string" ? cur : fallback;
}

/** Settings that look like text but are keys (tags, metafield references) or dynamic sources stay out. */
function editable(def: SettingSchema, value: unknown): boolean {
  if (!def.id || !TEXT_TYPES.has(def.type)) return false;
  if (/(^|_)(tags?|metafield|handle|url|link|id|class|selector)($|_)/i.test(def.id)) return false;
  if (typeof value === "string") {
    if (value.includes("{{")) return false;
    if (/^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/i.test(value.trim())) return false;
  }
  return true;
}

const plain = (v: string) => v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

interface Ctx {
  bgMap: Map<string, string>;
  roMap: Map<string, string>;
}

function field(ctx: Ctx, scope: string, def: SettingSchema, bgRaw: unknown, roRaw: unknown): TextField {
  const bgOriginal = bgRaw == null ? "" : String(bgRaw);
  const roBase = roRaw == null ? "" : String(roRaw);
  const roOriginal = roBase ? (ctx.roMap.get(`theme:${scope}:value`) ?? ctx.roMap.get(`theme:*:${hashText(roBase)}`) ?? roBase) : "";
  const bgEdit = ctx.bgMap.get(`theme_edit:${scope}:value`);
  const roEdit = ctx.roMap.get(`theme_edit:${scope}:value`);
  return {
    scope,
    type: def.type,
    label: label(def.label as string | undefined, def.id || ""),
    bgOriginal,
    roOriginal,
    bg: bgEdit ?? bgOriginal,
    ro: roEdit ?? roOriginal,
    bgEdited: bgEdit !== undefined,
    roEdited: roEdit !== undefined,
  };
}

/** Section instances of a template / group (Bulgarian and Romanian versions of the JSON). */
function sectionsOf(ctx: Ctx, bg: JsonTemplate, ro: JsonTemplate | null, idPrefix: string): TextSection[] {
  const out: TextSection[] = [];
  for (const key of bg.order || []) {
    const data = bg.sections[key];
    if (!data || data.disabled) continue;
    const roData = ro?.sections[key];
    const schema = sectionSchema(data.type);
    const id = `${idPrefix}${key}`;
    const fields: TextField[] = [];
    for (const def of schema?.settings || []) {
      const v = data.settings?.[def.id ?? ""] ?? def.default;
      if (!editable(def, v)) continue;
      fields.push(field(ctx, `${id}.${def.id}`, def, v, roData?.settings?.[def.id!] ?? v));
    }
    for (const bkey of data.block_order || Object.keys(data.blocks || {})) {
      const block = data.blocks?.[bkey];
      if (!block || block.disabled) continue;
      const roBlock = roData?.blocks?.[bkey];
      if (block.type.startsWith("shopify://apps/")) {
        // app blocks: only Instagram's heading is a text the page shows
        const v = block.settings?.title;
        if (block.type.includes("/instafeed/") && typeof v === "string" && v) {
          fields.push(field(ctx, `${id}.blocks.${bkey}.title`, { type: "text", id: "title", label: "Заглавие (Instagram)" }, v, roBlock?.settings?.title ?? v));
        }
        continue;
      }
      const bschema = schema?.blocks?.find((b) => b.type === block.type);
      for (const def of bschema?.settings || []) {
        const v = block.settings?.[def.id ?? ""] ?? def.default;
        if (!editable(def, v)) continue;
        const f = field(ctx, `${id}.blocks.${bkey}.${def.id}`, def, v, roBlock?.settings?.[def.id!] ?? v);
        f.label = `${label(bschema?.name, block.type)} · ${f.label}`;
        fields.push(f);
      }
    }
    if (!fields.some((f) => f.bgOriginal || f.bg)) continue;
    const first = fields.find((f) => plain(f.bg));
    out.push({ id, kind: label(schema?.name, data.type), title: first ? plain(first.bg).slice(0, 70) : label(schema?.name, data.type), fields });
  }
  return out;
}

function templateNames(prefix: string): string[] {
  return fs
    .readdirSync(themePath("templates"))
    .filter((f) => f.endsWith(".json") && !f.includes(".context.") && (f === `${prefix}.json` || f.startsWith(`${prefix}.`)))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** All editable texts, grouped by page type (only templates the shop actually uses). */
export function themeTextGroups(): TextGroup[] {
  const cat = getCatalog();
  const ctx: Ctx = { bgMap: cat.translations.get("bg") || new Map(), roMap: cat.translations.get("ro") || new Map() };
  const groups: TextGroup[] = [];
  const add = (key: string, label: string, usage: string, bg: JsonTemplate | null, ro: JsonTemplate | null, prefix: string) => {
    if (!bg) return;
    const sections = sectionsOf(ctx, bg, ro, prefix);
    if (sections.length) groups.push({ key, label, usage, sections });
  };
  const tpl = (name: string, label: string, usage = "") => add(`templates/${name}`, label, usage, jsonTemplate(name, "bg"), jsonTemplate(name, "ro"), `template--${stableId(`templates/${name}`)}__`);

  for (const g of ["header-group", "footer-group"]) {
    add(`sections/${g}`, g === "header-group" ? "Горна лента и меню" : "Долна част (футър)", "на всяка страница", sectionGroup(g, "bg"), sectionGroup(g, "ro"), `sections--${stableId(`sections/${g}`)}__`);
  }
  tpl("index", "Начална страница");

  const used = (names: string[], suffixOf: (name: string) => string | null, items: { title: string; suffix: string | null }[], what: string) =>
    names
      .map((n) => ({ n, users: items.filter((i) => (i.suffix || null) === suffixOf(n)).map((i) => i.title) }))
      .filter((x) => x.users.length)
      .map((x) => ({ ...x, usage: `${what}: ${x.users.slice(0, 4).join(", ")}${x.users.length > 4 ? ` и още ${x.users.length - 4}` : ""}` }));
  const suffix = (base: string) => (n: string) => (n === base ? null : n.slice(base.length + 1));

  for (const x of used(templateNames("product"), suffix("product"), cat.products.filter(isPublished).map((p) => ({ title: p.title, suffix: p.template_suffix })), "използва се от"))
    tpl(x.n, `Продукт · шаблон „${x.n === "product" ? "основен" : x.n.slice(8)}“`, x.usage);
  for (const x of used(templateNames("collection"), suffix("collection"), cat.collections.filter((c) => c.published).map((c) => ({ title: c.title, suffix: c.template_suffix })), "колекции"))
    tpl(x.n, `Колекция · шаблон „${x.n === "collection" ? "основен" : x.n.slice(11)}“`, x.usage);
  for (const x of used(templateNames("page"), suffix("page"), cat.pages.filter((p) => p.published).map((p) => ({ title: p.title, suffix: p.template_suffix })), "страници"))
    tpl(x.n, `Страница · шаблон „${x.n === "page" ? "основен" : x.n.slice(5)}“`, x.usage);
  for (const [name, l] of [
    ["cart", "Количка"],
    ["search", "Търсене"],
    ["list-collections", "Всички колекции"],
    ["blog", "Блог"],
    ["article", "Статия"],
    ["404", "Страница 404"],
  ] as const) {
    for (const n of templateNames(name)) tpl(n, n === name ? l : `${l} · ${n.slice(name.length + 1)}`);
  }

  // theme settings (product card badges and other global texts)
  const current = settingsData().current as Record<string, unknown>;
  const globals: TextField[] = [];
  for (const def of settingsSchema()) {
    const v = current[def.id ?? ""] ?? def.default;
    if (!editable(def, v) || v == null || v === "") continue;
    globals.push(field(ctx, `settings.${def.id}`, def, v, v));
  }
  if (globals.length) groups.push({ key: "settings", label: "Общи текстове", usage: "етикети по продуктите и др.", sections: [{ id: "settings", kind: "Theme settings", title: "Общи текстове", fields: globals }] });
  return groups;
}

export interface TextChange {
  scope: string;
  /** new value; null = back to the theme's own text */
  bg?: string | null;
  ro?: string | null;
}

/** Saves changed texts. Only scopes that themeTextGroups() lists are accepted. */
export function saveThemeTexts(changes: TextChange[]): number {
  const allowed = new Map<string, TextField>();
  for (const g of themeTextGroups()) for (const s of g.sections) for (const f of s.fields) allowed.set(f.scope, f);
  const db = getDb();
  const put = db.prepare("INSERT OR REPLACE INTO translations(locale, owner_type, owner_id, field, value) VALUES(?, 'theme_edit', ?, 'value', ?)");
  const del = db.prepare("DELETE FROM translations WHERE locale = ? AND owner_type = 'theme_edit' AND owner_id = ? AND field = 'value'");
  let n = 0;
  db.transaction(() => {
    for (const c of changes) {
      const f = allowed.get(c.scope);
      if (!f) continue;
      for (const loc of ["bg", "ro"] as const) {
        const v = c[loc];
        if (v === undefined) continue;
        const original = loc === "bg" ? f.bgOriginal : f.roOriginal;
        if (v === null || v === original) del.run(loc, c.scope);
        else put.run(loc, c.scope, v.slice(0, 20000));
        n++;
      }
    }
  })();
  if (n) catalogChanged();
  return n;
}
