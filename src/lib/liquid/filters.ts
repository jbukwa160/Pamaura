// Shopify Liquid filters.
import crypto from "node:crypto";
import { formatMoney } from "../money";
import fs from "node:fs";
import { Drop, toValue, type Liquid } from "liquidjs";
import { ColorDrop, FontDrop, ImageDrop, MediaDrop, MetafieldDrop, SDrop, cdnFileUrl, encodeFileName, parseColor } from "./drops/base";
import { ArticleDrop, CollectionDrop, ProductDrop, VariantDrop, handleize, resolveUrl } from "./drops/catalog";
import { AddressDrop, LineItemDrop } from "./drops/store";
import { fontFace, fontFileUrl, fontTable, modifyFont } from "./fonts";
import { shopifyJson } from "./json";
import * as R from "./rnum";
import type { Env } from "./settings";
import { localePath } from "./state";
import { strftime, toDate } from "./strftime";
import { themePath } from "./theme";
import { translate } from "./i18n";
import { assetVersion } from "./assets";
import { richTextToHtml } from "./richtext";
import { placeholderSvg } from "./placeholders";

type Ctx = { context: { globals: Record<string, unknown> } };
const envOf = (self: unknown): Env => (self as Ctx).context.globals.__env as Env;

export function str(v: unknown): string {
  v = toValue(v);
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(str).join("");
  return String(v);
}

function opts(args: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of args) if (Array.isArray(a) && a.length === 2 && typeof a[0] === "string") out[a[0]] = a[1];
  return out;
}
// LiquidJS passes keyword args (`width: 300`) as [key, value] tuples.
function positional(args: unknown[]): unknown[] {
  return args.filter((a) => !(Array.isArray(a) && a.length === 2 && typeof a[0] === "string"));
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
function escapeOnce(s: string): string {
  return escapeHtml(s.replace(/&(amp|lt|gt|quot|#39|#\d+|#x[0-9a-f]+);/gi, (m) => decodeEntity(m))).replace(/&amp;(amp|lt|gt|quot|#39);/g, "&$1;");
}
function decodeEntity(e: string) {
  const m: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
  return m[e.toLowerCase()] ?? e;
}

// ---------------------------------------------------------------------------------------------
// Money


function moneyInput(v: unknown): number | null {
  v = toValue(v);
  if (v === null || v === undefined || v === "") return null;
  const n = R.toNum(v).v;
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------------------------
// Images

interface ImgRef {
  name: string;
  folder: string;
  version: string;
  width: number | null;
  height: number | null;
  alt: string;
}

function imageRef(env: Env, input: unknown): ImgRef | null {
  let v: unknown = input;
  if (v instanceof ImageUrlDrop) return v.ref;
  if (v instanceof LineItemDrop) v = v.image;
  if (v instanceof VariantDrop) v = v.image || v.product.featured_image;
  if (v instanceof ProductDrop) v = v.featured_image;
  if (v instanceof CollectionDrop) v = v.image;
  if (v instanceof ArticleDrop) v = v.image;
  if (v instanceof MediaDrop) v = v.preview_image;
  if (v instanceof MetafieldDrop) v = v.value;
  if (v instanceof ImageDrop) return { name: v.r.name, folder: v.r.folder, version: v.r.version, width: v.r.width, height: v.r.height, alt: v.r.alt || "" };
  const sv = str(v);
  if (!sv) return null;
  let key = sv;
  const cdn = sv.match(/\/cdn\/shop\/(files|products|collections|articles)\/([^?]+)/);
  if (cdn) key = cdn[1] === "files" ? decodeURIComponent(cdn[2]) : `${cdn[1]}/${decodeURIComponent(cdn[2])}`;
  else key = sv.replace(/^files\//, "").replace(/\?.*$/, "");
  const f = env.s.catalog.files.get(key);
  if (!f) return null;
  return { name: f.plain, folder: f.folder, version: f.version, width: f.width, height: f.height, alt: f.alt || "" };
}

/** Result of image_url: prints as the URL, remembers the image for image_tag. */
export class ImageUrlDrop extends SDrop {
  constructor(public url: string, public ref: ImgRef, public width: number | null, public height: number | null) {
    super({ url });
  }
  valueOf() {
    return this.url;
  }
  toString() {
    return this.url;
  }
}

function buildImageUrl(env: Env, ref: ImgRef, o: { width?: unknown; height?: unknown; crop?: unknown; format?: unknown; pad_color?: unknown }) {
  const params: [string, string][] = [];
  const w = o.width !== undefined && o.width !== null ? Math.round(R.toNum(o.width).v) : null;
  const h = o.height !== undefined && o.height !== null ? Math.round(R.toNum(o.height).v) : null;
  // Shopify crops to the centre by default when both width and height are given
  if (o.crop !== undefined && o.crop !== null && str(o.crop)) params.push(["crop", str(o.crop)]);
  else if (o.crop === undefined && w && h) params.push(["crop", "center"]);
  if (o.format) params.push(["format", str(o.format)]);
  if (h) params.push(["height", String(h)]);
  if (o.pad_color) params.push(["pad_color", str(o.pad_color)]);
  params.push(["v", String(ref.version)]);
  if (w) params.push(["width", String(w)]);
  params.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const q = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return { url: `//${env.s.host}/cdn/shop/${ref.folder}/${encodeFileName(ref.name)}?${q}`, w, h };
}

function legacyImgUrl(env: Env, ref: ImgRef, size: string, o: Record<string, unknown>) {
  const dot = ref.name.lastIndexOf(".");
  let base = dot > 0 ? ref.name.slice(0, dot) : ref.name;
  let ext = dot > 0 ? ref.name.slice(dot + 1) : "";
  const sz = size && size !== "master" && size !== "original" ? size : "";
  if (sz) base += `_${sz}`;
  if (o.crop) base += `_crop_${str(o.crop)}`;
  if (o.scale && R.toNum(o.scale).v > 1) base += `@${R.toNum(o.scale).v}x`;
  if (o.format) {
    const f = str(o.format);
    ext = f === "pjpg" ? "progressive.jpg" : f;
  }
  const file = ext ? `${base}.${ext}` : base;
  return `//${env.s.host}/cdn/shop/${ref.folder}/${encodeFileName(file)}?v=${ref.version}`;
}

// ---------------------------------------------------------------------------------------------
// Colors

function toHex(c: [number, number, number, number]) {
  return "#" + c.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}
function fmtNum(n: number) {
  // Ruby-ish: integers stay integers, floats keep their shortest representation
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}
function rgbaStr(c: [number, number, number, number]) {
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${fmtNum(c[3])})`;
}
function colorOut(c: [number, number, number, number]) {
  return c[3] < 1 ? rgbaStr(c) : toHex(c);
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [Math.round((rgb[0] + m) * 255), Math.round((rgb[1] + m) * 255), Math.round((rgb[2] + m) * 255)];
}
function brightness(c: [number, number, number, number]) {
  return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000;
}
function luminance(c: [number, number, number, number]) {
  const ch = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
}
function colorIn(v: unknown) {
  if (v instanceof ColorDrop) return parseColor(v.r.raw);
  return parseColor(str(v));
}
function adjustHsl(v: unknown, fn: (hsl: [number, number, number]) => [number, number, number]) {
  const c = colorIn(v);
  if (!c) return str(v);
  const hsl = fn(rgbToHsl(c[0], c[1], c[2]));
  const rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);
  return colorOut([rgb[0], rgb[1], rgb[2], c[3]]);
}

// ---------------------------------------------------------------------------------------------
// Ruby string helpers

function rubySplit(s: string, sep: string): string[] {
  if (sep === " ") return s.trim().split(/\s+/).filter((x) => x !== "");
  if (sep === "") return [...s];
  const arr = s.split(sep);
  while (arr.length && arr[arr.length - 1] === "") arr.pop();
  return arr;
}

function stripHtml(s: string) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "");
}

function cgiEscape(s: string) {
  return Array.from(Buffer.from(s, "utf8"))
    .map((b) => {
      const c = String.fromCharCode(b);
      if (/[a-zA-Z0-9_.\-~]/.test(c)) return c;
      if (c === " ") return "+";
      return "%" + b.toString(16).toUpperCase().padStart(2, "0");
    })
    .join("");
}

export function toList(v: unknown): unknown[] {
  v = toValue(v);
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "object" && v && Symbol.iterator in (v as object) && typeof v !== "string") return Array.from(v as Iterable<unknown>);
  return [v];
}

function prop(liquid: Liquid, item: unknown, key: string): unknown {
  if (item === null || item === undefined) return undefined;
  if (item instanceof Drop) {
    const val = (item as unknown as Record<string, unknown>)[key];
    if (val === undefined) return (item as Drop).liquidMethodMissing(key, undefined as never);
    return typeof val === "function" ? (val as () => unknown).call(item) : val;
  }
  void liquid;
  return (item as Record<string, unknown>)[key];
}

// ---------------------------------------------------------------------------------------------

export function registerFilters(liquid: Liquid) {
  const reg = (name: string, fn: (this: Ctx, ...args: never[]) => unknown) => liquid.registerFilter(name, fn as never);

  // --- translation
  reg("t", function (key: unknown, ...args: unknown[]) {
    return translate(envOf(this), str(key), opts(args));
  });
  reg("translate", function (key: unknown, ...args: unknown[]) {
    return translate(envOf(this), str(key), opts(args));
  });

  // --- money
  reg("money", function (v: unknown) {
    const n = moneyInput(v);
    return n === null ? "" : formatMoney(n, envOf(this).s.market.money_format);
  });
  reg("money_with_currency", function (v: unknown) {
    const n = moneyInput(v);
    return n === null ? "" : formatMoney(n, envOf(this).s.market.money_with_currency_format);
  });
  reg("money_without_currency", function (v: unknown) {
    const n = moneyInput(v);
    if (n === null) return "";
    const f = envOf(this).s.market.money_format.match(/\{\{\s*\w+\s*\}\}/)?.[0] || "{{amount}}";
    return formatMoney(n, f);
  });
  reg("money_without_trailing_zeros", function (v: unknown) {
    const n = moneyInput(v);
    if (n === null) return "";
    const out = formatMoney(n, envOf(this).s.market.money_format);
    return Math.round(n) % 100 === 0 ? out.replace(/[.,]00(?=\D*$)/, "") : out;
  });

  // --- urls & assets
  reg("asset_url", function (v: unknown) {
    const name = str(v);
    const env = envOf(this);
    const ver = assetVersion(name);
    return `//${env.s.host}/cdn/shop/t/${env.s.themeId}/assets/${encodeFileName(name)}${ver ? `?v=${ver}` : ""}`;
  });
  reg("asset_img_url", function (v: unknown, size?: unknown) {
    const env = envOf(this);
    const name = str(v);
    const ver = assetVersion(name);
    const dot = name.lastIndexOf(".");
    const sz = size && str(size) !== "master" ? `_${str(size)}` : "";
    const file = dot > 0 ? `${name.slice(0, dot)}${sz}${name.slice(dot)}` : name + sz;
    return `//${env.s.host}/cdn/shop/t/${env.s.themeId}/assets/${encodeFileName(file)}${ver ? `?v=${ver}` : ""}`;
  });
  reg("file_url", function (v: unknown) {
    return cdnFileUrl(envOf(this).s, str(v));
  });
  reg("file_img_url", function (v: unknown, size?: unknown) {
    const env = envOf(this);
    const ref = imageRef(env, str(v));
    if (!ref) return cdnFileUrl(env.s, str(v));
    return legacyImgUrl(env, ref, str(size), {});
  });
  reg("shopify_asset_url", function (v: unknown) {
    return `//${envOf(this).s.host}/cdn/shopifycloud/assets/${encodeFileName(str(v))}`;
  });
  reg("global_asset_url", function (v: unknown) {
    return `//${envOf(this).s.host}/cdn/shopifycloud/assets/global/${encodeFileName(str(v))}`;
  });
  reg("stylesheet_tag", function (url: unknown, ...args: unknown[]) {
    const o = opts(args);
    const media = o.media ? str(o.media) : "all";
    if (o.preload) return `<link href="${str(url)}" rel="stylesheet" type="text/css" media="${media}" preload />`;
    return `<link href="${str(url)}" rel="stylesheet" type="text/css" media="${media}" />`;
  });
  reg("script_tag", function (url: unknown) {
    return `<script src="${str(url)}" type="text/javascript"></script>`;
  });
  reg("preload_tag", function (url: unknown, ...args: unknown[]) {
    const o = opts(args);
    const attrs = Object.entries(o)
      .map(([k, v]) => ` ${k}="${escapeHtml(str(v))}"`)
      .join("");
    return `<link href="${str(url)}"${attrs} rel="preload">`;
  });
  reg("inline_asset_content", function (v: unknown) {
    try {
      return fs.readFileSync(themePath("assets", str(v)), "utf8");
    } catch {
      return "";
    }
  });
  reg("within", function (url: unknown, collection: unknown) {
    const u = str(url);
    if (!(collection instanceof CollectionDrop)) return u;
    const m = u.match(/\/products\/([^/?#]+)/);
    if (!m) return u;
    return localePath(envOf(this).s, `/collections/${collection.handle}/products/${m[1]}`);
  });
  reg("link_to", function (text: unknown, url: unknown, title?: unknown) {
    return `<a href="${str(url)}"${title !== undefined ? ` title="${str(title)}"` : ""}>${str(text)}</a>`;
  });
  reg("url_for_vendor", function (v: unknown) {
    return localePath(envOf(this).s, `/collections/vendors?q=${cgiEscape(str(v))}`);
  });
  reg("url_for_type", function (v: unknown) {
    return localePath(envOf(this).s, `/collections/types?q=${cgiEscape(str(v))}`);
  });
  reg("link_to_vendor", function (v: unknown) {
    const s = str(v);
    return s ? `<a href="${localePath(envOf(this).s, `/collections/vendors?q=${cgiEscape(s)}`)}" title="${s}">${s}</a>` : "Unknown Vendor";
  });
  reg("link_to_type", function (v: unknown) {
    const s = str(v);
    return s ? `<a href="${localePath(envOf(this).s, `/collections/types?q=${cgiEscape(s)}`)}" title="${s}">${s}</a>` : "Unknown Type";
  });
  reg("link_to_tag", function (label: unknown, tag: unknown) {
    const t = str(tag);
    return `<a title="Show products matching tag ${t}" href="${handleize(t)}">${str(label)}</a>`;
  });
  reg("sort_by", function (url: unknown, value: unknown) {
    const u = str(url);
    const sep = u.includes("?") ? "&" : "?";
    return `${u.replace(/([?&])sort_by=[^&]*&?/, "$1").replace(/[?&]$/, "")}${sep}sort_by=${str(value)}`;
  });
  reg("customer_login_link", function (text: unknown) {
    return `<a href="${localePath(envOf(this).s, "/account/login")}" id="customer_login_link">${str(text)}</a>`;
  });
  reg("customer_register_link", function (text: unknown) {
    return `<a href="${localePath(envOf(this).s, "/account/register")}" id="customer_register_link">${str(text)}</a>`;
  });
  reg("customer_logout_link", function (text: unknown) {
    return `<a href="${localePath(envOf(this).s, "/account/logout")}" id="customer_logout_link">${str(text)}</a>`;
  });

  // --- images
  reg("image_url", function (v: unknown, ...args: unknown[]) {
    const env = envOf(this);
    const ref = imageRef(env, v);
    if (!ref) return "";
    const o = opts(args);
    const { url, w, h } = buildImageUrl(env, ref, o);
    return new ImageUrlDrop(url, ref, w, h);
  });
  reg("img_url", function (v: unknown, size?: unknown, ...args: unknown[]) {
    const env = envOf(this);
    let o: Record<string, unknown> = {};
    let sz = "";
    if (Array.isArray(size) && size.length === 2 && typeof size[0] === "string") o = opts([size, ...args]);
    else {
      sz = str(size);
      o = opts(args);
    }
    const ref = imageRef(env, v);
    if (!ref) {
      const s = str(v);
      if (s === "" || s === "no-image" || v === null || v === undefined) return `//${env.s.host}/cdn/shopifycloud/assets/no-image-2048-5e88c1b20e087fb7bbe9a3771824e743c244f437e4f8ba93bbf7b11b53f7824c${sz ? "_" + sz : ""}.gif`;
      return s;
    }
    return legacyImgUrl(env, ref, sz, o);
  });
  for (const name of ["product_img_url", "collection_img_url", "article_img_url"]) {
    reg(name, function (v: unknown, size?: unknown) {
      const env = envOf(this);
      const ref = imageRef(env, v);
      if (!ref) return `//${env.s.host}/cdn/shopifycloud/assets/no-image-2048-5e88c1b20e087fb7bbe9a3771824e743c244f437e4f8ba93bbf7b11b53f7824c.gif`;
      return legacyImgUrl(env, ref, str(size) || "small", {});
    });
  }
  reg("image_tag", function (v: unknown, ...args: unknown[]) {
    const env = envOf(this);
    const o = opts(args);
    let ref: ImgRef | null;
    let url: string;
    let reqW: number | null = null;
    let reqH: number | null = null;
    if (v instanceof ImageUrlDrop) {
      ref = v.ref;
      url = v.url;
      reqW = v.width;
      reqH = v.height;
    } else {
      ref = imageRef(env, v);
      if (!ref) return "";
      url = buildImageUrl(env, ref, {}).url;
    }
    if (!ref) return "";
    const ow = ref.width || 0, oh = ref.height || 0;
    // width / height attributes: as passed (Ruby printing, e.g. "2125.0"), else derived
    const derivedW = reqW ?? (reqH && oh ? Math.round((reqH * ow) / oh) : ow);
    const derivedH = reqH ?? (ow ? Math.round((derivedW * oh) / ow) : oh);
    const widthAttr = o.width === null ? "" : o.width !== undefined ? str(o.width) : derivedW ? String(derivedW) : "";
    const heightAttr = o.height === null ? "" : o.height !== undefined ? str(o.height) : derivedH ? String(derivedH) : "";
    let srcset = "";
    if (o.srcset !== null && o.srcset !== undefined) srcset = str(o.srcset);
    else if (o.srcset === undefined) {
      // As observed on Shopify: 352/832/1200/1920 plus the image's own width when it is below the requested width.
      const maxW = reqW ?? ow;
      let widths: number[];
      if (o.widths) widths = str(o.widths).split(",").map((x) => Number(x.trim())).filter(Boolean);
      else {
        widths = [352, 832, 1200, 1920].filter((x) => !maxW || x <= maxW);
        if (ow && maxW && ow < maxW && !widths.includes(ow)) widths.push(ow);
        widths.sort((a, b) => a - b);
      }
      const uniq = [...new Set(widths)];
      srcset = uniq
        .map((wv) => {
          const hv = reqH && reqW ? Math.round((wv * reqH) / reqW) : null;
          const u = buildImageUrl(env, ref!, { width: wv, height: hv ?? undefined, crop: (o as { crop?: unknown }).crop }).url;
          return `${u} ${wv}w`;
        })
        .join(", ");
    }
    const attrs: string[] = [`src="${escapeHtml(url)}"`];
    const alt = o.alt !== undefined ? str(o.alt) : ref.alt;
    attrs.push(`alt="${escapeHtml(alt)}"`);
    if (srcset) attrs.push(`srcset="${escapeHtml(srcset)}"`);
    if (widthAttr) attrs.push(`width="${widthAttr}"`);
    if (heightAttr) attrs.push(`height="${heightAttr}"`);
    for (const [k, val] of Object.entries(o)) {
      if (["alt", "srcset", "widths", "width", "height", "preload"].includes(k)) continue;
      if (val === null || val === false) continue;
      attrs.push(`${k}="${escapeHtml(str(val))}"`);
    }
    return `<img ${attrs.join(" ")}>`;
  });
  reg("placeholder_svg_tag", function (name: unknown, cls?: unknown) {
    return placeholderSvg(str(name), cls === undefined ? "" : str(cls));
  });
  reg("payment_type_svg_tag", function () {
    return "";
  });
  reg("payment_type_img_url", function () {
    return "";
  });

  // --- fonts
  reg("font_face", function (v: unknown, ...args: unknown[]) {
    if (!(v instanceof FontDrop)) return "";
    const o = opts(args);
    return fontFace(envOf(this).s.host, v, o.font_display ? str(o.font_display) : undefined);
  });
  reg("font_url", function (v: unknown, format?: unknown) {
    if (!(v instanceof FontDrop)) return "";
    const e = fontTable().get(v.r.handle);
    if (!e) return "";
    return fontFileUrl(envOf(this).s.host, e, str(format) === "woff" ? "woff" : "woff2") || "";
  });
  reg("font_modify", function (v: unknown, prop: unknown, value: unknown) {
    if (!(v instanceof FontDrop)) return null;
    return modifyFont(v, str(prop), str(value));
  });

  // --- colors
  reg("color_modify", function (v: unknown, attr: unknown, value: unknown) {
    const c = colorIn(v);
    if (!c) return str(v);
    const a = str(attr);
    const n = R.toNum(value).v;
    if (a === "alpha") return rgbaStr([c[0], c[1], c[2], Math.max(0, Math.min(1, n))]);
    if (a === "red" || a === "green" || a === "blue") {
      const i = a === "red" ? 0 : a === "green" ? 1 : 2;
      const out = [...c] as [number, number, number, number];
      out[i] = Math.max(0, Math.min(255, n));
      return colorOut(out);
    }
    const hsl = rgbToHsl(c[0], c[1], c[2]);
    if (a === "hue") hsl[0] = n;
    else if (a === "saturation") hsl[1] = n;
    else if (a === "lightness") hsl[2] = n;
    else return str(v);
    const rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);
    return colorOut([rgb[0], rgb[1], rgb[2], c[3]]);
  });
  reg("color_brightness", function (v: unknown) {
    const c = colorIn(v);
    if (!c) return 0;
    const b = Math.round(brightness(c) * 100) / 100;
    return Number.isInteger(b) ? new R.RFloat(b) : b;
  });
  reg("hex_to_rgba", function (v: unknown, alpha?: unknown) {
    const c = colorIn(v);
    if (!c) return str(v);
    const a = alpha === undefined ? 1 : R.toNum(alpha).v;
    return `rgba(${c[0]},${c[1]},${c[2]},${fmtNum(a)})`;
  });
  reg("color_to_rgb", function (v: unknown) {
    const c = colorIn(v);
    if (!c) return str(v);
    return c[3] < 1 ? rgbaStr(c) : `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  });
  reg("color_to_hex", function (v: unknown) {
    const c = colorIn(v);
    return c ? toHex(c) : str(v);
  });
  reg("color_to_hsl", function (v: unknown) {
    const c = colorIn(v);
    if (!c) return str(v);
    const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
    return c[3] < 1
      ? `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${fmtNum(c[3])})`
      : `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
  });
  reg("color_lighten", function (v: unknown, p: unknown) {
    return adjustHsl(v, ([h, s, l]) => [h, s, Math.min(100, l + R.toNum(p).v)]);
  });
  reg("color_darken", function (v: unknown, p: unknown) {
    return adjustHsl(v, ([h, s, l]) => [h, s, Math.max(0, l - R.toNum(p).v)]);
  });
  reg("color_saturate", function (v: unknown, p: unknown) {
    return adjustHsl(v, ([h, s, l]) => [h, Math.min(100, s + R.toNum(p).v), l]);
  });
  reg("color_desaturate", function (v: unknown, p: unknown) {
    return adjustHsl(v, ([h, s, l]) => [h, Math.max(0, s - R.toNum(p).v), l]);
  });
  reg("color_mix", function (a: unknown, b: unknown, weight: unknown) {
    const c1 = colorIn(a), c2 = colorIn(b);
    if (!c1 || !c2) return str(a);
    const w = R.toNum(weight).v / 100;
    const mix = [0, 1, 2].map((i) => Math.round(c1[i] * w + c2[i] * (1 - w))) as number[];
    const alpha = c1[3] * w + c2[3] * (1 - w);
    return colorOut([mix[0], mix[1], mix[2], alpha]);
  });
  reg("color_contrast", function (a: unknown, b: unknown) {
    const c1 = colorIn(a), c2 = colorIn(b);
    if (!c1 || !c2) return 0;
    const l1 = luminance(c1), l2 = luminance(c2);
    const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    return Math.round(r * 10) / 10;
  });
  reg("color_difference", function (a: unknown, b: unknown) {
    const c1 = colorIn(a), c2 = colorIn(b);
    if (!c1 || !c2) return 0;
    return [0, 1, 2].reduce((n, i) => n + Math.abs(c1[i] - c2[i]), 0);
  });
  reg("brightness_difference", function (a: unknown, b: unknown) {
    const c1 = colorIn(a), c2 = colorIn(b);
    if (!c1 || !c2) return 0;
    return Math.round(Math.abs(brightness(c1) - brightness(c2)));
  });

  // --- strings
  reg("escape", function (v: unknown) {
    const s = toValue(v);
    if (s === null || s === undefined) return s as unknown as string;
    return escapeHtml(str(s));
  });
  reg("h", function (v: unknown) {
    return escapeHtml(str(v));
  });
  reg("escape_once", function (v: unknown) {
    return escapeOnce(str(v));
  });
  reg("handle", function (v: unknown) {
    return handleize(str(v));
  });
  reg("handleize", function (v: unknown) {
    return handleize(str(v));
  });
  reg("camelize", function (v: unknown) {
    return str(v)
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join("");
  });
  reg("capitalize", function (v: unknown) {
    const s = str(v);
    return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
  });
  reg("split", function (v: unknown, sep: unknown) {
    return rubySplit(str(v), str(sep));
  });
  reg("strip_html", function (v: unknown) {
    return stripHtml(str(v));
  });
  reg("newline_to_br", function (v: unknown) {
    return str(v).replace(/\r?\n/g, "<br />\n");
  });
  reg("url_encode", function (v: unknown) {
    return cgiEscape(str(v));
  });
  reg("url_escape", function (v: unknown) {
    return encodeURI(str(v)).replace(/%5B/g, "[").replace(/%5D/g, "]");
  });
  reg("url_param_escape", function (v: unknown) {
    return encodeURI(str(v)).replace(/&/g, "%26").replace(/%5B/g, "[").replace(/%5D/g, "]");
  });
  reg("pluralize", function (n: unknown, one: unknown, many: unknown) {
    return R.toNum(n).v === 1 ? str(one) : str(many);
  });
  reg("md5", function (v: unknown) {
    return crypto.createHash("md5").update(str(v)).digest("hex");
  });
  reg("sha1", function (v: unknown) {
    return crypto.createHash("sha1").update(str(v)).digest("hex");
  });
  reg("sha256", function (v: unknown) {
    return crypto.createHash("sha256").update(str(v)).digest("hex");
  });
  reg("hmac_sha1", function (v: unknown, key: unknown) {
    return crypto.createHmac("sha1", str(key)).update(str(v)).digest("hex");
  });
  reg("hmac_sha256", function (v: unknown, key: unknown) {
    return crypto.createHmac("sha256", str(key)).update(str(v)).digest("hex");
  });
  reg("base64_encode", function (v: unknown) {
    return Buffer.from(str(v), "utf8").toString("base64");
  });
  reg("base64_decode", function (v: unknown) {
    return Buffer.from(str(v), "base64").toString("utf8");
  });
  reg("base64_url_safe_encode", function (v: unknown) {
    return Buffer.from(str(v), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
  });
  reg("base64_url_safe_decode", function (v: unknown) {
    return Buffer.from(str(v).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  });
  reg("json", function (v: unknown) {
    return shopifyJson(v);
  });
  reg("highlight", function (v: unknown, terms: unknown) {
    const s = str(v);
    const t = str(terms).trim();
    if (!t) return s;
    const words = t.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return s.replace(new RegExp(`(${words.join("|")})`, "gi"), '<strong class="highlight">$1</strong>');
  });
  reg("highlight_active_tag", function (v: unknown) {
    return `<span class="active">${str(v)}</span>`;
  });
  reg("weight_with_unit", function (grams: unknown, unit?: unknown) {
    const u = str(unit) || "kg";
    const g = R.toNum(grams).v;
    const n = u === "kg" ? g / 1000 : u === "lb" ? g / 453.59237 : u === "oz" ? g / 28.349523125 : g;
    return `${Math.round(n * 100) / 100} ${u}`;
  });
  reg("default_errors", function (v: unknown) {
    const list = toList(v).map(str);
    if (!list.length) return "";
    return `<div class="errors"><ul>${list.map((m) => `<li>${m}</li>`).join("")}</ul></div>`;
  });
  reg("default_pagination", function (p: unknown) {
    const pg = toValue(p) as Record<string, unknown> | null;
    if (!pg) return "";
    const parts = (pg.parts as { is_link: boolean; title: string; url: string }[]) || [];
    const prev = pg.previous as { url: string; title: string } | null;
    const next = pg.next as { url: string; title: string } | null;
    let out = "";
    if (prev) out += `<span class="prev"><a href="${prev.url}" title="${prev.title}">${prev.title}</a></span>`;
    for (const part of parts) {
      if (part.is_link) out += ` <span class="page"><a href="${part.url}" title="">${part.title}</a></span>`;
      else if (String(part.title) === String(pg.current_page)) out += ` <span class="page current">${part.title}</span>`;
      else out += ` <span class="deco">${part.title}</span>`;
    }
    if (next) out += ` <span class="next"><a href="${next.url}" title="${next.title}">${next.title}</a></span>`;
    return out;
  });
  reg("format_address", function (v: unknown) {
    const a = v instanceof AddressDrop ? v : null;
    if (!a) return "";
    const lines = [
      a.name ? `<span>${escapeHtml(a.name)}</span>` : "",
      a.company ? `<span>${escapeHtml(a.company)}</span>` : "",
      a.address1 ? `<span>${escapeHtml(a.address1)}</span>` : "",
      a.address2 ? `<span>${escapeHtml(a.address2)}</span>` : "",
      [a.zip, a.city].filter(Boolean).length ? `<span>${escapeHtml([a.zip, a.city].filter(Boolean).join(" "))}</span>` : "",
      a.country ? `<span>${escapeHtml(a.country)}</span>` : "",
    ].filter(Boolean);
    return `<p>${lines.join("<br>")}</p>`;
  });
  reg("payment_button", function () {
    return "";
  });
  reg("payment_terms", function () {
    return "";
  });
  reg("login_button", function () {
    return "";
  });
  reg("avatar", function () {
    return "";
  });
  reg("metafield_tag", function (v: unknown) {
    if (!(v instanceof MetafieldDrop)) return str(v);
    const t = v.type;
    if (t === "rich_text_field") return `<div class="metafield-rich_text_field">${richTextToHtml(v.value)}</div>`;
    if (t === "multi_line_text_field") return str(v.raw).replace(/\r?\n/g, "<br />\n");
    if (t === "single_line_text_field" || t === "number_integer" || t === "number_decimal") return escapeHtml(str(v.raw));
    if (t === "url") return `<a href="${escapeHtml(str(v.raw))}" class="metafield-link">${escapeHtml(str(v.raw))}</a>`;
    if (t === "file_reference") {
      const img = v.value as ImageDrop | null;
      if (!img) return "";
      const env = envOf(this);
      const u = buildImageUrl(env, imageRef(env, img)!, {}).url;
      return `<img src="${u}" alt="${escapeHtml(img.alt)}" width="${img.width}" height="${img.height}">`;
    }
    if (t.startsWith("list.")) {
      const items = (v.value as unknown[]) || [];
      return `<ul class="metafield-${t.replace(".", "_")}">${items.map((x) => `<li class="metafield-${t.slice(5)}">${escapeHtml(str(x))}</li>`).join("")}</ul>`;
    }
    return escapeHtml(str(v.raw));
  });
  reg("metafield_text", function (v: unknown) {
    if (!(v instanceof MetafieldDrop)) return str(v);
    if (v.type === "rich_text_field") return stripHtml(richTextToHtml(v.value)).trim();
    return str(v.raw);
  });
  reg("structured_data", function (v: unknown) {
    return shopifyJson(v);
  });
  reg("item_count_for_variant", function (cart: unknown, variantId: unknown) {
    const env = envOf(this);
    const id = Number(R.toNum(variantId).v);
    return env.s.cart.items.filter((i) => i.variant_id === id).reduce((n, i) => n + i.quantity, 0);
  });
  reg("line_items_for", function (cart: unknown, obj: unknown) {
    const items = toList((cart as { items?: unknown })?.items);
    if (obj instanceof ProductDrop) return items.filter((i) => (i as LineItemDrop).product_id === obj.id);
    if (obj instanceof VariantDrop) return items.filter((i) => (i as LineItemDrop).variant_id === obj.id);
    return [];
  });

  // --- media
  // Format observed on Shopify: playsinline first, the given attributes in order (boolean ones as
  // x="x", false omitted), preload="metadata" unless given, aria-label from the alt text, the
  // poster as a legacy _small url, loading="lazy" with preload none; one source: the best mp4.
  reg("video_tag", function (v: unknown, ...args: unknown[]) {
    const env = envOf(this);
    if (!(v instanceof MediaDrop)) return "";
    const media = v;
    const kw = args.filter((a) => Array.isArray(a) && a.length === 2 && typeof a[0] === "string") as [string, unknown][];
    const o = opts(args);
    const BOOL = new Set(["autoplay", "loop", "muted", "controls"]);
    const attrs: string[] = [`playsinline="${o.playsinline !== undefined && o.playsinline !== null ? escapeHtml(str(o.playsinline)) : "playsinline"}"`];
    for (const [k, val] of kw) {
      if (k === "playsinline" || k === "image_size" || k === "alt") continue;
      const tv = toValue(val);
      if (BOOL.has(k)) {
        if (tv === true) attrs.push(`${k}="${k}"`);
        continue;
      }
      if (tv === null || tv === undefined || tv === false) continue;
      attrs.push(`${k}="${escapeHtml(str(tv))}"`);
    }
    if (o.preload === undefined) attrs.push(`preload="metadata"`);
    const alt = o.alt !== undefined ? str(o.alt) : media.alt;
    if (alt) attrs.push(`aria-label="${escapeHtml(alt)}"`);
    const prev = media.preview_image;
    const ref = prev ? imageRef(env, prev) : null;
    const posterUrl = ref ? legacyImgUrl(env, ref, o.image_size ? str(o.image_size) : "small", {}) : "";
    if (posterUrl) attrs.push(`poster="${posterUrl}"`);
    if (str(o.preload) === "none") attrs.push(`loading="lazy"`);
    const mp4 = media.sources.filter((x) => x.format === "mp4").sort((a, b) => b.height - a.height)[0];
    const source = mp4 ? `<source src="${mp4.url}" type="${mp4.mime_type}">` : "";
    return `<video ${attrs.join(" ")}>${source}${posterUrl ? `<img src="${posterUrl}">` : ""}</video>`;
  });
  reg("external_video_url", function (v: unknown, ...args: unknown[]) {
    const m = v instanceof MediaDrop ? v : null;
    if (!m) return "";
    const o = opts(args);
    const q = Object.entries(o)
      .map(([k, val]) => `${k}=${encodeURIComponent(str(val))}`)
      .join("&");
    const base = m.host === "vimeo" ? `https://player.vimeo.com/video/${m.external_id}` : `https://www.youtube.com/embed/${m.external_id}`;
    return q ? `${base}?${q}` : base;
  });
  reg("external_video_tag", function (v: unknown, ...args: unknown[]) {
    const m = v instanceof MediaDrop ? v : null;
    if (!m) return "";
    const o = opts(args);
    const src = typeof v === "string" ? v : m.host === "vimeo" ? `https://player.vimeo.com/video/${m.external_id}` : `https://www.youtube.com/embed/${m.external_id}`;
    const attrs = Object.entries(o)
      .map(([k, val]) => ` ${k}="${escapeHtml(str(val))}"`)
      .join("");
    return `<iframe frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="allowfullscreen" src="${src}"${attrs}></iframe>`;
  });
  reg("media_tag", function (v: unknown, ...args: unknown[]) {
    const env = envOf(this);
    if (v instanceof ImageDrop) {
      const ref = imageRef(env, v)!;
      return `<img src="${buildImageUrl(env, ref, {}).url}" alt="${escapeHtml(v.alt)}">`;
    }
    if (v instanceof MediaDrop && v.media_type === "video") return (liquid.filters as unknown as Record<string, { handler: (...a: unknown[]) => unknown }>)["video_tag"]?.handler.call(this, v, ...args);
    return "";
  });
  reg("model_viewer_tag", function () {
    return "";
  });

  // --- numbers (Ruby semantics)
  reg("plus", (a: unknown, b: unknown) => R.plus(a, b));
  reg("minus", (a: unknown, b: unknown) => R.minus(a, b));
  reg("times", (a: unknown, b: unknown) => R.times(a, b));
  reg("divided_by", (a: unknown, b: unknown) => R.dividedBy(a, b));
  reg("modulo", (a: unknown, b: unknown) => R.modulo(a, b));
  reg("round", (a: unknown, d?: unknown) => R.round(a, d));
  reg("ceil", (a: unknown) => R.ceil(a));
  reg("floor", (a: unknown) => R.floor(a));
  reg("abs", (a: unknown) => R.abs(a));
  reg("at_most", (a: unknown, b: unknown) => R.atMost(a, b));
  reg("at_least", (a: unknown, b: unknown) => R.atLeast(a, b));

  // --- arrays / misc
  reg("default", function (v: unknown, def: unknown, ...args: unknown[]) {
    const o = opts(args);
    const val = toValue(v);
    if (o.allow_false && val === false) return v;
    if (val === null || val === undefined || val === false) return def;
    if ((typeof val === "string" || Array.isArray(val)) && val.length === 0) return def;
    return v;
  });
  reg("where", function (arr: unknown, key: unknown, ...rest: unknown[]) {
    const list = toList(arr);
    const k = str(key);
    if (!rest.length) return list.filter((x) => {
      const pv = toValue(prop(liquid, x, k));
      return pv !== null && pv !== undefined && pv !== false;
    });
    const target = toValue(rest[0]);
    return list.filter((x) => {
      const pv = toValue(prop(liquid, x, k));
      if (Array.isArray(pv)) return pv.some((y) => toValue(y) === target);
      return pv === target || (pv !== null && pv !== undefined && target !== null && String(pv) === String(target) && typeof pv !== "object");
    });
  });
  reg("map", function (arr: unknown, key: unknown) {
    return toList(arr).map((x) => prop(liquid, x, str(key)));
  });
  reg("sort", function (arr: unknown, key?: unknown) {
    const list = [...toList(arr)];
    const get = (x: unknown) => toValue(key === undefined ? x : prop(liquid, x, str(key)));
    return list.sort((a, b) => {
      const x = get(a), y = get(b);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x as number) < (y as number) ? -1 : 1;
    });
  });
  reg("sort_natural", function (arr: unknown, key?: unknown) {
    const list = [...toList(arr)];
    const get = (x: unknown) => str(key === undefined ? x : prop(liquid, x, str(key))).toLowerCase();
    return list.sort((a, b) => get(a).localeCompare(get(b)));
  });
  reg("uniq", function (arr: unknown, key?: unknown) {
    const seen = new Set<unknown>();
    return toList(arr).filter((x) => {
      const k = toValue(key === undefined ? x : prop(liquid, x, str(key)));
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  });
  reg("compact", function (arr: unknown, key?: unknown) {
    return toList(arr).filter((x) => {
      const v = key === undefined ? x : prop(liquid, x, str(key));
      return v !== null && v !== undefined;
    });
  });
  reg("concat", function (a: unknown, b: unknown) {
    return [...toList(a), ...toList(b)];
  });
  reg("join", function (arr: unknown, sep?: unknown) {
    const s = sep === undefined ? " " : str(sep);
    return toList(arr).map(str).join(s);
  });
  reg("sum", function (arr: unknown, key?: unknown) {
    return toList(arr).reduce<unknown>((n, x) => R.plus(n, key === undefined ? x : prop(liquid, x, str(key))), 0);
  });
  reg("find", function (arr: unknown, key: unknown, value: unknown) {
    return toList(arr).find((x) => toValue(prop(liquid, x, str(key))) === toValue(value)) ?? null;
  });
  reg("find_index", function (arr: unknown, key: unknown, value: unknown) {
    const i = toList(arr).findIndex((x) => toValue(prop(liquid, x, str(key))) === toValue(value));
    return i < 0 ? null : i;
  });
  reg("has", function (arr: unknown, key: unknown, value?: unknown) {
    return toList(arr).some((x) => (value === undefined ? !!toValue(prop(liquid, x, str(key))) : toValue(prop(liquid, x, str(key))) === toValue(value)));
  });
  reg("reject", function (arr: unknown, key: unknown, value?: unknown) {
    return toList(arr).filter((x) => (value === undefined ? !toValue(prop(liquid, x, str(key))) : toValue(prop(liquid, x, str(key))) !== toValue(value)));
  });

  // --- dates
  reg("date", function (v: unknown, ...args: unknown[]) {
    const env = envOf(this);
    const o = opts(args);
    const p = positional(args);
    let format = p.length ? str(p[0]) : "";
    if (o.format) {
      const named = str(o.format);
      format = translateDateFormat(env, named);
    }
    const d = toDate(toValue(v));
    if (!d) return v;
    if (!format) return v;
    return strftime(d, format, env.s.catalog.shop.timezone);
  });
  reg("time_tag", function (v: unknown, ...args: unknown[]) {
    const env = envOf(this);
    const o = opts(args);
    const p = positional(args);
    const d = toDate(toValue(v));
    if (!d) return "";
    let format = p.length ? str(p[0]) : "%a, %b %d, %Y";
    if (o.format) format = translateDateFormat(env, str(o.format));
    const tz = env.s.catalog.shop.timezone;
    const dt = o.datetime ? strftime(d, str(o.datetime), tz) : strftime(d, "%Y-%m-%dT%H:%M:%SZ", "UTC");
    return `<time datetime="${dt}">${strftime(d, format, tz)}</time>`;
  });

  // Float literal accessor used by rewritten templates: __f["1.5"]
  void SDrop;
}

function translateDateFormat(env: Env, named: string): string {
  const fromLocale = translate(env, `date_formats.${named}`, {}, true);
  if (fromLocale && !fromLocale.startsWith("translation missing")) return fromLocale;
  const builtIn: Record<string, string> = {
    abbreviated_date: "%b %d, %Y",
    basic: "%m/%d/%Y",
    date: "%B %d, %Y",
    date_at_time: "%B %d, %Y at %-l:%M %P",
    default: "%a, %b %d, %Y, %-l:%M %P %z",
    on_date: "on %B %d, %Y",
    month_day_year: "%B %d, %Y",
    short: "%d %b %H:%M",
    long: "%B %d, %Y %H:%M",
  };
  return builtIn[named] || named;
}

/** Global __f: float literals rewritten by source.ts */
export class FloatLiterals extends SDrop {
  constructor() {
    super({});
  }
  liquidMethodMissing(key: string) {
    const n = parseFloat(String(key));
    return R.make(n, true);
  }
}

export { resolveUrl };

export { formatMoney };
