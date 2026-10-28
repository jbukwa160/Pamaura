/**
 * Copies the product reviews from Judge.me (public widget endpoint) into our reviews table,
 * so they keep showing after the shop leaves Shopify. Review photos are downloaded.
 *
 *   npm run import:reviews            (safe to rerun: reviews are matched by their Judge.me id)
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";
import { DATA_DIR, FILES_DIR, bumpCatalogVersion, getDb } from "../src/lib/db";
import { getCatalog, isPublished } from "../src/lib/catalog";
import { Fetcher } from "./import/fetch";

const SHOP = process.env.JUDGEME_SHOP_DOMAIN || "pamaura-2-rz.myshopify.com";
const fetcher = new Fetcher(path.join(DATA_DIR, "import-cache"), process.argv.includes("--refresh"));
const log = (...a: unknown[]) => console.log("[reviews]", ...a);

interface Parsed {
  external_id: string;
  rating: number;
  title: string;
  body: string;
  author: string;
  verified: boolean;
  pictures: string[];
  reply: string | null;
  created_at: string;
}

function parseReviews(html: string): Parsed[] {
  const root = parse(html);
  return root.querySelectorAll(".jdgm-rev").map((el) => {
    const pics = el
      .querySelectorAll(".jdgm-rev__pics a, .jdgm-rev__pics img")
      .map((a) => a.getAttribute("data-mfp-src") || a.getAttribute("href") || a.getAttribute("data-src") || a.getAttribute("src") || "")
      .filter((u) => /^https?:\/\//.test(u));
    const ts = el.querySelector(".jdgm-rev__timestamp");
    const reply = el.querySelector(".jdgm-rev__reply-content");
    return {
      external_id: `judgeme:${el.getAttribute("data-review-id")}`,
      rating: Number(el.querySelector(".jdgm-rev__rating")?.getAttribute("data-score") || 5),
      title: (el.querySelector(".jdgm-rev__title")?.text || "").trim(),
      body: (el.querySelector(".jdgm-rev__body")?.innerHTML || "").trim(),
      author: (el.querySelector(".jdgm-rev__author")?.text || "").trim(),
      verified: el.getAttribute("data-verified-buyer") === "true",
      pictures: [...new Set(pics)],
      reply: reply ? reply.innerHTML.trim() || null : null,
      created_at: ts?.getAttribute("datetime") || new Date().toISOString(),
    };
  });
}

async function main() {
  const cat = getCatalog();
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO reviews(external_id, product_id, rating, title, body, author, verified, pictures, reply, status, created_at)
     VALUES(@external_id, @product_id, @rating, @title, @body, @author, @verified, @pictures, @reply, 'published', @created_at)
     ON CONFLICT(external_id) DO UPDATE SET product_id=excluded.product_id, rating=excluded.rating, title=excluded.title, body=excluded.body,
       author=excluded.author, verified=excluded.verified, pictures=excluded.pictures, reply=excluded.reply, created_at=excluded.created_at`,
  );
  let total = 0;
  for (const p of cat.products.filter(isPublished)) {
    const all: Parsed[] = [];
    let expected = 0;
    for (let page = 1; page < 100; page++) {
      const url = `https://judge.me/reviews/reviews_for_widget?url=${SHOP}&shop_domain=${SHOP}&platform=shopify&page=${page}&per_page=10&product_id=${p.id}`;
      const data = await fetcher.json<{ html: string; total_count: number }>(url);
      if (!data) break;
      expected = data.total_count;
      const got = parseReviews(data.html || "");
      if (!got.length) break;
      all.push(...got);
      if (all.length >= expected) break;
    }
    // review photos → DATA_DIR/files/reviews/
    for (const r of all) {
      const local: string[] = [];
      for (const u of r.pictures) {
        const name = `reviews/${path.basename(new URL(u).pathname).replace(/[^\w.-]+/g, "_")}`;
        try {
          await fetcher.download(u, path.join(FILES_DIR, "files", name));
          local.push(name);
        } catch (e) {
          log(`! photo ${u}: ${(e as Error).message}`);
        }
      }
      r.pictures = local;
    }
    db.transaction(() => {
      for (const r of all) upsert.run({ ...r, product_id: p.id, verified: r.verified ? 1 : 0, pictures: JSON.stringify(r.pictures) });
    })();
    total += all.length;
    log(`${p.handle}: ${all.length}/${expected}`);
  }
  // register downloaded photos as files
  const dir = path.join(FILES_DIR, "files", "reviews");
  if (fs.existsSync(dir)) {
    const ins = db.prepare("INSERT OR IGNORE INTO files(name, folder, mime, size, version, created_at) VALUES(?, 'files', ?, ?, '1', ?)");
    for (const f of fs.readdirSync(dir)) ins.run(`reviews/${f}`, /\.png$/i.test(f) ? "image/png" : /\.webp$/i.test(f) ? "image/webp" : "image/jpeg", fs.statSync(path.join(dir, f)).size, new Date().toISOString());
  }
  bumpCatalogVersion();
  log(`done: ${total} reviews`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
