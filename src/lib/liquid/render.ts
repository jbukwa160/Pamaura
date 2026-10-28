// Page rendering: JSON templates → sections → layout, plus the Section Rendering API.
import crypto from "node:crypto";
import fs from "node:fs";
import { getLiquid, parseThemeFile } from "./engine";
import { FloatLiterals } from "./filters";
import { ColorDrop, SDrop } from "./drops/base";
import {
  AllProductsDrop,
  BlogsDrop,
  CollectionsDrop,
  DropFactory,
  ImagesDrop,
  LinklistsDrop,
  PagesDrop,
} from "./drops/catalog";
import { CartDrop, CustomerDrop, LocalizationDrop, RequestDrop, RoutesDrop, ShopDrop } from "./drops/store";
import { SectionDrop, SettingsDrop, type Env } from "./settings";
import type { RenderState } from "./state";
import {
  jsonTemplate,
  liquidTemplateExists,
  sectionFile,
  sectionGroup,
  sectionSchema,
  settingsData,
  settingsSchema,
  themePath,
  type SectionData,
} from "./theme";
import { contentForHeader, bodyEndHtml } from "./head";

export function stableId(name: string): number {
  const h = crypto.createHash("sha1").update(name).digest();
  // 14 digits, like Shopify's template / group ids
  return 10_000_000_000_000 + (h.readUInt32BE(0) * 4096 + (h.readUInt16BE(4) & 0xfff)) % 89_999_999_999_999;
}

export class TemplateDrop extends SDrop {
  constructor(public tname: string, public suffix: string | null) {
    super({ name: tname });
  }
  get name() {
    return this.tname.includes("/") ? this.tname.split("/")[1] : this.tname;
  }
  get directory() {
    return this.tname.includes("/") ? this.tname.split("/")[0] : null;
  }
  get suffix_value() {
    return this.suffix;
  }
  valueOf() {
    return this.suffix ? `${this.tname}.${this.suffix}` : this.tname;
  }
  toString() {
    return this.valueOf();
  }
}

export interface PageObjects {
  product?: unknown;
  collection?: unknown;
  page?: unknown;
  blog?: unknown;
  article?: unknown;
  search?: unknown;
  recommendations?: unknown;
  predictive_search?: unknown;
  order?: unknown;
  gift_card?: unknown;
  current_tags?: unknown;
  [k: string]: unknown;
}

export interface PageEnv extends Env {
  layout: string | null;
  currentSectionId?: string;
  renderStatic(name: string): Promise<string>;
  renderGroup(name: string): Promise<string>;
}

export function createEnv(s: RenderState, objects: PageObjects, meta: { pageTitle: string; pageDescription: string | null; canonicalUrl: string; handle?: string | null }): PageEnv {
  const liquid = getLiquid();
  const f = new DropFactory(s);
  const globals: Record<string, unknown> = {};
  const env: PageEnv = {
    liquid,
    s,
    f,
    globals,
    layout: "theme",
    renderStatic: (name: string) => renderStaticSection(env, name),
    renderGroup: (name: string) => renderSectionGroup(env, name),
  };
  const theme = settingsData();
  const themeSettings = new SettingsDrop(env, settingsSchema(), theme.current as Record<string, unknown>, "settings");
  Object.assign(globals, {
    __env: env,
    __f: new FloatLiterals(),
    shop: new ShopDrop(s, f),
    settings: themeSettings,
    cart: new CartDrop(f),
    customer: s.customer ? new CustomerDrop(s, f) : null,
    request: new RequestDrop(s),
    routes: new RoutesDrop(s),
    localization: new LocalizationDrop(s),
    linklists: new LinklistsDrop(s),
    collections: new CollectionsDrop(f),
    all_products: new AllProductsDrop(f),
    pages: new PagesDrop(f),
    blogs: new BlogsDrop(f),
    images: new ImagesDrop(s),
    template: new TemplateDrop(s.templateName, s.templateSuffix),
    handle: meta.handle ?? null,
    page_title: meta.pageTitle,
    page_description: meta.pageDescription,
    canonical_url: meta.canonicalUrl,
    current_page: 1,
    current_tags: objects.current_tags ?? null,
    powered_by_link: "",
    content_for_additional_checkout_buttons: "",
    additional_checkout_buttons: false,
    content_for_index: "",
    scripts: [],
  });
  for (const [k, v] of Object.entries(objects)) if (k !== "current_tags") globals[k] = v;
  return env;
}

// ---------------------------------------------------------------------------------------------
// Sections

function scopeCss(css: string, id: string) {
  return css.replace(/(^|\})\s*([^{}@]+)\{/g, (_m, close: string, sel: string) => {
    const scoped = sel
      .split(",")
      .map((x) => `#shopify-section-${id} ${x.trim()}`)
      .join(",");
    return `${close}${scoped} {`;
  });
}

export async function renderSectionInstance(env: PageEnv, opts: { id: string; data: SectionData; index: number | null; location: string; group?: string | null }): Promise<string> {
  const { id, data } = opts;
  const file = sectionFile(data.type);
  if (!fs.existsSync(file)) return "";
  const schema = sectionSchema(data.type) || {};
  const section = new SectionDrop(env, id, data, schema, opts.index, opts.location);
  let inner: string;
  const prevSection = env.currentSectionId;
  const prevGlobal = env.globals.section;
  env.currentSectionId = id;
  // Shopify makes `section` available inside snippets rendered from the section
  env.globals.section = section;
  try {
    inner = await env.liquid.render(parseThemeFile(file), { section }, { globals: env.globals });
  } catch (e) {
    console.error(`[liquid] section ${data.type} (${id}):`, e);
    inner = `<!-- Liquid error in section ${data.type}: ${String((e as Error).message).replace(/--/g, "-")} -->`;
  } finally {
    env.currentSectionId = prevSection;
    env.globals.section = prevGlobal;
  }
  if (data.custom_css?.length) inner = `<style data-shopify>${scopeCss(data.custom_css.join("\n"), id)}</style>` + inner;
  const tag = schema.tag || "div";
  const cls = ["shopify-section", opts.group ? `shopify-section-group-${opts.group}` : "", schema.class || ""].filter(Boolean).join(" ");
  return `<${tag} id="shopify-section-${id}" class="${cls}">${inner}</${tag}>`;
}

export async function renderStaticSection(env: PageEnv, name: string): Promise<string> {
  const sections = (settingsData().current as { sections?: Record<string, SectionData> }).sections || {};
  const data: SectionData = sections[name] ? { ...sections[name], type: sections[name].type || name } : { type: name };
  return renderSectionInstance(env, { id: name, data, index: null, location: "static" });
}

export async function renderSectionGroup(env: PageEnv, name: string): Promise<string> {
  const group = sectionGroup(name, env.s.market.handle);
  if (!group) return "";
  const gid = stableId(`sections/${name}`);
  const out: string[] = [];
  let index = 0;
  for (const key of group.order || []) {
    const data = group.sections[key];
    if (!data || data.disabled) continue;
    index++;
    out.push(await renderSectionInstance(env, { id: `sections--${gid}__${key}`, data, index, location: group.type || name, group: name }));
  }
  // Shopify wraps section groups in BEGIN / END comments, one section per line
  return `<!-- BEGIN sections: ${name} -->\n${out.map((x) => x + "\n").join("")}<!-- END sections: ${name} -->`;
}

function templateFileName(name: string, suffix: string | null) {
  const withSuffix = suffix ? `${name}.${suffix}` : name;
  if (suffix && (fs.existsSync(themePath("templates", `${withSuffix}.json`)) || liquidTemplateExists(withSuffix))) return withSuffix;
  return name;
}

/** content_for_layout for a template; also sets env.layout. */
export async function renderTemplateContent(env: PageEnv, name: string, suffix: string | null): Promise<string> {
  const tname = templateFileName(name, suffix);
  const json = jsonTemplate(tname, env.s.market.handle);
  if (json) {
    if (json.layout === false) env.layout = null;
    else if (typeof json.layout === "string") env.layout = json.layout;
    const tid = stableId(`templates/${tname}`);
    env.s.templateId = tid;
    const out: string[] = [];
    let index = 0;
    for (const key of json.order || []) {
      const data = json.sections[key];
      if (!data || data.disabled) continue;
      index++;
      out.push(await renderSectionInstance(env, { id: `template--${tid}__${key}`, data, index, location: "template" }));
    }
    let html = out.join("");
    if (json.wrapper) html = wrapTemplate(json.wrapper, html);
    return html;
  }
  const file = themePath("templates", `${tname}.liquid`);
  if (fs.existsSync(file)) {
    return env.liquid.render(parseThemeFile(file), {}, { globals: env.globals });
  }
  return "";
}

function wrapTemplate(wrapper: string, html: string) {
  const m = wrapper.match(/^(\w+)([^]*)$/);
  if (!m) return html;
  const [, tag, rest] = m;
  const attrs: string[] = [];
  for (const part of rest.match(/[#.][\w-]+|\[[^\]]+\]/g) || []) {
    if (part.startsWith("#")) attrs.push(`id="${part.slice(1)}"`);
    else if (part.startsWith(".")) attrs.push(`class="${part.slice(1)}"`);
    else attrs.push(part.slice(1, -1));
  }
  return `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}>${html}</${tag}>`;
}

export interface RenderResult {
  html: string;
}

export async function renderPage(env: PageEnv, templateName: string, suffix: string | null): Promise<string> {
  const content = await renderTemplateContent(env, templateName, suffix);
  if (!env.layout) return content;
  const layoutFile = themePath("layout", `${env.layout}.liquid`);
  if (!fs.existsSync(layoutFile)) return content;
  env.globals.content_for_layout = content;
  env.globals.content_for_header = contentForHeader(env);
  let html = await env.liquid.render(parseThemeFile(layoutFile), {}, { globals: env.globals });
  const tail = bodyEndHtml(env);
  const i = html.lastIndexOf("</body>");
  html = i >= 0 ? html.slice(0, i) + tail + html.slice(i) : html + tail;
  return html;
}

/** Section Rendering API: a static section, a section of the page's template, or a group section. */
export async function renderSectionById(env: PageEnv, id: string, templateName: string, suffix: string | null): Promise<string | null> {
  const tm = id.match(/^template--(\d+)__(.+)$/);
  const tname = templateFileName(templateName, suffix);
  if (tm) {
    const json = jsonTemplate(tname, env.s.market.handle);
    const data = json?.sections[tm[2]];
    if (!json || !data) return null;
    env.s.templateId = Number(tm[1]);
    const index = (json.order || []).filter((k) => !json.sections[k]?.disabled).indexOf(tm[2]) + 1;
    return renderSectionInstance(env, { id, data, index, location: "template" });
  }
  const gm = id.match(/^sections--(\d+)__(.+)$/);
  if (gm) {
    for (const g of ["header-group", "footer-group"]) {
      const group = sectionGroup(g, env.s.market.handle);
      if (group?.sections[gm[2]]) return renderSectionInstance(env, { id, data: group.sections[gm[2]], index: null, location: group.type || g, group: g });
    }
    return null;
  }
  if (!/^[a-z0-9_-]+$/i.test(id) || !fs.existsSync(sectionFile(id))) return null;
  // also allow a template section addressed by its key (e.g. "main")
  return renderStaticSection(env, id);
}

export { ColorDrop };
