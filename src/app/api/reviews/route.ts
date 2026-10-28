// Review list pages for the product review widget, and new reviews from customers (published after approval
// in the admin, Отзиви).
import { getCatalog, isPublished } from "@/lib/catalog";
import { getDb, nowIso } from "@/lib/db";
import { escapeHtml, sendMail, shopNotifyEmail } from "@/lib/mail";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { pageReviews, paginationHtml, reviewItemsHtml, rt } from "@/lib/reviews-render";
import { requestOrigin } from "@/lib/storefront/context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const productId = Number(u.searchParams.get("product_id"));
  const page = Math.max(1, Number(u.searchParams.get("page")) || 1);
  const sort = ["recent", "highest", "lowest", "pictures"].includes(u.searchParams.get("sort") || "") ? u.searchParams.get("sort")! : "recent";
  const locale = u.searchParams.get("locale") === "ro" ? "ro" : "bg";
  if (!productId) return Response.json({ items: "", pagination: "" }, { status: 400 });
  const { rows, pages } = pageReviews(productId, page, sort);
  const { host } = requestOrigin(req);
  return Response.json({ items: reviewItemsHtml(locale, rows, host), pagination: paginationHtml(Math.min(page, pages), pages) }, { headers: { "Cache-Control": "public, max-age=60" } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  let d: Record<string, unknown>;
  try {
    d = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const L = d.locale === "ro" ? "ro" : "bg";
  const str = (k: string, max: number) => String(d[k] ?? "").trim().slice(0, max);
  // bots fill the hidden field: answer as if it worked
  if (str("website", 200)) return Response.json({ ok: true });
  const productId = Number(d.product_id);
  const rating = Number(d.rating);
  const name = str("name", 60), email = str("email", 200).toLowerCase(), title = str("title", 120), body = str("body", 5000);
  if (!name || !title || !body || !(rating >= 1 && rating <= 5) || !Number.isInteger(rating)) return Response.json({ ok: false, error: rt(L, "err_required") }, { status: 422 });
  if (!EMAIL_RE.test(email)) return Response.json({ ok: false, error: rt(L, "err_email") }, { status: 422 });
  const product = getCatalog().productById.get(productId);
  if (!product || !isPublished(product)) return Response.json({ ok: false, error: rt(L, "err_generic") }, { status: 404 });
  // at most 5 reviews an hour from one address (typos in the form do not count)
  if (rateLimited(`review:${clientIp(req)}`, 5, 60 * 60_000)) return Response.json({ ok: false, error: rt(L, "err_generic") }, { status: 429 });
  const db = getDb();
  // "verified buyer" when this e-mail has an order with the product
  const bought = db.prepare("SELECT 1 FROM orders o JOIN order_lines l ON l.order_id = o.id WHERE o.email = ? COLLATE NOCASE AND l.product_id = ? AND o.status != 'cancelled' LIMIT 1").get(email, productId);
  const html = body
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  db.prepare("INSERT INTO reviews(product_id, rating, title, body, author, email, verified, pictures, status, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, '[]', 'pending', ?)").run(
    productId,
    rating,
    title,
    html,
    name,
    email,
    bought ? 1 : 0,
    nowIso(),
  );
  const { origin } = requestOrigin(req);
  void sendMail({
    to: shopNotifyEmail(),
    replyTo: email,
    subject: `Нов отзив (${rating}★) за ${product.title}`,
    html: `<p><strong>${escapeHtml(name)}</strong> (${escapeHtml(email)}${bought ? ", купувал продукта" : ""}) остави ${rating}★ отзив за <strong>${escapeHtml(product.title)}</strong>:</p><p><strong>${escapeHtml(title)}</strong></p>${html}<p><a href="${origin}/admin/otzivi?status=pending">Одобрете или скрийте отзива в админ панела</a></p>`,
  }).catch(() => undefined);
  return Response.json({ ok: true });
}
