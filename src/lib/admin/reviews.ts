// Product reviews in the admin: lists with filters, counts and text ⇄ HTML for review bodies and shop replies.
// The storefront (reviews-render.ts) reads reviews live and prints body / reply as HTML; only published ones show.
import "server-only";
import { getDb } from "../db";
import { fmtDateTime } from "./common";
import { matches } from "./content";
import { fileUrl } from "./uploads";

export const REVIEW_STATUSES = [
  { key: "pending", label: "Чакат одобрение", short: "Чака одобрение", tone: "sun" },
  { key: "published", label: "Публикувани", short: "Публикуван", tone: "mint" },
  { key: "hidden", label: "Скрити", short: "Скрит", tone: "muted" },
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]["key"];
export const isReviewStatus = (s: unknown): s is ReviewStatus => REVIEW_STATUSES.some((x) => x.key === s);

export const REVIEWS_PER_PAGE = 25;
export const REVIEW_PICTURES_MAX = 6;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/** Stored review HTML → plain text with line breaks (for showing and editing in the admin). */
export function htmlToText(html: string | null | undefined): string {
  return String(html ?? "")
    .replace(/\r/g, "")
    .replace(/\n?<br\s*\/?>\n?/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e: string) => {
      const k = e.toLowerCase();
      if (ENTITIES[k]) return ENTITIES[k];
      if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
      if (k.startsWith("#")) return String.fromCodePoint(Number(k.slice(1)));
      return m;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Plain text typed in the admin → safe HTML paragraphs (as Judge.me stored them: <p>…<br>…</p>). */
export function textToHtml(text: string): string {
  return text
    .replace(/\r/g, "")
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export interface ReviewRec {
  id: number;
  external_id: string | null;
  product_id: number | null;
  rating: number;
  title: string;
  body: string;
  author: string;
  email: string | null;
  verified: number;
  pictures: string;
  reply: string | null;
  status: string;
  created_at: string;
}

/** What a review card in the admin shows (serializable for the client). */
export interface ReviewView {
  id: number;
  rating: number;
  title: string;
  body: string;
  author: string;
  email: string;
  verified: boolean;
  status: ReviewStatus;
  reply: string;
  date: string;
  source: string;
  product: { id: number; title: string; handle: string } | null;
  pictures: { thumb: string; full: string }[];
}

export function reviewPictures(json: string): string[] {
  try {
    const v = JSON.parse(json || "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export interface ReviewFilter {
  status: ReviewStatus | "all";
  /** product id, "shop" (reviews of the shop itself) or "" for all */
  product: string;
  rating: number | null;
  q: string;
  page: number;
}

export function listReviews(f: ReviewFilter): { rows: ReviewView[]; total: number; pages: number; page: number } {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.status !== "all") {
    where.push("r.status = ?");
    args.push(f.status);
  }
  if (f.product === "shop") where.push("r.product_id IS NULL");
  else if (/^\d+$/.test(f.product)) {
    where.push("r.product_id = ?");
    args.push(Number(f.product));
  }
  if (f.rating) {
    where.push("r.rating = ?");
    args.push(f.rating);
  }
  const sql = `SELECT r.*, p.title AS product_title, p.handle AS product_handle FROM reviews r LEFT JOIN products p ON p.id = r.product_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.created_at DESC, r.id DESC`;
  let rows = getDb()
    .prepare(sql)
    .all(...args) as (ReviewRec & { product_title: string | null; product_handle: string | null })[];
  // text search in JS: SQLite's LIKE does not fold Cyrillic case
  if (f.q.trim()) rows = rows.filter((r) => matches(f.q, r.author, r.title, htmlToText(r.body), r.email, htmlToText(r.reply), r.product_title));
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / REVIEWS_PER_PAGE));
  const page = Math.min(Math.max(1, f.page), pages);
  const slice = rows.slice((page - 1) * REVIEWS_PER_PAGE, page * REVIEWS_PER_PAGE);
  return {
    total,
    pages,
    page,
    rows: slice.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: htmlToText(r.body),
      author: r.author,
      email: r.email ?? "",
      verified: !!r.verified,
      status: isReviewStatus(r.status) ? r.status : "hidden",
      reply: htmlToText(r.reply),
      date: fmtDateTime(r.created_at),
      source: r.external_id?.startsWith("judgeme:") ? "Judge.me" : r.external_id ? "сайта" : "",
      product: r.product_id != null ? { id: r.product_id, title: r.product_title ?? `Изтрит продукт #${r.product_id}`, handle: r.product_handle ?? "" } : null,
      // Judge.me exported each picture twice; show it once
      pictures: [...new Set(reviewPictures(r.pictures))].map((k) => ({ thumb: fileUrl(k, 160), full: fileUrl(k) })).filter((p) => p.thumb),
    })),
  };
}

export function reviewStatusCounts(): Record<string, number> {
  const rows = getDb().prepare("SELECT status, COUNT(*) AS n FROM reviews GROUP BY status").all() as { status: string; n: number }[];
  const out: Record<string, number> = { all: 0 };
  for (const r of rows) {
    out[r.status] = r.n;
    out.all += r.n;
  }
  return out;
}

/** Products for the filter (with their number of reviews) and for the "add a review" form. */
export function reviewProducts(): { id: number; title: string; status: string; reviews: number }[] {
  return getDb()
    .prepare("SELECT p.id, p.title, p.status, (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS reviews FROM products p ORDER BY p.title COLLATE NOCASE")
    .all() as { id: number; title: string; status: string; reviews: number }[];
}

export function shopReviewCount(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM reviews WHERE product_id IS NULL").get() as { n: number }).n;
}
