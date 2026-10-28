// The LiquidJS instance configured for Shopify themes, and parsed-template caching.
import fs from "node:fs";
import { Liquid, type Template } from "liquidjs";
import { installCompat } from "./compat";
import { registerFilters } from "./filters";
import { readThemeFile, themeFs } from "./source";
import { registerTags } from "./tags";
import { themePath } from "./theme";

let liquid: Liquid | null = null;

export function getLiquid(): Liquid {
  if (liquid) return liquid;
  liquid = new Liquid({
    root: [themePath("snippets")],
    partials: [themePath("snippets")],
    extname: ".liquid",
    fs: themeFs(),
    cache: process.env.THEME_CACHE !== "0",
    jsTruthy: false,
    strictFilters: false,
    strictVariables: false,
    ownPropertyOnly: true,
    dynamicPartials: true,
    relativeReference: false,
    greedy: true,
    lenientIf: true,
    orderedFilterParameters: false,
  });
  installCompat(liquid);
  registerFilters(liquid);
  registerTags(liquid);
  return liquid;
}

const parsed = new Map<string, { mtime: number; tpl: Template[] }>();

/** Parses a theme file (layout / template / section) with the Shopify source adaptations. */
export function parseThemeFile(file: string): Template[] {
  const st = fs.statSync(file);
  const hit = parsed.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.tpl;
  const tpl = getLiquid().parse(readThemeFile(file), file);
  parsed.set(file, { mtime: st.mtimeMs, tpl });
  return tpl;
}
