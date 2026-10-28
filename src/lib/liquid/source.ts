// Loads theme files for LiquidJS and adapts the source to Shopify's Liquid dialect.
// The theme files on disk are never modified; the adaptations below happen in memory.
import fs from "node:fs";
import path from "node:path";
import type { FS } from "liquidjs";

/**
 * Float literals (`100.0`, `0.75`) become `__f["100.0"]` so they evaluate to Ruby floats (rnum.ts).
 * Only code inside {{ }} / {% %} is touched, never quoted strings, raw blocks or schema JSON.
 */
export function rewriteSource(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const open = src.indexOf("{", i);
    if (open < 0 || open + 1 >= n) {
      out += src.slice(i);
      break;
    }
    const next = src[open + 1];
    if (next !== "{" && next !== "%") {
      out += src.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    out += src.slice(i, open);
    const close = next === "{" ? "}}" : "%}";
    const end = findClose(src, open + 2, close);
    if (end < 0) {
      out += src.slice(open);
      break;
    }
    const code = src.slice(open, end + 2);
    if (next === "%") {
      const name = tagName(code);
      if (name === "raw" || name === "schema" || name === "comment" || name === "javascript" || name === "stylesheet") {
        const endName = "end" + name;
        const re = new RegExp(`\\{%-?\\s*${endName}\\s*-?%\\}`, "g");
        re.lastIndex = end + 2;
        const m = re.exec(src);
        if (m) {
          out += src.slice(open, m.index + m[0].length);
          i = m.index + m[0].length;
          continue;
        }
      }
    }
    out += rewriteCode(code);
    i = end + 2;
  }
  return out;
}

function tagName(code: string): string {
  const m = code.match(/^\{%-?\s*([a-z_]+)/);
  return m ? m[1] : "";
}

function findClose(src: string, from: number, close: string): number {
  let q: string | null = null;
  for (let j = from; j < src.length - 1; j++) {
    const c = src[j];
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      continue;
    }
    if (c === close[0] && src[j + 1] === close[1]) return j;
  }
  // Unbalanced quote inside a tag: fall back to the first plain close marker.
  return src.indexOf(close, from);
}

const FLOAT_RE = /(^|[^\w.\]"'])(-?\d+\.\d+)(?![\w.])/g;

/**
 * Shopify's lax parser ignores anything after an end tag / else (`{% endif; %}`, `endif;` inside
 * {% liquid %}); LiquidJS rejects it, so such leftovers are dropped.
 */
function laxTags(code: string): string {
  if (!code.startsWith("{%")) return code;
  const m = code.match(/^(\{%-?)(\s*)(end\w+|else)\b([^%]*?)(\s*-?%\})$/);
  if (m && m[4].trim()) return `${m[1]}${m[2]}${m[3]}${m[5]}`;
  if (/^\{%-?\s*liquid\b/.test(code)) {
    return code
      .split("\n")
      .map((line) => {
        const lm = line.match(/^(\s*)(end\w+|else)\b(.*)$/);
        return lm && lm[3].trim() && !lm[3].trim().startsWith("%}") && !lm[3].trim().startsWith("-%}") ? lm[1] + lm[2] : line;
      })
      .join("\n");
  }
  return code;
}

function rewriteCode(code: string): string {
  code = laxTags(code);
  let out = "";
  let buf = "";
  let q: string | null = null;
  for (let j = 0; j < code.length; j++) {
    const c = code[j];
    if (q) {
      out += c;
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') {
      out += buf.replace(FLOAT_RE, (_m, pre, lit) => `${pre}__f["${lit}"]`);
      buf = "";
      out += c;
      q = c;
      continue;
    }
    buf += c;
  }
  out += buf.replace(FLOAT_RE, (_m, pre, lit) => `${pre}__f["${lit}"]`);
  return out;
}

const cache = new Map<string, { mtime: number; src: string }>();

export function readThemeFile(file: string): string {
  const st = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.src;
  const raw = fs.readFileSync(file, "utf8");
  const src = file.endsWith(".liquid") ? rewriteSource(raw) : raw;
  cache.set(file, { mtime: st.mtimeMs, src });
  return src;
}

/** LiquidJS file system that serves rewritten theme snippets. */
export function themeFs(): FS {
  return {
    exists: async (f) => fs.existsSync(f),
    existsSync: (f) => fs.existsSync(f),
    readFile: async (f) => readThemeFile(f),
    readFileSync: (f) => readThemeFile(f),
    resolve: (dir, file, ext) => {
      const name = file.endsWith(ext) ? file : file + ext;
      return path.resolve(dir, name);
    },
    contains: async (root, file) => path.resolve(file).startsWith(path.resolve(root)),
    containsSync: (root, file) => path.resolve(file).startsWith(path.resolve(root)),
    sep: path.sep,
    dirname: (f) => path.dirname(f),
  };
}
