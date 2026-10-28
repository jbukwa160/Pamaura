// Static files under /cdn: theme assets, uploaded files (resized on demand like Shopify's CDN),
// videos (with HTTP ranges), fonts and the small Shopify helper scripts the theme loads.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DATA_DIR, FILES_DIR } from "../db";
import { FONTS_DIR } from "../liquid/fonts";
import { themePath } from "../liquid/theme";
import { SHOPIFY_COMMON_JS } from "./shopify-common";
import { flagSvg } from "../liquid/switcher";

const TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
};

const IMMUTABLE = "public, max-age=31536000, immutable";

function typeOf(file: string) {
  return TYPES[file.split(".").pop()!.toLowerCase()] || "application/octet-stream";
}

function inside(root: string, file: string) {
  const r = path.resolve(root) + path.sep;
  return path.resolve(file).startsWith(r);
}

function fileResponse(req: Request, file: string, cache: string): Response {
  const st = fs.statSync(file);
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cache } });
  const type = typeOf(file);
  const range = req.headers.get("range");
  if (range && /^video\//.test(type)) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      if (start >= st.size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${st.size}` } });
      const stream = fs.createReadStream(file, { start, end });
      return new Response(stream as unknown as ReadableStream, {
        status: 206,
        headers: { "Content-Type": type, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Cache-Control": cache, ETag: etag },
      });
    }
  }
  const body = /^video\//.test(type) ? (fs.createReadStream(file) as unknown as ReadableStream) : fs.readFileSync(file);
  return new Response(body as BodyInit, { headers: { "Content-Type": type, "Content-Length": String(st.size), "Cache-Control": cache, ETag: etag, "Accept-Ranges": "bytes" } });
}

const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });

// legacy size suffixes: name_600x.jpg, name_1000x1000_crop_center@2x.progressive.jpg
const LEGACY = /^(.*?)_(\d+x\d*|x\d+|pico|icon|thumb|small|compact|medium|large|grande|original|master)(?:_crop_(top|center|bottom|left|right))?(?:@(\d)x)?(\.progressive)?\.([a-z0-9]+)$/i;
const NAMED: Record<string, [number, number]> = {
  pico: [16, 16],
  icon: [32, 32],
  thumb: [50, 50],
  small: [100, 100],
  compact: [160, 160],
  medium: [240, 240],
  large: [480, 480],
  grande: [600, 600],
};

interface Transform {
  width?: number;
  height?: number;
  crop?: string;
  format?: string;
  fit: "inside" | "cover";
}

function findOriginal(folder: string, name: string): { file: string; t: Transform | null } | null {
  const base = path.join(/*turbopackIgnore: true*/ FILES_DIR, folder);
  const direct = path.join(/*turbopackIgnore: true*/ base, name);
  if (inside(base, direct) && fs.existsSync(direct) && fs.statSync(direct).isFile()) return { file: direct, t: null };
  // files uploaded through Shopify "products" may live in files/ after import and vice versa
  const alt = path.join(/*turbopackIgnore: true*/ FILES_DIR, folder === "files" ? "products" : "files", name);
  if (inside(FILES_DIR, alt) && fs.existsSync(alt)) return { file: alt, t: null };
  const m = name.match(LEGACY);
  if (!m) return null;
  const [, stem, size, crop, scale, progressive, ext] = m;
  for (const candidateExt of [ext, "jpg", "jpeg", "png", "webp", "gif"]) {
    const orig = path.join(/*turbopackIgnore: true*/ base, `${stem}.${candidateExt}`);
    if (!inside(base, orig) || !fs.existsSync(orig)) continue;
    let w: number | undefined, h: number | undefined;
    if (NAMED[size.toLowerCase()]) [w, h] = NAMED[size.toLowerCase()];
    else if (!/^(original|master)$/i.test(size)) {
      const [sw, sh] = size.split("x");
      w = sw ? Number(sw) : undefined;
      h = sh ? Number(sh) : undefined;
    }
    const k = scale ? Number(scale) : 1;
    return { file: orig, t: { width: w ? w * k : undefined, height: h ? h * k : undefined, crop: crop || undefined, format: progressive ? "pjpg" : candidateExt !== ext ? ext : undefined, fit: crop ? "cover" : "inside" } };
  }
  return null;
}

const CACHE_DIR = path.join(DATA_DIR, "cache", "images");

async function transformed(req: Request, orig: string, t: Transform): Promise<Response> {
  const type = typeOf(orig);
  if (type === "image/svg+xml" || type === "image/gif") return fileResponse(req, orig, IMMUTABLE);
  const accept = req.headers.get("accept") || "";
  let outFormat = t.format === "pjpg" ? "jpeg" : t.format === "jpg" ? "jpeg" : t.format || "";
  if (!outFormat) outFormat = accept.includes("image/webp") ? "webp" : type === "image/png" ? "png" : "jpeg";
  const st = fs.statSync(orig);
  const key = crypto.createHash("sha1").update(`${orig}|${st.mtimeMs}|${t.width}|${t.height}|${t.crop}|${t.fit}|${outFormat}`).digest("hex");
  const cached = path.join(CACHE_DIR, key.slice(0, 2), `${key}.${outFormat}`);
  if (!fs.existsSync(cached)) {
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    let img = sharp(orig, { failOn: "none" }).rotate();
    if (t.width || t.height) {
      const pos = t.crop === "top" ? "north" : t.crop === "bottom" ? "south" : t.crop === "left" ? "west" : t.crop === "right" ? "east" : "centre";
      img = img.resize({ width: t.width, height: t.height, fit: t.fit === "cover" && t.width && t.height ? "cover" : "inside", position: pos, withoutEnlargement: true });
    }
    if (outFormat === "webp") img = img.webp({ quality: 82 });
    else if (outFormat === "png") img = img.png({ compressionLevel: 8 });
    else if (outFormat === "avif") img = img.avif({ quality: 60 });
    else img = img.jpeg({ quality: 85, progressive: true, mozjpeg: true });
    const tmp = `${cached}.${process.pid}.tmp`;
    await img.toFile(tmp);
    fs.renameSync(tmp, cached);
  }
  const res = fileResponse(req, cached, IMMUTABLE);
  res.headers.set("Vary", "Accept");
  return res;
}

export async function serveCdn(req: Request, pathname: string, search: URLSearchParams): Promise<Response | null> {
  let m = pathname.match(/^\/cdn\/shop\/t\/\d+\/assets\/(.+)$/);
  if (m) {
    const name = decodeURIComponent(m[1]);
    const file = themePath("assets", name);
    if (!inside(themePath("assets"), file) || !fs.existsSync(file)) return notFound();
    return fileResponse(req, file, search.has("v") ? IMMUTABLE : "public, max-age=3600");
  }
  m = pathname.match(/^\/cdn\/shop\/videos\/(.+)$/);
  if (m) {
    const file = path.join(FILES_DIR, "videos", decodeURIComponent(m[1]));
    if (!inside(path.join(FILES_DIR, "videos"), file) || !fs.existsSync(file)) return notFound();
    return fileResponse(req, file, IMMUTABLE);
  }
  m = pathname.match(/^\/cdn\/shop\/(files|products|collections|articles)\/(.+)$/);
  if (m) {
    const folder = m[1];
    const name = decodeURIComponent(m[2]);
    const found = findOriginal(folder, name);
    if (!found) return notFound();
    const width = search.get("width") ? Number(search.get("width")) : undefined;
    const height = search.get("height") ? Number(search.get("height")) : undefined;
    const crop = search.get("crop") || undefined;
    const format = search.get("format") || undefined;
    let t: Transform | null = found.t;
    if (width || height || format) {
      t = { width: width && width > 0 ? Math.min(width, 5760) : undefined, height: height && height > 0 ? Math.min(height, 5760) : undefined, crop, format, fit: crop && width && height ? "cover" : "inside" };
    }
    if (!t) {
      const type = typeOf(found.file);
      if (/^image\/(jpeg|png|webp)$/.test(type) && (req.headers.get("accept") || "").includes("image/webp") && !search.has("original")) {
        return transformed(req, found.file, { fit: "inside" });
      }
      return fileResponse(req, found.file, IMMUTABLE);
    }
    return transformed(req, found.file, t);
  }
  m = pathname.match(/^\/cdn\/fonts\/([a-z_]+)\/([a-z0-9_.]+\.woff2?)$/);
  if (m) {
    const file = path.join(FONTS_DIR, m[1], m[2]);
    if (!inside(FONTS_DIR, file) || !fs.existsSync(file)) return notFound();
    const res = fileResponse(req, file, IMMUTABLE);
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  }
  m = pathname.match(/^\/cdn\/shopifycloud\/assets\/(.+)$/);
  if (m) {
    const fm = m[1].match(/^flags\/([a-z]{2})\.svg$/);
    if (fm) {
      const svg = flagSvg(fm[1]);
      return svg ? new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": IMMUTABLE } }) : notFound();
    }
    if (m[1].startsWith("shopify_common")) return new Response(SHOPIFY_COMMON_JS, { headers: { "Content-Type": TYPES.js, "Cache-Control": "public, max-age=86400" } });
    if (m[1].startsWith("no-image")) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f4f4f4"/></svg>';
      return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": IMMUTABLE } });
    }
    return notFound();
  }
  return null;
}
