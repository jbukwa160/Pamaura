// Cookie banner choices (Shopify.customerPrivacy shim) — stored anonymously as proof of consent.
import { getDb, nowIso } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  const db = getDb();
  db.exec("CREATE TABLE IF NOT EXISTS consent_log (id INTEGER PRIMARY KEY AUTOINCREMENT, analytics INTEGER, marketing INTEGER, preferences INTEGER, created_at TEXT NOT NULL)");
  db.prepare("INSERT INTO consent_log(analytics, marketing, preferences, created_at) VALUES(?, ?, ?, ?)").run(body.analytics ? 1 : 0, body.marketing ? 1 : 0, body.preferences ? 1 : 0, nowIso());
  return new Response(null, { status: 204 });
}
