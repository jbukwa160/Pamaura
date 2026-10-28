// The `t` filter: theme locale files with Shopify's fallback, pluralisation and interpolation.
import { toValue } from "liquidjs";
import { defaultLocaleName, localeFile } from "./theme";
import type { Env } from "./settings";

function lookup(obj: Record<string, unknown> | null, key: string): unknown {
  if (!obj) return undefined;
  let cur: unknown = obj;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}

const pluralRules = new Map<string, Intl.PluralRules>();
function pluralCategory(locale: string, n: number) {
  let r = pluralRules.get(locale);
  if (!r) {
    try {
      r = new Intl.PluralRules(locale);
    } catch {
      r = new Intl.PluralRules("en");
    }
    pluralRules.set(locale, r);
  }
  return r.select(n);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Import tooling hook (scripts/import-theme-translations.ts). */
let localeProbe: ((key: string, vars: Record<string, unknown>) => string | null) | null = null;
export function setLocaleProbe(fn: typeof localeProbe) {
  localeProbe = fn;
}

export function rawTranslation(locale: string, key: string): unknown {
  let v = lookup(localeFile(locale), key);
  if (v === undefined) v = lookup(localeFile(defaultLocaleName()), key);
  return v;
}

/**
 * Shopify: the theme's locale file for the current language, falling back to the default
 * locale; keys ending in _html are not escaped. `raw` skips escaping (used internally).
 */
export function translate(env: Env, key: string, vars: Record<string, unknown>, raw = false): string {
  const locale = env.s.locale;
  let value = rawTranslation(locale, key);
  if (value === undefined || value === null) return `translation missing: ${locale}.${key}`;
  let overrideKey = key;
  if (typeof value === "object" && vars.count !== undefined) overrideKey = `${key}#${pluralCategory(locale, Number(toValue(vars.count)))}`;
  if (localeProbe && locale !== env.s.catalog.shop.primary_locale) {
    const probe = localeProbe(overrideKey, vars);
    if (probe) return probe;
  }
  // translations made outside the locale files (Shopify's translation apps), imported per language
  const override = env.s.catalog.translations.get(locale)?.get(`locale:${overrideKey}:value`);
  if (override !== undefined) value = override;
  if (typeof value === "object") {
    const count = vars.count !== undefined ? Number(toValue(vars.count)) : undefined;
    const forms = value as Record<string, string>;
    if (count === undefined) return `translation missing: ${locale}.${key}`;
    let form: string | undefined;
    if (count === 0 && forms.zero !== undefined) form = forms.zero;
    else if (count === 1 && forms.one !== undefined) form = forms.one;
    else {
      const cat = pluralCategory(locale, count);
      form = forms[cat] ?? forms.other;
    }
    if (form === undefined) return `translation missing: ${locale}.${key}.${pluralCategory(locale, count)}`;
    value = form;
  }
  let text = String(value);
  const html = key.endsWith("_html") || raw;
  // Shopify leaves placeholders it has no value for (e.g. "{{ count }}" read by theme JS)
  text = text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, name: string) => {
    if (!(name in vars)) return m;
    const v = vars[name];
    const sv = v === undefined || v === null ? "" : String(toValue(v));
    return html ? sv : escapeHtml(sv);
  });
  if (!html) {
    // escape the translation text itself, keeping the already-escaped interpolations
    text = text.replace(/&(?!(amp|lt|gt|quot|#39);)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  return text;
}
