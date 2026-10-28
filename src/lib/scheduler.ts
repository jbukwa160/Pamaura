// Background jobs while the server runs: retry queued e-mails, clean up expired sessions, old carts and
// rate-limit records. Started once from src/instrumentation.ts.
import { getDb, nowIso } from "./db";
import { retryFailedMail } from "./mail";
import { pruneRateLimits } from "./rate-limit";

const g = globalThis as unknown as { __pamauraScheduler?: boolean };

function cleanup() {
  const db = getDb();
  const now = nowIso();
  db.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM customer_sessions WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM customer_tokens WHERE expires_at < ?").run(now);
  // carts not touched for 60 days (Shopify keeps them for a few weeks)
  db.prepare("DELETE FROM carts WHERE updated_at < ?").run(new Date(Date.now() - 60 * 86400_000).toISOString());
  pruneRateLimits();
}

export function startScheduler() {
  if (g.__pamauraScheduler) return;
  g.__pamauraScheduler = true;
  const safe = (name: string, fn: () => unknown) => async () => {
    try {
      await fn();
    } catch (e) {
      console.error(`[scheduler] ${name}:`, (e as Error).message);
    }
  };
  const mail = safe("mail", retryFailedMail);
  const clean = safe("cleanup", cleanup);
  setTimeout(clean, 30_000).unref?.();
  setInterval(mail, 5 * 60_000).unref?.();
  setInterval(clean, 6 * 3600_000).unref?.();
}
