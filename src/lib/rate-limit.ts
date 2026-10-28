// Sliding-window rate limits stored in SQLite, and the client IP behind a trusted proxy.
import { getDb } from "./db";

export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const db = getDb();
  const now = Date.now();
  db.prepare("DELETE FROM rate_limits WHERE key = ? AND at < ?").run(key, now - windowMs);
  const n = (db.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE key = ?").get(key) as { n: number }).n;
  if (n >= max) return true;
  db.prepare("INSERT INTO rate_limits(key, at) VALUES(?, ?)").run(key, now);
  return false;
}

export function pruneRateLimits() {
  getDb().prepare("DELETE FROM rate_limits WHERE at < ?").run(Date.now() - 2 * 86400_000);
}

/**
 * TRUST_PROXY: empty = 1 proxy when SITE_URL is https, "0" = never, "1".."5" = number of proxies,
 * "x-real-ip" = use that header.
 */
export function clientIp(req: Request): string {
  const tp = process.env.TRUST_PROXY ?? "";
  if (tp === "x-real-ip") return req.headers.get("x-real-ip") || "unknown";
  const n = tp === "" ? (String(process.env.SITE_URL || "").startsWith("https://") ? 1 : 0) : Number(tp) || 0;
  if (n > 0) {
    const xff = (req.headers.get("x-forwarded-for") || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (xff.length >= n) return xff[xff.length - n];
  }
  return "direct";
}
