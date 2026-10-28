// Shopify font library subset used by the theme. The importer downloads the font files the live
// store serves into DATA_DIR/fonts/<family>/ and records them in DATA_DIR/fonts/fonts.json.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../db";
import { FontDrop } from "./drops/base";

export interface FontEntry {
  handle: string; // fira_sans_n3
  dir: string; // fira_sans
  family: string; // Fira Sans
  style: "normal" | "italic";
  weight: number;
  fallback: string;
  woff2: string | null;
  woff: string | null;
}

const FAMILIES: Record<string, { family: string; fallback: string }> = {
  fira_sans: { family: "Fira Sans", fallback: "sans-serif" },
  nunito_sans: { family: "Nunito Sans", fallback: "sans-serif" },
  josefin_sans: { family: "Josefin Sans", fallback: "sans-serif" },
  assistant: { family: "Assistant", fallback: "sans-serif" },
  dm_sans: { family: "DM Sans", fallback: "sans-serif" },
};

const SYSTEM: Record<string, { family: string; fallback: string }> = {
  "sans-serif": { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif", fallback: "sans-serif" },
  serif: { family: "Iowan Old Style, Apple Garamond, Baskerville, Times New Roman, Droid Serif, Times, Source Serif Pro, serif", fallback: "serif" },
  monospace: { family: "Menlo, Consolas, Monaco, Liberation Mono, Lucida Console, monospace", fallback: "monospace" },
};

export const FONTS_DIR = path.join(DATA_DIR, "fonts");

let table: Map<string, FontEntry> | null = null;
let mtime = 0;

export function fontTable(): Map<string, FontEntry> {
  const file = path.join(FONTS_DIR, "fonts.json");
  let st = 0;
  try {
    st = fs.statSync(file).mtimeMs;
  } catch {
    st = -1;
  }
  if (table && st === mtime) return table;
  mtime = st;
  table = new Map();
  if (st > 0) {
    const list = JSON.parse(fs.readFileSync(file, "utf8")) as FontEntry[];
    for (const e of list) table.set(e.handle, e);
  }
  return table;
}

export function parseHandle(handle: string): { dir: string; style: "normal" | "italic"; weight: number } | null {
  const m = String(handle).match(/^(.+)_([ni])(\d)$/);
  if (!m) return null;
  return { dir: m[1], style: m[2] === "i" ? "italic" : "normal", weight: Number(m[3]) * 100 };
}

export function familyInfo(dir: string) {
  return FAMILIES[dir] || { family: dir.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), fallback: "sans-serif" };
}

export function fontDrop(handle: string): FontDrop | null {
  if (SYSTEM[handle]) return new FontDrop(handle, SYSTEM[handle].family, "normal", 400, SYSTEM[handle].fallback, true);
  const p = parseHandle(handle);
  if (!p) return null;
  const info = familyInfo(p.dir);
  return new FontDrop(handle, info.family, p.style, p.weight, info.fallback);
}

/** CSS family name as Shopify prints it: quoted when it contains a space. */
export function cssFamily(family: string) {
  return /\s/.test(family) ? `"${family}"` : family;
}

export function fontExists(handle: string) {
  return fontTable().has(handle);
}

export function fontFileUrl(host: string, entry: FontEntry, format: "woff2" | "woff") {
  const file = format === "woff2" ? entry.woff2 : entry.woff;
  if (!file) return null;
  return `//${host}/cdn/fonts/${entry.dir}/${file}`;
}

export function modifyFont(font: FontDrop, prop: string, value: string): FontDrop | null {
  const handle = font.r.handle;
  if (font.r.system) return font;
  const p = parseHandle(handle);
  if (!p) return null;
  let { weight, style } = p;
  if (prop === "weight") {
    const v = String(value);
    if (v === "bold") weight = 700;
    else if (v === "normal") weight = 400;
    else if (v === "bolder" || v === "lighter") {
      const avail = [...fontTable().values()].filter((e) => e.dir === p.dir && e.style === style).map((e) => e.weight).sort((a, b) => a - b);
      const next = v === "bolder" ? avail.find((w) => w > weight) : [...avail].reverse().find((w) => w < weight);
      if (next === undefined) return null;
      weight = next;
    } else if (/^[+-]\d+$/.test(v)) weight = weight + Number(v);
    else if (/^\d+$/.test(v)) weight = Number(v);
    else return null;
  } else if (prop === "style") {
    if (value === "italic" || value === "oblique") style = "italic";
    else if (value === "normal") style = "normal";
    else return null;
  } else return null;
  const newHandle = `${p.dir}_${style === "italic" ? "i" : "n"}${Math.round(weight / 100)}`;
  if (!fontExists(newHandle)) return null;
  return fontDrop(newHandle);
}

export function fontFace(host: string, font: FontDrop, display?: string): string {
  const e = fontTable().get(font.r.handle);
  if (!e || font.r.system) return "";
  const w2 = fontFileUrl(host, e, "woff2");
  const w1 = fontFileUrl(host, e, "woff");
  const srcs: string[] = [];
  if (w2) srcs.push(`url("${w2}") format("woff2")`);
  if (w1) srcs.push(`url("${w1}") format("woff")`);
  return (
    `@font-face {\n  font-family: ${cssFamily(e.family)};\n  font-weight: ${e.weight};\n  font-style: ${e.style};\n` +
    (display ? `  font-display: ${display};\n` : "") +
    `  src: ${srcs.join(",\n       ")};\n}`
  );
}
