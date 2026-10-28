// Customers in the admin: list with order totals, editing, and deleting a customer's personal data (GDPR).
import "server-only";
import { getDb, nowIso } from "../db";
import type { CustomerRec } from "../customers";
import { likeTerm } from "./common";

export interface CustomerRow {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  accepts_marketing: number;
  has_account: number;
  created_at: string;
  orders: number;
  /** spent per market handle (orders that were not cancelled or returned), minor units of that market */
  spent: Record<string, number>;
}

/** Customer search: name, e-mail or phone (phone digits match with or without spaces / +359 / leading 0). */
export function listCustomers(opts: { q?: string; page?: number; perPage?: number }) {
  const where: string[] = [];
  const args: unknown[] = [];
  const q = (opts.q || "").trim().slice(0, 100);
  if (q) {
    const term = likeTerm(q);
    const parts = ["email LIKE ? ESCAPE '\\'", "(first_name || ' ' || last_name) LIKE ? ESCAPE '\\'", "(last_name || ' ' || first_name) LIKE ? ESCAPE '\\'", "phone LIKE ? ESCAPE '\\'"];
    args.push(term, term, term, term);
    // "0888 123 456" finds "+359888123456": compare the digits without the leading 0 / country code
    const digits = q.replace(/\D/g, "");
    if (/^[\d\s+()./-]+$/.test(q) && digits.length >= 4) {
      parts.push("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?");
      args.push(`%${digits.replace(/^(00359|359|0)/, "")}%`);
    }
    where.push(`(${parts.join(" OR ")})`);
  }
  const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM customers ${sql}`).get(...args) as { n: number }).n;
  const perPage = opts.perPage ?? 50;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(pages, Math.max(1, opts.page ?? 1));
  const rows = db
    .prepare(
      `SELECT id, email, first_name, last_name, phone, accepts_marketing, password_hash IS NOT NULL AS has_account, created_at,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = customers.id) AS orders
       FROM customers ${sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, perPage, (page - 1) * perPage) as Omit<CustomerRow, "spent">[];
  const spent = spentByCustomer(rows.map((r) => r.id));
  return { rows: rows.map((r) => ({ ...r, spent: spent.get(r.id) ?? {} })) as CustomerRow[], total, page, pages };
}

function spentByCustomer(ids: number[]): Map<number, Record<string, number>> {
  const out = new Map<number, Record<string, number>>();
  if (!ids.length) return out;
  const rows = getDb()
    .prepare(
      `SELECT customer_id, market, SUM(total) AS s FROM orders
       WHERE customer_id IN (${ids.map(() => "?").join(",")}) AND status NOT IN ('cancelled','returned')
       GROUP BY customer_id, market`,
    )
    .all(...ids) as { customer_id: number; market: string; s: number }[];
  for (const r of rows) {
    const m = out.get(r.customer_id) || {};
    m[r.market] = r.s;
    out.set(r.customer_id, m);
  }
  return out;
}

export function customerSpent(id: number): Record<string, number> {
  return spentByCustomer([id]).get(id) ?? {};
}

export function parseTags(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export interface CustomerUpdate {
  first_name: string;
  last_name: string;
  phone: string | null;
  accepts_marketing: boolean;
  note: string | null;
  tags: string[];
}

export function updateCustomer(id: number, u: CustomerUpdate) {
  getDb()
    .prepare("UPDATE customers SET first_name = ?, last_name = ?, phone = ?, accepts_marketing = ?, note = ?, tags = ?, updated_at = ? WHERE id = ?")
    .run(u.first_name, u.last_name, u.phone, u.accepts_marketing ? 1 : 0, u.note, JSON.stringify(u.tags), nowIso(), id);
}

/**
 * Deletes everything that identifies the customer: the account, its sign-ins, reset / activation links and
 * saved addresses. Orders stay (they are accounting documents) but are no longer linked to the customer.
 */
export function erasePersonalData(c: CustomerRec, opts: { newsletter: boolean }): { orders: number } {
  const db = getDb();
  let orders = 0;
  db.transaction(() => {
    orders = db.prepare("UPDATE orders SET customer_id = NULL WHERE customer_id = ?").run(c.id).changes;
    db.prepare("UPDATE carts SET customer_id = NULL WHERE customer_id = ?").run(c.id);
    db.prepare("DELETE FROM customer_sessions WHERE customer_id = ?").run(c.id);
    db.prepare("DELETE FROM customer_tokens WHERE customer_id = ?").run(c.id);
    db.prepare("DELETE FROM customer_addresses WHERE customer_id = ?").run(c.id);
    db.prepare("DELETE FROM customers WHERE id = ?").run(c.id);
    if (opts.newsletter) db.prepare("DELETE FROM subscribers WHERE email = ?").run(c.email.trim().toLowerCase());
  })();
  return { orders };
}
