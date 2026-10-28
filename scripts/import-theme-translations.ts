/**
 * Recovers the translations of theme texts (section / block / theme settings) for the other
 * languages: every text setting is replaced by a probe, the page is rendered in that language and
 * aligned with the live page; the live text at a probe is the translation of that setting.
 *
 *   npm run import:theme-texts      (after npm run import)
 */
import path from "node:path";
import { DATA_DIR, bumpCatalogVersion, getDb } from "../src/lib/db";
import { getCatalog, isPublished } from "../src/lib/catalog";
import { setThemeProbe } from "../src/lib/liquid/settings";
import { rawTranslation, setLocaleProbe } from "../src/lib/liquid/i18n";
import { toValue } from "liquidjs";
import { handleStorefront } from "../src/lib/storefront/router";
import { settingsData } from "../src/lib/liquid/theme";
import { Fetcher } from "./import/fetch";
import { attrs, changedRuns, decode, tokens, tokensWithRaw } from "./import/align-lib";
import { diffArrays } from "diff";

const BASE = (process.env.SHOP_URL || "https://pamaura.com").replace(/\/$/, "");
const fetcher = new Fetcher(path.join(DATA_DIR, "import-cache"), process.argv.includes("--refresh"));
const log = (...a: unknown[]) => console.log("[theme-texts]", ...a);
const OTHER = [{ path: "ro-ro", locale: "ro" }];

interface Probe {
  id: number;
  key: string;
  source: string;
  type: string;
}
const byKey = new Map<string, Probe>();
const byId = new Map<number, Probe>();
const pagesOf = new Map<number, Set<string>>(); // probe id → pages (with market prefix) reading it
let currentPage = "";
const HTML_TYPES = new Set(["richtext", "inline_richtext", "html"]);

setThemeProbe((key, value, type) => {
  let p = byKey.get(key);
  if (!p) {
    p = { id: byKey.size + 1, key, source: value, type };
    byKey.set(key, p);
    byId.set(p.id, p);
  }
  if (currentPage) {
    const set = pagesOf.get(p.id) || new Set<string>();
    set.add(currentPage);
    pagesOf.set(p.id, set);
  }
  return `qqth${p.id}qq`;
});

// interface strings (t filter): key → probe; the values used in the call rebuild {{ var }} placeholders
interface LocaleProbe {
  id: number;
  key: string;
  vars: Record<string, string>;
}
const lcByKey = new Map<string, LocaleProbe>();
const lcById = new Map<number, LocaleProbe>();
setLocaleProbe((key, vars) => {
  // date formats are passed through the date filter, not printed
  if (key.startsWith("general.date_format") || key.startsWith("date_formats")) return null;
  const sv: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) sv[k] = String(toValue(v) ?? "");
  const p = { id: lcById.size + 1, key, vars: sv };
  lcById.set(p.id, p);
  lcByKey.set(key, p);
  return `qqlc${p.id}qq`;
});

const RE = /qqth(\d+)qq/gi;
const LC = /qqlc(\d+)qq/gi;

function extractLocale(ours: string, live: string): Map<number, string> {
  const a = tokens(ours);
  const lv = tokensWithRaw(live);
  const { pairs } = changedRuns(a, lv.tok);
  const out = new Map<number, string>();
  for (const pair of pairs) {
    const ids = [...pair.ours.join("\u0001").matchAll(LC)].map((m) => Number(m[1]));
    if (ids.length !== 1) continue;
    const id = ids[0];
    const mk = `qqlc${id}qq`;
    const liveTexts = pair.live.filter((t) => !t.startsWith("<"));
    const xi = pair.ours.findIndex((t) => !t.startsWith("<") && t.toLowerCase().includes(mk));
    if (xi < 0 || liveTexts.length !== 1) continue;
    const ot = pair.ours[xi];
    const lt = liveTexts[0];
    const pos = ot.toLowerCase().indexOf(mk);
    const pre = ot.slice(0, pos), post = ot.slice(pos + mk.length);
    if (!lt.startsWith(pre) || !lt.endsWith(post)) continue;
    out.set(id, decode(lt.slice(pre.length, lt.length - post.length)).trim());
  }
  return out;
}

/**
 * A text with several probes (a script using section texts more than once): our text becomes a
 * pattern, literal around the probes, each probe a group (repeats must be equal), and is matched
 * against the live text. Interface-string probes are wildcards.
 */
function matchProbes(ot: string, lt: string): Map<number, string> | null {
  let re = "^";
  const groups: string[] = [];
  for (const part of ot.split(/(qq(?:th|lc)\d+qq)/i)) {
    const m = part.match(/^qq(th|lc)(\d+)qq$/i);
    if (!m) {
      re += part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      continue;
    }
    const k = `${m[1].toLowerCase()}${m[2]}`;
    const at = groups.indexOf(k);
    if (at >= 0) re += `\\${at + 1}`;
    else {
      groups.push(k);
      re += "([\\s\\S]*?)";
    }
  }
  const mm = lt.match(new RegExp(re + "$"));
  if (!mm) return null;
  const out = new Map<number, string>();
  groups.forEach((k, i) => {
    if (k.startsWith("th")) out.set(Number(k.slice(2)), decode(mm[i + 1]).trim());
  });
  return out;
}

function extract(ours: string, live: string): Map<number, string> {
  const a = tokens(ours);
  const lv = tokensWithRaw(live);
  const { pairs } = changedRuns(a, lv.tok);
  const out = new Map<number, string>();
  for (const pair of pairs) {
    const ids = [...pair.ours.join("\u0001").matchAll(RE)].map((m) => Number(m[1]));
    if (!ids.length) continue;
    // texts carrying several probes, and script text cut at a "<" (`i < n`) that looks like a tag
    for (const ot of pair.ours) {
      const n = (ot.match(RE) || []).length;
      if (!n || (n < 2 && !ot.startsWith("<"))) continue;
      for (const lt of pair.live) {
        const got = matchProbes(ot, lt);
        if (!got) continue;
        for (const [id, v] of got) if (v) out.set(id, v);
        break;
      }
    }
    const textTokens = pair.ours.filter((t) => !t.startsWith("<"));
    // one probe that is the whole changed text run → the whole live run is its translation
    if (ids.length === 1 && pair.ours.length === 1 && textTokens.length === 1 && textTokens[0].toLowerCase() === `qqth${ids[0]}qq`) {
      const p = byId.get(ids[0])!;
      let raw = "";
      for (let k = 0; k < pair.live.length; k++) raw += (k ? lv.gaps[pair.liveStart + k] : "") + lv.raw[pair.liveStart + k];
      // snippets/delivery-info replaces the word "delivery_dates" with the dates of the day
      if (p.source.includes("delivery_dates")) raw = raw.replace(/<span class="delivery-info-date">[^<]*<\/span>/g, "delivery_dates");
      const v = HTML_TYPES.has(p.type) ? raw.trim() : decode(raw.replace(/<[^>]*>/g, "")).trim();
      if (v) out.set(p.id, v);
      continue;
    }
    for (const id of new Set(ids)) {
      const mk = `qqth${id}qq`;
      // inside an attribute
      const ti = pair.ours.findIndex((t) => t.startsWith("<") && t.toLowerCase().includes(mk));
      if (ti >= 0) {
        const oa = attrs(pair.ours[ti]);
        const name = Object.keys(oa).find((k) => oa[k].toLowerCase().includes(mk));
        const tag = pair.ours[ti].match(/^<([a-z0-9-]+)/i)?.[1];
        const lt = pair.live.find((t) => t.startsWith(`<${tag}`) && name && attrs(t)[name] !== undefined);
        if (!name || !lt) continue;
        const ov = oa[name], lvv = attrs(lt)[name];
        const pos = ov.toLowerCase().indexOf(mk);
        const pre = ov.slice(0, pos), post = ov.slice(pos + mk.length);
        if ((ids.length === 1 || !/qqth\d+qq/i.test(pre + post)) && lvv.startsWith(pre) && lvv.endsWith(post)) out.set(id, decode(lvv.slice(pre.length, lvv.length - post.length)).trim());
        continue;
      }
      // inside a longer text
      const xi = pair.ours.findIndex((t) => !t.startsWith("<") && t.toLowerCase().includes(mk));
      if (xi < 0 || ids.length !== 1 || pair.live.filter((t) => !t.startsWith("<")).length !== 1) continue;
      const ot = pair.ours[xi];
      const lt = pair.live.find((t) => !t.startsWith("<"))!;
      const pos = ot.toLowerCase().indexOf(mk);
      const pre = ot.slice(0, pos), post = ot.slice(pos + mk.length);
      if (lt.startsWith(pre) && lt.endsWith(post)) out.set(id, decode(lt.slice(pre.length, lt.length - post.length)).trim());
    }
  }
  return out;
}

async function main() {
  process.env.SITE_URL = BASE;
  const cat = getCatalog();
  const paths: string[] = ["", "/cart", "/collections", "/blogs/news", "/account/login", "/account/register", "/search?q=scrub"];
  for (const p of cat.products.filter(isPublished)) paths.push(`/products/${encodeURIComponent(p.handle)}`);
  for (const c of cat.collections.filter((c) => c.published)) paths.push(`/collections/${encodeURIComponent(c.handle)}`);
  for (const p of cat.pages.filter((p) => p.published)) paths.push(`/pages/${encodeURIComponent(p.handle)}`);
  for (const a of cat.articles.filter((a) => a.published)) paths.push(`/blogs/${encodeURIComponent(cat.blogById.get(a.blog_id)!.handle)}/${encodeURIComponent(a.handle)}`);

  const votes = new Map<string, Map<number, Map<string, number>>>();
  const lcVotes = new Map<string, Map<string, Map<string, number>>>();
  for (const mk of OTHER) {
    const v = new Map<number, Map<string, number>>();
    for (const p of paths) {
      const full = `/${mk.path}${p}`;
      currentPage = full;
      const res = await handleStorefront(new Request(BASE + full, { headers: { host: new URL(BASE).host, accept: "text/html" } }));
      const ours = await res.text();
      currentPage = "";
      const live = await fetcher.text(BASE + full);
      if (!live) continue;
      const found = extract(ours, live);
      const lfound = extractLocale(ours, live);
      const lv = lcVotes.get(mk.locale) || new Map<string, Map<string, number>>();
      for (const [id, val] of lfound) {
        const call = lcById.get(id)!;
        // rebuild the template with this call's values: "Disponibil de la 55,00 lei" → "… {{ price }}"
        let tpl = val;
        const entries = Object.entries(call.vars).filter(([, x]) => x).sort((x, y) => y[1].length - x[1].length);
        for (const [k, x] of entries) if (tpl.includes(x)) tpl = tpl.split(x).join(`{{ ${k} }}`);
        const check = tpl.replace(/\{\{ (\w+) \}\}/g, (_m, k) => call.vars[k] ?? "");
        if (check !== val) continue;
        const m = lv.get(call.key) || new Map<string, number>();
        m.set(tpl, (m.get(tpl) || 0) + 1);
        lv.set(call.key, m);
      }
      lcVotes.set(mk.locale, lv);
      for (const [id, val] of found) {
        const m = v.get(id) || new Map<string, number>();
        m.set(val, (m.get(val) || 0) + 1);
        v.set(id, m);
      }
      log(`${full}: ${found.size}`);
    }
    votes.set(mk.locale, v);
  }

  // Settings used as keys (a metafield reference such as "custom.product_text") never show as text,
  // so their translation cannot be read. T-Lab translated some of them, which breaks the lookup on the
  // live store (no product text there). Such a setting is blank in that language when blanking it
  // brings the rendered page closer to the live one.
  setLocaleProbe(null);
  const keyOff: { locale: string; key: string }[] = [];
  const diffCost = (a: string, b: string) => diffArrays(tokens(a), tokens(b)).reduce((n, part) => n + (part.added || part.removed ? part.count || 0 : 0), 0);
  for (const mk of OTHER) {
    const found = votes.get(mk.locale) || new Map();
    for (const p of byId.values()) {
      if (found.has(p.id) || !/^[a-z0-9_-]+\.[a-z0-9_-]+$/i.test(p.source.trim())) continue;
      const pages = [...(pagesOf.get(p.id) || [])].filter((x) => x.startsWith(`/${mk.path}/`) || x === `/${mk.path}`);
      if (!pages.length) continue;
      const cost = async (value: string) => {
        setThemeProbe((key, v) => (key === p.key ? value : v));
        let n = 0;
        for (const full of pages) {
          const res = await handleStorefront(new Request(BASE + full, { headers: { host: new URL(BASE).host, accept: "text/html" } }));
          n += diffCost(await res.text(), (await fetcher.text(BASE + full)) || "");
        }
        return n;
      };
      const keep = await cost(p.source), blank = await cost("");
      if (blank < keep) {
        keyOff.push({ locale: mk.locale, key: p.key });
        log(`${mk.locale}: ${p.key} ("${p.source}") is blank on the live store`);
      }
    }
  }
  setThemeProbe(null);

  // Product-card badges chosen by tag (theme settings "product_card_badge_custom_N_tags"): the
  // probe hides them in both languages, so the live pages are compared directly. A badge that shows
  // in the primary language but on no page of another one is switched off there (blank tag).
  const current = settingsData().current as Record<string, unknown>;
  // texts of the plain badges (custom + sold out; sale badges carry an extra class) on a market's pages
  const plainBadges = async (prefix: string) => {
    const out: string[] = [];
    for (const p of paths) {
      const html = (await fetcher.text(BASE + `/${prefix}${p}`)) || "";
      for (const m of html.matchAll(/class="product-item__badge"[^>]*>\s*([^<]*?)\s*</g)) out.push(decode(m[1]));
    }
    return out;
  };
  const badgeOff: { locale: string; key: string }[] = [];
  const primaryBadges = await plainBadges("bg-bg");
  for (const mk of OTHER) {
    const other = await plainBadges(mk.path);
    if (other.length) continue; // that language shows some: cannot tell which, keep the settings
    for (const n of [1, 2, 3]) {
      const text = String(current[`product_card_badge_custom_${n}_text`] ?? "").trim();
      if (text && current[`product_card_badge_custom_${n}_tags`] && primaryBadges.includes(text)) badgeOff.push({ locale: mk.locale, key: `settings.product_card_badge_custom_${n}_tags` });
    }
  }

  const db = getDb();
  let n = 0;
  db.transaction(() => {
    db.prepare("DELETE FROM translations WHERE owner_type = 'theme'").run();
    const ins = db.prepare("INSERT OR REPLACE INTO translations(locale, owner_type, owner_id, field, value) VALUES(?, 'theme', ?, 'value', ?)");
    for (const [locale, v] of votes) {
      for (const [id, m] of v) {
        const p = byId.get(id)!;
        const best = [...m.entries()].sort((x, y) => y[1] - x[1])[0][0];
        const same = best.replace(/\s+/g, " ").trim() === p.source.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || best === p.source;
        if (!best || same) continue;
        ins.run(locale, p.key, best);
        n++;
      }
    }
    for (const b of [...badgeOff, ...keyOff]) {
      ins.run(b.locale, b.key, "");
      n++;
    }
    // interface strings that differ from the theme's locale file
    db.prepare("DELETE FROM translations WHERE owner_type = 'locale'").run();
    const lins = db.prepare("INSERT OR REPLACE INTO translations(locale, owner_type, owner_id, field, value) VALUES(?, 'locale', ?, 'value', ?)");
    for (const [locale, v] of lcVotes) {
      for (const [key, m] of v) {
        const best = [...m.entries()].sort((x, y) => y[1] - x[1])[0][0];
        const [baseKey, cat] = key.split("#");
        const file = rawTranslation(locale, baseKey);
        const fileText = typeof file === "object" && file ? String((file as Record<string, string>)[cat] ?? (file as Record<string, string>).other ?? "") : String(file ?? "");
        const norm = (x: string) => x.replace(/\{\{\s*(\w+)\s*\}\}/g, "{{ $1 }}").replace(/\s+/g, " ").trim();
        const vars = (x: string) => [...x.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((mm) => mm[1]).sort().join(",");
        if (!best || norm(best) === norm(fileText) || /qq(lc|th|mf)\d+qq/i.test(best)) continue;
        if (vars(best) !== vars(fileText)) continue; // could not rebuild the placeholders reliably
        lins.run(locale, key, best);
        n++;
      }
    }
  })();
  setLocaleProbe(null);
  setThemeProbe(null);
  bumpCatalogVersion();
  log(`done: ${n} translated theme texts (${byKey.size} text settings seen)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
