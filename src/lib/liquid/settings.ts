// Theme / section / block settings, typed by their schema the way Shopify exposes them to Liquid.
import { Context, toValue, type Liquid } from "liquidjs";
import type { BlockData, SectionData, SectionSchema, SettingSchema } from "./theme";
import { ColorDrop, FontDrop, ImageDrop, SDrop, VideoUrlDrop, videoFromFile } from "./drops/base";
import { LinklistDrop, resolveUrl, type DropFactory } from "./drops/catalog";
import { fontDrop } from "./fonts";
import type { RenderState } from "./state";

export interface Env {
  liquid: Liquid;
  s: RenderState;
  f: DropFactory;
  globals: Record<string, unknown>;
}

const TEXTLIKE = new Set(["text", "textarea", "richtext", "inline_richtext", "html", "text_alignment", "select", "radio", "color_background", "metaobject"]);

/** A theme text the shop owner changed in the admin (Текстове в сайта), for the current language. */
function themeEdit(env: Env, scope: string): string | undefined {
  return env.s.catalog.translations.get(env.s.locale)?.get(`theme_edit:${scope}:value`);
}

/** Translation of a theme content string (section / block setting) for the current language. */
function translateThemeString(env: Env, scope: string, value: string): string {
  const s = env.s;
  if (s.locale === s.catalog.shop.primary_locale) return value;
  const m = s.catalog.translations.get(s.locale);
  if (!m) return value;
  return m.get(`theme:${scope}:value`) ?? m.get(`theme:*:${hashText(value)}`) ?? value;
}

export function hashText(v: string): string {
  // FNV-1a 64 → hex, stable key for theme text translations
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

const DYNAMIC_WHOLE = /^\s*\{\{\s*([\s\S]+?)\s*\}\}\s*$/;

/** Import tooling hook: replaces text settings by probes (scripts/import-align.ts). */
let themeProbe: ((scopeKey: string, value: string, type: string) => string) | null = null;
export function setThemeProbe(fn: typeof themeProbe) {
  themeProbe = fn;
}

export function convertSetting(env: Env, schema: SettingSchema, raw: unknown, local: Record<string, unknown>, scopeKey: string): unknown {
  const t = schema.type;
  let value = raw;

  // Dynamic sources ({{ product.metafields.x.y.value }})
  if (typeof value === "string" && value.includes("{{")) {
    const whole = value.match(DYNAMIC_WHOLE);
    const ctx = new Context({ ...env.globals, ...local }, env.liquid.options as never, { globals: env.globals } as never);
    if (whole && !TEXTLIKE.has(t) && t !== "url") {
      try {
        value = env.liquid.evalValueSync(whole[1], ctx);
      } catch {
        value = null;
      }
      return finishObject(env, t, value);
    }
    try {
      value = env.liquid.parseAndRenderSync(value, { ...env.globals, ...local }, { globals: env.globals });
    } catch {
      value = "";
    }
    if (t === "url") return value || null;
    return value;
  }

  switch (t) {
    case "checkbox":
      return value === true || value === "true";
    case "number":
      if (value === "" || value === null || value === undefined) return null;
      return typeof value === "number" ? value : Number(value);
    case "range":
      return typeof value === "number" ? value : value == null ? null : Number(value);
    case "text":
    case "textarea":
    case "richtext":
    case "inline_richtext":
    case "html": {
      // texts edited in the admin win (not while the importer probes the theme's own texts)
      const edited = themeProbe ? undefined : themeEdit(env, scopeKey);
      if (edited !== undefined) return edited;
      // Shopify returns "" for empty text settings (themes test `!= ''`)
      if (value === null || value === undefined || value === "") return "";
      const sv = String(value);
      if (themeProbe) return themeProbe(scopeKey, sv, t);
      return translateThemeString(env, scopeKey, sv);
    }
    case "select":
    case "radio":
    case "text_alignment":
      return value === null || value === undefined ? null : String(value);
    case "liquid":
      if (!value) return null;
      return new LiquidSettingDrop(env, String(value), local);
    case "color":
      if (value === null || value === undefined || value === "") return null;
      return new ColorDrop(String(value));
    case "color_background":
      return value === null || value === undefined || value === "" ? null : String(value);
    case "font_picker":
      return value ? fontDrop(String(value)) : null;
    case "image_picker":
      return imageFromRef(env, value);
    case "video": {
      if (!value) return null;
      const name = decodeURIComponent(String(value).replace(/^shopify:\/\/files\/videos\//, ""));
      const f = env.s.catalog.files.get(name);
      return f ? videoFromFile(env.s, f) : null;
    }
    case "video_url":
      return value ? new VideoUrlDrop(String(value)) : null;
    case "url":
      return value ? resolveUrl(env.s, String(value)) : null;
    case "link_list":
      return value ? new LinklistDrop(env.s, String(value)) : null;
    case "product":
      return value ? env.f.productByHandle(String(value)) : null;
    case "product_list":
      return Array.isArray(value) ? value.map((h) => env.f.productByHandle(String(h))).filter(Boolean) : [];
    case "collection":
      return value ? env.f.collectionByHandle(String(value)) : null;
    case "collection_list":
      return Array.isArray(value) ? value.map((h) => env.f.collectionByHandle(String(h))).filter(Boolean) : [];
    case "page":
      return value ? env.f.pageByHandle(String(value)) : null;
    case "blog":
      return value ? env.f.blogByHandle(String(value)) : null;
    case "article": {
      if (!value) return null;
      const [bh, ah] = String(value).split("/");
      const blog = env.s.catalog.blogByHandle.get(bh);
      const art = blog && env.s.catalog.articles.find((a) => a.blog_id === blog.id && a.handle === ah);
      return art ? env.f.article(art.id) : null;
    }
    default:
      return value === undefined ? null : value;
  }
}

function finishObject(env: Env, t: string, value: unknown): unknown {
  value = toValue(value) === value ? value : value;
  if (value === null || value === undefined || value === "") return t.endsWith("_list") ? [] : null;
  switch (t) {
    case "image_picker":
      return value instanceof ImageDrop ? value : imageFromRef(env, value);
    case "product_list":
    case "collection_list":
      return Array.isArray(value) ? value : [];
    default:
      return value;
  }
}

function imageFromRef(env: Env, value: unknown): ImageDrop | null {
  if (!value) return null;
  if (value instanceof ImageDrop) return value;
  const sv = String(value);
  const m = sv.match(/^shopify:\/\/shop_images\/(.+)$/);
  if (m) return ImageDrop.fromName(env.s, decodeURIComponent(m[1]));
  const f = sv.match(/^shopify:\/\/files\/videos\/(.+)$/);
  if (f) return ImageDrop.fromName(env.s, decodeURIComponent(f[1]));
  return ImageDrop.fromName(env.s, sv.replace(/^files\//, ""));
}

/** A `liquid` type setting: rendered with the section's scope when output. */
export class LiquidSettingDrop extends SDrop {
  private rendered: string | null = null;
  constructor(private env: Env, private src: string, private local: Record<string, unknown>) {
    super({ src });
  }
  valueOf() {
    if (this.rendered === null) {
      try {
        this.rendered = this.env.liquid.parseAndRenderSync(rewriteFloatsLite(this.src), { ...this.env.globals, ...this.local }, { globals: this.env.globals });
      } catch (e) {
        this.rendered = `Liquid error: ${(e as Error).message}`;
      }
    }
    return this.rendered;
  }
  toString() {
    return this.valueOf();
  }
}

import { rewriteSource } from "./source";
function rewriteFloatsLite(src: string) {
  return rewriteSource(src);
}

/** settings object of a section / block / theme. Unknown keys are nil, missing keys use defaults. */
export class SettingsDrop extends SDrop {
  private cache = new Map<string, unknown>();
  private local: Record<string, unknown> = {};
  constructor(
    private env: Env,
    private schema: SettingSchema[],
    private values: Record<string, unknown>,
    private scopePrefix: string,
  ) {
    super({ scope: scopePrefix });
  }
  setLocal(local: Record<string, unknown>) {
    this.local = local;
  }
  liquidMethodMissing(key: string) {
    if (this.cache.has(key)) return this.cache.get(key);
    const def = this.schema.find((s) => s.id === key);
    if (!def) return undefined;
    const raw = Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : schemaDefault(def);
    const v = convertSetting(this.env, def, raw, this.local, `${this.scopePrefix}.${key}`);
    this.cache.set(key, v);
    return v;
  }
  /** for `| json` on settings and iteration */
  toShopifyJSON() {
    const out: Record<string, unknown> = {};
    for (const s of this.schema) if (s.id) out[s.id] = this.liquidMethodMissing(s.id);
    return out;
  }
}

function schemaDefault(def: SettingSchema): unknown {
  if (def.default !== undefined) return def.default;
  if (def.type === "checkbox") return false;
  if (def.type === "product_list" || def.type === "collection_list") return [];
  return null;
}

export class BlockDrop extends SDrop {
  settings: SettingsDrop;
  constructor(
    env: Env,
    public key: string,
    public data: BlockData,
    schema: SettingSchema[],
    public sectionId: string,
    public isApp: boolean,
  ) {
    super({ id: key, type: data.type });
    this.settings = new SettingsDrop(env, schema, data.settings || {}, `${sectionId}.blocks.${key}`);
    this.settings.setLocal({ block: this });
  }
  get id() {
    return this.key;
  }
  /** Shopify reports app blocks as "@app"; appType keeps the real shopify://apps/... type. */
  get type() {
    return this.isApp ? "@app" : this.data.type;
  }
  get appType() {
    return this.data.type;
  }
  get shopify_attributes() {
    return "";
  }
}

export class SectionDrop extends SDrop {
  settings: SettingsDrop;
  blocks: BlockDrop[];
  constructor(
    env: Env,
    public id: string,
    public data: SectionData,
    public schema: SectionSchema,
    public index: number | null,
    public location: string,
  ) {
    super({ id, type: data.type });
    this.settings = new SettingsDrop(env, schema.settings || [], data.settings || {}, id);
    const order = data.block_order || Object.keys(data.blocks || {});
    this.blocks = [];
    for (const key of order) {
      const b = data.blocks?.[key];
      if (!b || b.disabled) continue;
      const isApp = b.type === "@app" || b.type.startsWith("shopify://apps/");
      const bs = isApp ? [] : (schema.blocks || []).find((x) => x.type === b.type)?.settings || [];
      this.blocks.push(new BlockDrop(env, key, b, bs, id, isApp));
    }
    this.settings.setLocal({ section: this });
  }
  get name() {
    return this.schema.name || this.data.type;
  }
  get index0() {
    return this.index === null ? null : this.index - 1;
  }
}

export { FontDrop };
