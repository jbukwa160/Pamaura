// Newsletter subscribers in the admin: list, search and CSV export.
import "server-only";
import { getDb } from "../db";
import { likeTerm } from "./common";

export interface SubscriberRec {
  email: string;
  status: "subscribed" | "unsubscribed";
  source: string | null;
  locale: string | null;
  created_at: string;
  updated_at: string;
}

export const SUB_STATUS = [
  { key: "subscribed", label: "Абонирани" },
  { key: "unsubscribed", label: "Отписани" },
  { key: "all", label: "Всички" },
] as const;

export const SOURCE_LABELS: Record<string, string> = {
  "newsletter-form": "Форма за бюлетин",
  "contact-form": "Контактна форма",
  checkout: "При поръчка",
  admin: "Добавен от админ",
};

export const sourceLabel = (s: string | null) => (s ? (SOURCE_LABELS[s] ?? s) : "—");
export const localeLabel = (l: string | null) => (l === "bg" ? "български" : l === "ro" ? "румънски" : l || "—");

function filter(opts: { status?: string; q?: string }) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.status === "subscribed" || opts.status === "unsubscribed") {
    where.push("status = ?");
    args.push(opts.status);
  }
  const q = (opts.q || "").trim().slice(0, 100);
  if (q) {
    where.push("email LIKE ? ESCAPE '\\'");
    args.push(likeTerm(q));
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", args };
}

export function listSubscribers(opts: { status?: string; q?: string; page?: number; perPage?: number }) {
  const { sql, args } = filter(opts);
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM subscribers ${sql}`).get(...args) as { n: number }).n;
  const perPage = opts.perPage ?? 100;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(pages, Math.max(1, opts.page ?? 1));
  const rows = db.prepare(`SELECT * FROM subscribers ${sql} ORDER BY created_at DESC, email LIMIT ? OFFSET ?`).all(...args, perPage, (page - 1) * perPage) as SubscriberRec[];
  return { rows, total, page, pages };
}

export function subscriberCounts(): Record<string, number> {
  const rows = getDb().prepare("SELECT status, COUNT(*) AS n FROM subscribers GROUP BY status").all() as { status: string; n: number }[];
  const out: Record<string, number> = { all: 0, subscribed: 0, unsubscribed: 0 };
  for (const r of rows) {
    out[r.status] = r.n;
    out.all += r.n;
  }
  return out;
}

export function allSubscribers(opts: { status?: string; q?: string }): SubscriberRec[] {
  const { sql, args } = filter(opts);
  return getDb().prepare(`SELECT * FROM subscribers ${sql} ORDER BY created_at DESC, email`).all(...args) as SubscriberRec[];
}

export function deleteSubscriber(email: string): boolean {
  const db = getDb();
  const removed = db.prepare("DELETE FROM subscribers WHERE email = ?").run(email).changes > 0;
  // a removed subscriber no longer receives the newsletter: the customer record follows
  if (removed) db.prepare("UPDATE customers SET accepts_marketing = 0 WHERE email = ?").run(email);
  return removed;
}
