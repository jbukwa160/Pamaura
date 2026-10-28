// Pictures uploaded in the admin: stored in DATA_DIR/files/files/ and registered in the files table, so the
// storefront serves them like Shopify's (/cdn/shop/files/<name>?v=…, resized on demand).
import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { FILES_DIR, getDb, nowIso } from "../db";
import { catalogChanged } from "./common";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg" };
export const MAX_UPLOAD = 15 * 1024 * 1024;

function safeName(original: string, ext: string): string {
  const stem =
    path
      .basename(original, path.extname(original))
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "image";
  return `${stem}.${ext}`;
}

/** Saves an uploaded picture; returns its files-table key and a URL for previews. */
export async function saveImageUpload(file: File): Promise<{ key: string; url: string; width: number | null; height: number | null }> {
  const ext = TYPES[file.type];
  if (!ext) throw new Error("Позволени са снимки JPG, PNG, WebP, GIF, AVIF и SVG.");
  if (file.size > MAX_UPLOAD) throw new Error("Снимката е по-голяма от 15 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  let width: number | null = null;
  let height: number | null = null;
  if (ext !== "svg") {
    try {
      const meta = await sharp(buf).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      throw new Error("Файлът не е валидна снимка.");
    }
  } else if (!/<svg[\s>]/i.test(buf.toString("utf8", 0, 2000)) || /<script/i.test(buf.toString("utf8"))) {
    throw new Error("Файлът не е валидна SVG снимка.");
  }
  const dir = path.join(FILES_DIR, "files");
  fs.mkdirSync(dir, { recursive: true });
  const db = getDb();
  let name = safeName(file.name, ext);
  for (let i = 2; fs.existsSync(path.join(dir, name)) || db.prepare("SELECT 1 FROM files WHERE name = ?").get(name); i++) {
    name = name.replace(/(-\d+)?\.(\w+)$/, `-${i}.$2`);
  }
  fs.writeFileSync(path.join(dir, name), buf);
  const version = String(Math.floor(Date.now() / 1000));
  db.prepare("INSERT INTO files(name, folder, mime, width, height, size, alt, version, created_at) VALUES(?, 'files', ?, ?, ?, ?, NULL, ?, ?)").run(
    name,
    file.type,
    width,
    height,
    buf.length,
    version,
    nowIso(),
  );
  catalogChanged();
  return { key: name, url: `/cdn/shop/files/${encodeURIComponent(name)}?v=${version}`, width, height };
}

/** Preview URL of a stored file key (as saved by saveImageUpload or imported). */
export function fileUrl(key: string | null | undefined, width?: number): string {
  if (!key) return "";
  const f = getDb().prepare("SELECT name, folder, version FROM files WHERE name = ?").get(key) as { name: string; folder: string; version: string } | undefined;
  if (!f) return "";
  const plain = f.folder !== "files" && f.name.startsWith(f.folder + "/") ? f.name.slice(f.folder.length + 1) : f.name;
  return `/cdn/shop/${f.folder}/${plain.split("/").map(encodeURIComponent).join("/")}?v=${f.version}${width ? `&width=${width}` : ""}`;
}
