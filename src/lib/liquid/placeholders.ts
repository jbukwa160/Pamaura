// placeholder_svg_tag: Shopify's placeholder illustrations. The ones the theme shows on the live
// store were copied by the importer (settings key "placeholders"); a neutral SVG is the fallback.
import { getSetting } from "../db";

let probe = false;
/** Import tooling: emit name-tagged placeholders so they can be matched with the live page. */
export function setPlaceholderProbe(on: boolean) {
  probe = on;
}

export function placeholderSvg(name: string, cls: string): string {
  if (probe) return `<svg data-ph="${name}"></svg>`;
  const known = getSetting<Record<string, string>>("placeholders", {})[name];
  if (known) return cls ? known.replace(/^<svg /, `<svg class="${cls}" `) : known;
  const c = cls ? ` class="${cls}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 525.5 525.5"${c}><rect width="525.5" height="525.5" fill="#f4f4f4"/></svg>`;
}
