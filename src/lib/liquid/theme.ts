// Reads the Shopify theme (theme/ folder): settings, section schemas, JSON templates, section groups
// and locale files. Everything is cached and re-read when the file changes.
import fs from "node:fs";
import path from "node:path";

// The theme is read at run time (next.config.ts ships it with standalone builds).
export const THEME_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.THEME_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "theme"));

export function themePath(...parts: string[]) {
  return path.join(/*turbopackIgnore: true*/ THEME_DIR, ...parts);
}

const jsonCache = new Map<string, { mtime: number; value: unknown }>();

/** Shopify JSON files may start with an auto-generated block comment. */
export function parseThemeJson(text: string): unknown {
  const stripped = text.replace(/^﻿/, "").replace(/^\s*\/\*[\s\S]*?\*\//, "");
  return JSON.parse(stripped);
}

export function readJson<T = unknown>(file: string): T | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  const hit = jsonCache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.value as T;
  const value = parseThemeJson(fs.readFileSync(file, "utf8"));
  jsonCache.set(file, { mtime: st.mtimeMs, value });
  return value as T;
}

// ---------------------------------------------------------------------------------------------
// Schemas

export interface SettingSchema {
  type: string;
  id?: string;
  default?: unknown;
  label?: string;
  options?: { value: string; label?: string }[];
  min?: number;
  max?: number;
  step?: number;
  [k: string]: unknown;
}

export interface BlockSchema {
  type: string;
  name?: string;
  limit?: number;
  settings?: SettingSchema[];
}

export interface SectionSchema {
  name?: string;
  tag?: string;
  class?: string;
  limit?: number;
  settings?: SettingSchema[];
  blocks?: BlockSchema[];
  max_blocks?: number;
  presets?: unknown[];
  default?: { settings?: Record<string, unknown>; blocks?: { type: string; settings?: Record<string, unknown> }[] };
  enabled_on?: unknown;
  disabled_on?: unknown;
}

/** Shopify accepts schema JSON with trailing commas; strip them (outside strings) before parsing. */
export function parseLenientJson(text: string): unknown {
  let out = "";
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === "\\") {
        out += text[++i] ?? "";
      } else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "]" || text[j] === "}") continue;
    }
    out += c;
  }
  return JSON.parse(out);
}

const schemaCache = new Map<string, { mtime: number; schema: SectionSchema | null }>();

export function sectionFile(type: string) {
  return themePath("sections", `${type}.liquid`);
}

export function sectionSchema(type: string): SectionSchema | null {
  const file = sectionFile(type);
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  const hit = schemaCache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.schema;
  const src = fs.readFileSync(file, "utf8");
  const m = src.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  let schema: SectionSchema | null = null;
  if (m) {
    try {
      schema = parseLenientJson(m[1]) as SectionSchema;
    } catch (e) {
      console.error(`[theme] bad schema in sections/${type}.liquid`, e);
      schema = {};
    }
  } else {
    schema = {};
  }
  schemaCache.set(file, { mtime: st.mtimeMs, schema });
  return schema;
}

export function settingsSchema(): SettingSchema[] {
  const groups = readJson<{ name: string; settings?: SettingSchema[] }[]>(themePath("config", "settings_schema.json")) || [];
  const out: SettingSchema[] = [];
  for (const g of groups) for (const s of g.settings || []) if (s.id) out.push(s);
  return out;
}

interface SettingsData {
  current: Record<string, unknown> | string;
  presets?: Record<string, Record<string, unknown>>;
  platform_customizations?: { custom_css?: string[] };
}

export function settingsData() {
  const data = readJson<SettingsData>(themePath("config", "settings_data.json"));
  if (!data) return { current: {} as Record<string, unknown>, customCss: [] as string[] };
  let current = data.current;
  if (typeof current === "string") current = data.presets?.[current] || {};
  return { current, customCss: data.platform_customizations?.custom_css || [] };
}

// ---------------------------------------------------------------------------------------------
// JSON templates & section groups

export interface SectionData {
  type: string;
  disabled?: boolean;
  settings?: Record<string, unknown>;
  blocks?: Record<string, BlockData>;
  block_order?: string[];
  custom_css?: string[];
  name?: string;
}
export interface BlockData {
  type: string;
  disabled?: boolean;
  settings?: Record<string, unknown>;
  static?: boolean;
}
export interface JsonTemplate {
  layout?: string | false;
  wrapper?: string;
  sections: Record<string, SectionData>;
  order: string[];
  type?: string; // section groups: header / footer / aside / custom.<name>
  name?: string;
}

interface ContextOverride {
  parent: string;
  context: Record<string, string>;
  sections?: Record<string, Partial<SectionData> & { blocks?: Record<string, Partial<BlockData>> }>;
}

function applyContext(base: JsonTemplate, override: ContextOverride | null): JsonTemplate {
  if (!override?.sections) return base;
  const merged: JsonTemplate = JSON.parse(JSON.stringify(base));
  for (const [key, ov] of Object.entries(override.sections)) {
    const target = merged.sections[key];
    if (!target) continue;
    if (ov.settings) target.settings = { ...(target.settings || {}), ...ov.settings };
    if (typeof ov.disabled === "boolean") target.disabled = ov.disabled;
    if (ov.blocks) {
      target.blocks = target.blocks || {};
      for (const [bid, bov] of Object.entries(ov.blocks)) {
        const tb = target.blocks[bid];
        if (!tb) continue;
        if (bov.settings) tb.settings = { ...(tb.settings || {}), ...bov.settings };
        if (typeof bov.disabled === "boolean") tb.disabled = bov.disabled;
      }
    }
  }
  return merged;
}

/** templates/<name>.json with the market's contextual override (templates/<name>.context.<market>.json). */
export function jsonTemplate(name: string, market?: string): JsonTemplate | null {
  const base = readJson<JsonTemplate>(themePath("templates", `${name}.json`));
  if (!base) return null;
  if (!market) return base;
  const ov = readJson<ContextOverride>(themePath("templates", `${name}.context.${market}.json`));
  return applyContext(base, ov);
}

export function sectionGroup(name: string, market?: string): JsonTemplate | null {
  const base = readJson<JsonTemplate>(themePath("sections", `${name}.json`));
  if (!base) return null;
  if (!market) return base;
  const ov = readJson<ContextOverride>(themePath("sections", `${name}.context.${market}.json`));
  return applyContext(base, ov);
}

export function liquidTemplateExists(name: string) {
  return fs.existsSync(themePath("templates", `${name}.liquid`));
}

export function templateExists(name: string) {
  return fs.existsSync(themePath("templates", `${name}.json`)) || liquidTemplateExists(name);
}

/** Alternate templates available for a resource type, e.g. product → ["cocoa-glow-v2", ...]. */
export function templateSuffixes(type: string): string[] {
  const dir = type.startsWith("customers/") ? themePath("templates", "customers") : themePath("templates");
  const base = type.replace(/^customers\//, "");
  const out = new Set<string>();
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(new RegExp(`^${base}\\.([^.]+)\\.(json|liquid)$`));
    if (m && m[1] !== "context") out.add(m[1]);
  }
  return [...out].sort();
}

// ---------------------------------------------------------------------------------------------
// Locales

export function localeFile(locale: string): Record<string, unknown> | null {
  const dir = themePath("locales");
  const direct = path.join(dir, `${locale}.json`);
  if (fs.existsSync(direct)) return readJson(direct);
  // e.g. "ro" → ro.json, "pt-BR" → pt-BR.json, default → en.default.json
  const def = fs.readdirSync(dir).find((f) => f.startsWith(`${locale}.`) && f.endsWith(".json") && !f.includes("schema"));
  return def ? readJson(path.join(dir, def)) : null;
}

export function defaultLocaleName(): string {
  const f = fs.readdirSync(themePath("locales")).find((x) => /\.default\.json$/.test(x));
  return f ? f.replace(".default.json", "") : "en";
}
