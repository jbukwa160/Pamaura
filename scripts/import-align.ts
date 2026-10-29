/**
 * Recovers what Shopify's public JSON does not expose, by comparing our rendering with the live
 * pages: product / variant / collection metafields (texts, rich text, images, product lists),
 * the videos behind theme `video` settings, and the upsell-popup metaobjects.
 *
 * How: every unknown value is replaced by a unique probe ("qqmf12qq"), the page is rendered with
 * our engine, both HTMLs are tokenised and diffed (Myers); the live tokens aligned with a probe
 * are its real value.
 *
 *   npm run import:align        (after npm run import)
 */
import fs from "node:fs";
import path from "node:path";
import { attrs, balanced, changedRuns, decode, tokens, tokensWithRaw } from "./import/align-lib";
import { DATA_DIR, FILES_DIR, bumpCatalogVersion, getDb, nowIso } from "../src/lib/db";
import { getCatalog, invalidateCatalog, isPublished, type FileRec, type Metafield } from "../src/lib/catalog";
import { handleStorefront } from "../src/lib/storefront/router";
import { setPlaceholderProbe } from "../src/lib/liquid/placeholders";
import { setSetting } from "../src/lib/db";
import { THEME_DIR } from "../src/lib/liquid/theme";
import { Fetcher } from "./import/fetch";
import sharp from "sharp";

const BASE = (process.env.SHOP_URL || "https://pamaura.com").replace(/\/$/, "");
const fetcher = new Fetcher(path.join(DATA_DIR, "import-cache"), process.argv.includes("--refresh"));
const log = (...a: unknown[]) => console.log("[align]", ...a);
const MARKETS = [
  { path: "bg-bg", locale: "bg", primary: true },
  { path: "ro-ro", locale: "ro", primary: false },
];

type Kind = "rich" | "text" | "file" | "products" | "video";
interface Probe {
  id: number;
  kind: Kind;
  owner: "product" | "variant" | "collection" | "video";
  ownerId: number | string;
  ns: string;
  key: string;
  type: string;
}
const probes: Probe[] = [];
const marker = (p: Probe) => `qqmf${p.id}qq`;
const MARKER_RE = /qqmf(\d+)qq/gi;

const PRODUCT_KEYS: [string, Kind, string][] = [
  ["collapsible_tab_why_", "rich", "rich_text_field"],
  ["collapsible_tab_ingredients_", "rich", "rich_text_field"],
  ["collapsible_tab_how_to_", "rich", "rich_text_field"],
  ["product_rich_text_1_title", "text", "single_line_text_field"],
  ["product_rich_text_1_description", "rich", "rich_text_field"],
  ["product_rich_text_1_image_", "file", "file_reference"],
  ...[2, 3, 4, 5, 6].flatMap((n) => [
    [n === 5 ? `product_rich_text_${n}_title` : `product_rich_text_${n}_title_`, "text", "single_line_text_field"],
    [`product_rich_text_${n}_description_`, "rich", "rich_text_field"],
    [`product_rich_text_${n}_image_`, "file", "file_reference"],
  ]) as [string, Kind, string][],
  ["product_text", "text", "single_line_text_field"],
  ["product_icon_1_image", "file", "file_reference"],
  ["product_icon_1_label", "text", "single_line_text_field"],
  ["product_icon_2_image", "file", "file_reference"],
  ["product_icon_2_label", "text", "single_line_text_field"],
  ["product_icon_3_image", "file", "file_reference"],
  ["product_icon_3_label", "text", "single_line_text_field"],
];
const VARIANT_KEYS: [string, Kind, string][] = [
  ["price_text", "text", "single_line_text_field"],
  ["compare_at_price_text", "text", "single_line_text_field"],
];

// ---------------------------------------------------------------------------------------------
// Probe catalog

function probeFile(name: string, folder = "files"): FileRec {
  return { name, plain: name, folder, mime: "image/png", width: 1000, height: 1000, size: 1, alt: null, version: "1", meta: null };
}

function installProbes() {
  const cat = getCatalog();
  probes.length = 0;
  // translations from an earlier run would replace the probes on the translated pages
  for (const m of cat.translations.values()) {
    for (const k of [...m.keys()]) if (k.startsWith("metafield:") || k.startsWith("metaobject:")) m.delete(k);
  }
  const add = (p: Omit<Probe, "id">) => {
    const pr = { ...p, id: probes.length + 1 };
    probes.push(pr);
    return pr;
  };
  for (const p of cat.products) {
    const list: Metafield[] = (cat.metafields.get(`product:${p.id}`) || []).filter((m) => m.namespace !== "custom");
    for (const [key, kind, type] of PRODUCT_KEYS) {
      const pr = add({ kind, owner: "product", ownerId: p.id, ns: "custom", key, type });
      let value = marker(pr);
      if (kind === "rich") value = `<p>${marker(pr)}</p>`;
      if (kind === "file") {
        value = `${marker(pr)}.png`;
        cat.files.set(value, probeFile(value));
      }
      list.push({ namespace: "custom", key, type, value });
    }
    // upsells: every other product, so the live page shows which ones are real
    const pr = add({ kind: "products", owner: "product", ownerId: p.id, ns: "custom", key: "upsells", type: "list.product_reference" });
    void pr;
    list.push({ namespace: "custom", key: "upsells", type: "list.product_reference", value: JSON.stringify(cat.products.filter((x) => x.id !== p.id && isPublished(x)).map((x) => `gid://shopify/Product/${x.id}`)) });
    cat.metafields.set(`product:${p.id}`, list);
    for (const v of p.variants) {
      const vlist: Metafield[] = [];
      for (const [key, kind, type] of VARIANT_KEYS) {
        const vp = add({ kind, owner: "variant", ownerId: v.id, ns: "custom", key, type });
        vlist.push({ namespace: "custom", key, type, value: marker(vp) });
      }
      cat.metafields.set(`variant:${v.id}`, vlist);
    }
  }
  for (const c of cat.collections) {
    const pr = add({ kind: "file", owner: "collection", ownerId: c.id, ns: "custom", key: "mobile_collection_banner_image", type: "file_reference" });
    const name = `${marker(pr)}.png`;
    cat.files.set(name, probeFile(name));
    cat.metafields.set(`collection:${c.id}`, [{ namespace: "custom", key: "mobile_collection_banner_image", type: "file_reference", value: name }]);
  }
  // theme `video` settings → Content → Files videos
  for (const name of themeVideoNames()) {
    const pr = add({ kind: "video", owner: "video", ownerId: name, ns: "", key: name, type: "video" });
    const m = marker(pr);
    cat.files.set(name, {
      name,
      plain: name,
      folder: "videos",
      mime: "video/mp4",
      width: 1080,
      height: 1920,
      size: 1,
      alt: null,
      version: "1",
      meta: { sources: [0, 1, 2, 3].map((i) => ({ format: "mp4", mime_type: "video/mp4", url: `${m}/s${i}.mp4`, width: 1080, height: 1920 })), preview: null, width: 1080, height: 1920 },
    });
  }
}

function themeVideoNames(): string[] {
  const names = new Set<string>();
  for (const dir of ["templates", "sections", "config"]) {
    for (const f of fs.readdirSync(path.join(THEME_DIR, dir))) {
      if (!f.endsWith(".json")) continue;
      const s = fs.readFileSync(path.join(THEME_DIR, dir, f), "utf8");
      for (const m of s.matchAll(/shopify:\\?\/\\?\/files\\?\/videos\\?\/([^"\\]+)/g)) names.add(decodeURIComponent(m[1]));
    }
  }
  return [...names];
}

interface Found {
  probe: Probe;
  value: string;
}

const seenVersions = new Map<string, string>();

function fileNameFromUrl(u: string): string | null {
  const vq = decode(u).match(/[?&]v=(\d+)/);
  const m = decode(u).match(/\/cdn\/shop\/(files|products|collections)\/([^?")]+)/);
  if (!m) return null;
  const prefix = m[1] === "files" ? "" : `${m[1]}/`;
  const key = prefix + decodeURIComponent(m[2]).replace(/_(\d+x\d*|x\d+|pico|icon|thumb|small|compact|medium|large|grande|original|master)(_crop_[a-z]+)?(@\dx)?(\.progressive)?(\.[a-z0-9]+)$/i, "$5");
  if (vq) seenVersions.set(key, vq[1]);
  return key;
}

function extract(oursHtml: string, liveHtml: string): Found[] {
  const a = tokens(oursHtml);
  const lv = tokensWithRaw(liveHtml);
  const b = lv.tok;
  const { pairs, liveIndexOf } = changedRuns(a, b);
  const found: Found[] = [];
  const byId = new Map(probes.map((p) => [p.id, p]));
  // rich text: the wrapper div is identical in both → take the live content of that element
  a.forEach((t, i) => {
    if (!/^<div class="metafield-rich_text_field">$/.test(t)) return;
    const m = (a[i + 2] || "").match(/^qqmf(\d+)qq$/i);
    if (!m) return;
    const pr = byId.get(Number(m[1]));
    const li = liveIndexOf(i);
    if (!pr || li < 0) return;
    found.push({ probe: pr, value: balanced(b, li, lv.raw, lv.gaps).trim() });
  });
  for (const pair of pairs) {
    const ourText = pair.ours.join("\u0001");
    const ids = [...ourText.matchAll(MARKER_RE)].map((m) => Number(m[1]));
    if (!ids.length) continue;
    for (const id of new Set(ids)) {
      const pr = byId.get(id);
      if (!pr || pr.kind === "rich" || pr.kind === "products") continue;
      const mk = marker(pr);
      // attribute value?
      const tagIdx = pair.ours.findIndex((t) => t.startsWith("<") && t.toLowerCase().includes(mk));
      if (tagIdx >= 0) {
        const ot = attrs(pair.ours[tagIdx]);
        const attrName = Object.keys(ot).find((k) => ot[k].toLowerCase().includes(mk));
        const tagName = pair.ours[tagIdx].match(/^<([a-z0-9-]+)/i)?.[1];
        const lt = pair.live.find((t) => t.startsWith(`<${tagName}`) && attrName && attrs(t)[attrName] !== undefined);
        if (!lt || !attrName) continue;
        const lv = attrs(lt)[attrName];
        if (pr.kind === "file") {
          const name = fileNameFromUrl(lv);
          if (name) found.push({ probe: pr, value: name });
        } else if (pr.kind === "video") {
          const m = lv.match(/\/cdn\/shop\/videos\/c\/vp\/([0-9a-f]+)\//);
          if (m) found.push({ probe: pr, value: m[1] });
        } else {
          const ov = ot[attrName];
          const pos = ov.toLowerCase().indexOf(mk);
          const pre = ov.slice(0, pos), post = ov.slice(pos + mk.length);
          if (lv.startsWith(pre) && lv.endsWith(post)) found.push({ probe: pr, value: decode(lv.slice(pre.length, lv.length - post.length)) });
        }
        continue;
      }
      // file / video referenced inside text (CSS background-image: url(...))
      if (pr.kind === "file" || pr.kind === "video") {
        const ti = pair.ours.findIndex((t) => !t.startsWith("<") && t.toLowerCase().includes(mk));
        if (ti < 0) continue;
        const ot = pair.ours[ti];
        const um = ot.match(new RegExp(`(?:https?:)?//[^\\s)'"]*${mk}[^\\s)'"]*`, "i"));
        if (!um) continue;
        const pre = ot.slice(Math.max(0, um.index! - 40), um.index!);
        const liveText = pair.live.filter((t) => !t.startsWith("<")).join(" ");
        // the same occurrence of the context as in our text (desktop and mobile rules look alike)
        let occ = 0;
        for (let k = ot.indexOf(pre); k >= 0 && k < um.index! - pre.length; k = ot.indexOf(pre, k + 1)) occ++;
        let at = -1;
        for (let k = 0, from = 0; k <= occ; k++) {
          at = liveText.indexOf(pre, from);
          if (at < 0) break;
          from = at + 1;
        }
        const rest = at >= 0 ? liveText.slice(at + pre.length) : liveText;
        const lu = rest.match(/(?:https?:)?\/\/[^\s)'"]+/);
        if (!lu) continue;
        if (pr.kind === "file") {
          const name = fileNameFromUrl(lu[0]);
          if (name) found.push({ probe: pr, value: name });
        } else {
          const vm = lu[0].match(/\/cdn\/shop\/videos\/c\/vp\/([0-9a-f]+)\//);
          if (vm) found.push({ probe: pr, value: vm[1] });
        }
        continue;
      }
      // text
      if (pr.kind !== "text") continue;
      const ti = pair.ours.findIndex((t) => !t.startsWith("<") && t.toLowerCase().includes(mk));
      if (ti < 0) continue;
      const ot = pair.ours[ti];
      const pos = ot.toLowerCase().indexOf(mk);
      const pre = ot.slice(0, pos).trim(), post = ot.slice(pos + mk.length).trim();
      const liveText = pair.live.filter((t) => !t.startsWith("<")).join(" ");
      if (!pair.live.length) {
        found.push({ probe: pr, value: "" });
        continue;
      }
      let v = liveText;
      if (pre && v.startsWith(pre)) v = v.slice(pre.length);
      if (post && v.endsWith(post)) v = v.slice(0, v.length - post.length);
      found.push({ probe: pr, value: decode(v.trim()) });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------

async function renderOurs(p: string): Promise<string> {
  const res = await handleStorefront(new Request(BASE + p, { headers: { host: new URL(BASE).host, accept: "text/html" } }));
  return res.text();
}

async function liveHtml(p: string): Promise<string> {
  return (await fetcher.text(BASE + p)) || "";
}

async function main() {
  process.env.SITE_URL = BASE;
  const cat0 = getCatalog();
  if (!cat0.products.length) throw new Error("Run npm run import first.");
  installProbes();
  const cat = getCatalog();

  const pagePaths: string[] = [];
  for (const p of cat.products.filter(isPublished)) pagePaths.push(`/products/${encodeURIComponent(p.handle)}`);
  for (const c of cat.collections.filter((c) => c.published)) pagePaths.push(`/collections/${encodeURIComponent(c.handle)}`);
  for (const p of cat.pages.filter((p) => p.template_suffix)) pagePaths.push(`/pages/${encodeURIComponent(p.handle)}`);
  pagePaths.push("");

  const results = new Map<string, Map<number, Map<string, number>>>(); // locale → probe → value → votes
  const upsells = new Map<number, number[]>();
  const popups = new Map<number, { title: Record<string, string>; entries: { variant: number; text: Record<string, string> }[] }>();

  for (const mk of MARKETS) {
    for (const p of pagePaths) {
      const full = `/${mk.path}${p}`;
      const [ours, live] = [await renderOurs(full), await liveHtml(full)];
      if (!live) {
        log(`! no live page for ${full}`);
        continue;
      }
      const found = extract(ours, live);
      const r = results.get(mk.locale) || new Map();
      for (const f of found) {
        const votes = r.get(f.probe.id) || new Map<string, number>();
        votes.set(f.value, (votes.get(f.value) || 0) + 1);
        r.set(f.probe.id, votes);
      }
      results.set(mk.locale, r);

      const pm = p.match(/^\/products\/(.+)$/);
      if (pm) {
        const prod = cat.productByHandle.get(decodeURIComponent(pm[1]))!;
        // upsells: product ids inside this product's cross-sell blocks on the live page
        if (mk.primary) {
          const ids: number[] = [];
          for (const m of live.matchAll(/id="product-form-product-recommendation-cross_sell_[^"]*"[\s\S]*?name="product-id" value="(\d+)"/g)) {
            const id = Number(m[1]);
            if (id !== prod.id && !ids.includes(id)) ids.push(id);
          }
          if (ids.length) upsells.set(prod.id, ids);
        }
        // upsell popup (metaobject)
        const pop = live.match(/<upsell-popup>([\s\S]*?)<\/upsell-popup>/);
        if (pop) {
          const title = decode((pop[1].match(/<h3 class="upsell-popup-title h5">\s*([\s\S]*?)\s*<\/h3>/)?.[1] || "").trim());
          const entries = [...pop[1].matchAll(/<upsell-popup-product data-variant-id="(\d+)"([\s\S]*?)<\/upsell-popup-product>/g)].map((m) => ({
            variant: Number(m[1]),
            text: decode((m[2].match(/<span class="short-description-text">\s*([\s\S]*?)\s*<\/span>/)?.[1] || "").trim()),
          }));
          // a popup without product cards: on Shopify its entry points at a product that no longer
          // exists; keep such an entry (variant 0) so the popup still opens with its title and buttons
          if (!entries.length) entries.push({ variant: 0, text: "" });
          const rec = popups.get(prod.id) || { title: {}, entries: entries.map((e) => ({ variant: e.variant, text: {} as Record<string, string> })) };
          rec.title[mk.locale] = title;
          entries.forEach((e, i) => {
            if (rec.entries[i]) rec.entries[i].text[mk.locale] = e.text;
          });
          popups.set(prod.id, rec);
        }
      }
      log(`${full}: ${found.length} values`);
    }
  }

  // ---- write
  invalidateCatalog();
  const db = getDb();
  const best = (locale: string, id: number): string | null => {
    const v = results.get(locale)?.get(id);
    if (!v) return null;
    const sorted = [...v.entries()].sort((x, y) => y[1] - x[1]);
    return sorted[0][0];
  };

  const videoHashes = new Map<string, string>();
  const fileNames = new Set<string>();
  db.transaction(() => {
    db.prepare("DELETE FROM metafields WHERE namespace = 'custom'").run();
    db.prepare("DELETE FROM translations WHERE owner_type IN ('metafield','metaobject')").run();
    const ins = db.prepare("INSERT OR REPLACE INTO metafields(owner_type, owner_id, namespace, key, type, value) VALUES(?, ?, ?, ?, ?, ?)");
    const tins = db.prepare("INSERT OR REPLACE INTO translations(locale, owner_type, owner_id, field, value) VALUES(?, ?, ?, ?, ?)");
    let n = 0;
    for (const pr of probes) {
      const v = best("bg", pr.id);
      if (pr.kind === "video") {
        if (v) videoHashes.set(String(pr.ownerId), v);
        continue;
      }
      if (v === null || v === "") continue;
      if (pr.kind === "file") fileNames.add(v);
      ins.run(pr.owner, pr.ownerId, pr.ns, pr.key, pr.type, v);
      n++;
      const ro = best("ro", pr.id);
      if (ro && ro !== v && pr.kind !== "file") tins.run("ro", "metafield", `${pr.owner}.${pr.ownerId}.${pr.ns}.${pr.key}`, "value", ro);
    }
    for (const [pid, ids] of upsells) {
      ins.run("product", pid, "custom", "upsells", "list.product_reference", JSON.stringify(ids.map((id) => `gid://shopify/Product/${id}`)));
      n++;
    }
    // upsell popups → metaobjects
    db.prepare("DELETE FROM metaobjects WHERE type IN ('upsell_popup', 'upsell_popup_product')").run();
    let moId = 1;
    const moIns = db.prepare("INSERT INTO metaobjects(id, type, handle, fields) VALUES(?, ?, ?, ?)");
    for (const [pid, pop] of popups) {
      const entryGids: string[] = [];
      pop.entries.forEach((e, i) => {
        const id = moId++;
        moIns.run(id, "upsell_popup_product", `popup-${pid}-${i + 1}`, JSON.stringify({ product_variant: { type: "variant_reference", value: `gid://shopify/ProductVariant/${e.variant}` }, short_description: { type: "single_line_text_field", value: e.text.bg || "" } }));
        if (e.text.ro && e.text.ro !== e.text.bg) tins.run("ro", "metaobject", String(id), "short_description", e.text.ro);
        entryGids.push(`gid://shopify/Metaobject/${id}`);
      });
      const pidMo = moId++;
      moIns.run(pidMo, "upsell_popup", `popup-${pid}`, JSON.stringify({ upsell_popup_title: { type: "single_line_text_field", value: pop.title.bg || "" }, upsell_popup_products: { type: "list.metaobject_reference", value: JSON.stringify(entryGids) } }));
      if (pop.title.ro && pop.title.ro !== pop.title.bg) tins.run("ro", "metaobject", String(pidMo), "upsell_popup_title", pop.title.ro);
      ins.run("product", pid, "custom", "upsell_popup_variants", "metaobject_reference", `gid://shopify/Metaobject/${pidMo}`);
      n++;
    }
    log(`metafields written: ${n}; upsell lists: ${upsells.size}; popups: ${popups.size}`);
  })();

  // files referenced by metafields that the first import did not download
  for (const name of fileNames) {
    const exists = db.prepare("SELECT 1 FROM files WHERE name = ?").get(name);
    if (exists) continue;
    const slash = name.indexOf("/");
    const folder = slash > 0 && ["products", "collections"].includes(name.slice(0, slash)) ? name.slice(0, slash) : "files";
    const plain = folder === "files" ? name : name.slice(folder.length + 1);
    const dest = path.join(FILES_DIR, folder, plain);
    const url = `${BASE}/cdn/shop/${folder}/${plain.split("/").map(encodeURIComponent).join("/")}`;
    try {
      await fetcher.download(url, dest);
      const md = plain.endsWith(".svg") ? { width: null, height: null } : await sharp(dest).metadata();
      db.prepare("INSERT INTO files(name, folder, mime, width, height, size, version, source_url, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        name,
        folder,
        plain.endsWith(".svg") ? "image/svg+xml" : plain.endsWith(".png") ? "image/png" : plain.endsWith(".webp") ? "image/webp" : "image/jpeg",
        md.width ?? null,
        md.height ?? null,
        fs.statSync(dest).size,
        seenVersions.get(name) || String(Math.floor(Date.now() / 1000)),
        url,
        nowIso(),
      );
      log(`downloaded metafield file ${name}`);
    } catch (e) {
      log(`! ${name}: ${(e as Error).message}`);
    }
  }

  // theme videos: renditions from the HLS master playlist, in Shopify's source order
  for (const [name, hash] of videoHashes) {
    const m3u8 = await fetcher.text(`${BASE}/cdn/shop/videos/c/vp/${hash}/${hash}.m3u8`);
    if (!m3u8) {
      log(`! video ${name}: no playlist`);
      continue;
    }
    const streams = [...m3u8.matchAll(/RESOLUTION=(\d+)x(\d+)[^\n]*\n([^\n]+\.m3u8)/g)].map((m) => {
      const file = m[3].trim(); // HASH.HD-1080p.7.2Mbps.hls.56414019_.m3u8
      const q = file.match(/\.(SD|HD)-(\d+p)\.([\d.]+Mbps)\.hls\.(\d+)_\.m3u8$/);
      return { width: Number(m[1]), height: Number(m[2]), mp4: q ? `${hash}.${q[1]}-${q[2]}-${q[3]}-${q[4]}.mp4` : null };
    });
    // Shopify lists a Files video's sources as [HLS playlist, best mp4] (product media list more).
    const top = streams.filter((s) => s.mp4).sort((x, y) => y.height - x.height)[0];
    const sources = [
      { format: "m3u8", mime_type: "application/x-mpegURL", url: `c/vp/${hash}/${hash}.m3u8`, width: top?.width ?? 0, height: top?.height ?? 0 },
      ...(top ? [{ format: "mp4", mime_type: "video/mp4", url: `c/vp/${hash}/${top.mp4}`, width: top.width, height: top.height }] : []),
    ];
    for (const s of sources.filter((x) => x.format === "mp4")) {
      try {
        await fetcher.download(`${BASE}/cdn/shop/videos/${s.url}`, path.join(FILES_DIR, "videos", s.url));
      } catch (e) {
        log(`! ${s.url}: ${(e as Error).message}`);
      }
    }
    const previewName = `preview_images/${hash}.thumbnail.0000000000.jpg`;
    let preview: string | null = null;
    try {
      await fetcher.download(`${BASE}/cdn/shop/files/${previewName}`, path.join(FILES_DIR, "files", previewName));
      preview = previewName;
      if (!db.prepare("SELECT 1 FROM files WHERE name = ?").get(previewName)) {
        const md = await sharp(path.join(FILES_DIR, "files", previewName)).metadata();
        db.prepare("INSERT INTO files(name, folder, mime, width, height, size, version, source_url, created_at) VALUES(?, 'files', 'image/jpeg', ?, ?, ?, ?, ?, ?)").run(
          previewName,
          md.width ?? null,
          md.height ?? null,
          fs.statSync(path.join(FILES_DIR, "files", previewName)).size,
          "1",
          `${BASE}/cdn/shop/files/${previewName}`,
          nowIso(),
        );
      }
    } catch {
      /* no preview */
    }
    db.prepare(
      `INSERT INTO files(name, folder, mime, width, height, size, version, source_url, meta, created_at) VALUES(?, 'videos', 'video/mp4', ?, ?, 0, '0', ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET folder='videos', width=excluded.width, height=excluded.height, meta=excluded.meta`,
    ).run(name, top?.width ?? null, top?.height ?? null, `${BASE}/cdn/shop/videos/c/vp/${hash}/${hash}.m3u8`, JSON.stringify({ sources, preview, width: top?.width, height: top?.height }), nowIso());
    log(`video ${name} → ${hash} (${sources.length - 1} renditions)`);
  }
  // Shopify's placeholder illustrations as shown on the live pages (collections list, empty images)
  invalidateCatalog();
  setPlaceholderProbe(true);
  const found: Record<string, string> = {};
  const phPages = ["/bg-bg/collections", "/bg-bg", ...getCatalog().pages.filter((pg) => pg.published).map((pg) => `/bg-bg/pages/${encodeURIComponent(pg.handle)}`)];
  for (const p of phPages) {
    const ours = await renderOurs(p);
    const live = await liveHtml(p);
    const names = [...ours.matchAll(/<svg data-ph="([^"]+)"><\/svg>/g)].map((m) => m[1]);
    const liveSvgs = [...live.matchAll(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 525\.5 525\.5"[^>]*>[\s\S]*?<\/svg>/g)].map((m) => m[0].replace(/ class="[^"]*"/, ""));
    if (names.length && names.length === liveSvgs.length) names.forEach((n, i) => (found[n] = found[n] || liveSvgs[i]));
  }
  setPlaceholderProbe(false);
  if (Object.keys(found).length) setSetting("placeholders", found);
  log(`placeholders: ${Object.keys(found).join(", ") || "none"}`);

  // Loox ratings (an earlier reviews app): product metafields loox.avg_rating / loox.num_reviews. Only the
  // Klaviyo "Viewed Product" snippet prints them, so they are read from it on the live product pages.
  {
    const db2 = getDb();
    const ins = db2.prepare("INSERT OR REPLACE INTO metafields(owner_type, owner_id, namespace, key, type, value) VALUES('product', ?, 'loox', ?, ?, ?)");
    let n = 0;
    db2.prepare("DELETE FROM metafields WHERE namespace = 'loox'").run();
    for (const prod of getCatalog().products.filter(isPublished)) {
      const html = await liveHtml(`/bg-bg/products/${encodeURIComponent(prod.handle)}`);
      const rating = html.match(/MetafieldLooxRating = "([^"]+)"/)?.[1];
      const count = html.match(/MetafieldLooxCount = (\d+)/)?.[1];
      if (rating) ins.run(prod.id, "avg_rating", "single_line_text_field", rating);
      if (count) ins.run(prod.id, "num_reviews", "number_integer", count);
      if (rating || count) n++;
    }
    log(`loox ratings: ${n} products`);
  }

  // Product recommendations (cart page "Recommended", related products): Shopify's own lists, read from
  // its public endpoint and kept as the Search & Discovery metafields our recommendations use first.
  {
    const db2 = getDb();
    const ins = db2.prepare(
      "INSERT OR REPLACE INTO metafields(owner_type, owner_id, namespace, key, type, value) VALUES('product', ?, 'shopify--discovery--product_recommendation', ?, 'list.product_reference', ?)",
    );
    db2.prepare("DELETE FROM metafields WHERE namespace = 'shopify--discovery--product_recommendation'").run();
    let n = 0;
    for (const prod of getCatalog().products.filter(isPublished)) {
      for (const [intent, key] of [
        ["related", "related_products"],
        ["complementary", "complementary_products"],
      ] as const) {
        const data = await fetcher.json<{ products: { id: number }[] }>(`${BASE}/bg-bg/recommendations/products.json?product_id=${prod.id}&limit=10&intent=${intent}`);
        if (!data) continue;
        ins.run(prod.id, key, JSON.stringify(data.products.map((p) => `gid://shopify/Product/${p.id}`)));
        n++;
      }
    }
    log(`recommendations: ${n} lists`);
  }

  const missingVideos = themeVideoNames().filter((n) => !videoHashes.has(n));
  if (missingVideos.length) log(`videos not shown on any live page (left unset): ${missingVideos.join(", ")}`);
  bumpCatalogVersion();
  log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
