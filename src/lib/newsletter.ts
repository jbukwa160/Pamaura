// Newsletter subscribers (the theme's "customer" form). The live store also runs Klaviyo forms,
// which keep collecting into Klaviyo directly.
import { getDb, nowIso } from "./db";

export function subscribe(email: string, source: string, locale: string) {
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO subscribers(email, status, source, locale, created_at, updated_at) VALUES(?, 'subscribed', ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET status = 'subscribed', updated_at = excluded.updated_at`,
    )
    .run(email.trim().toLowerCase(), source, locale, now, now);
  getDb().prepare("UPDATE customers SET accepts_marketing = 1, updated_at = ? WHERE email = ?").run(now, email.trim());
}

export function unsubscribe(email: string) {
  getDb().prepare("UPDATE subscribers SET status = 'unsubscribed', updated_at = ? WHERE email = ?").run(nowIso(), email.trim().toLowerCase());
  getDb().prepare("UPDATE customers SET accepts_marketing = 0 WHERE email = ?").run(email.trim());
}
