// Customer accounts (Shopify "classic" accounts rendered by the theme's customers/* templates).
import crypto from "node:crypto";
import { getDb, nowIso } from "./db";
import { hashPassword, verifyPassword } from "./password";

export interface AddressRec {
  id: number;
  customer_id: number;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  province_code: string | null;
  country: string | null;
  country_code: string | null;
  zip: string | null;
  phone: string | null;
  is_default: number;
}

export interface CustomerRec {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  password_hash: string | null;
  accepts_marketing: number;
  tags: string;
  note: string | null;
  locale: string | null;
  state: string;
  created_at: string;
  updated_at: string;
}

export const CUSTOMER_COOKIE = "customer_session";
const SESSION_DAYS = 30;

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function customerById(id: number): CustomerRec | null {
  return (getDb().prepare("SELECT * FROM customers WHERE id = ?").get(id) as CustomerRec | undefined) || null;
}

export function customerByEmail(email: string): CustomerRec | null {
  return (getDb().prepare("SELECT * FROM customers WHERE email = ?").get(email.trim()) as CustomerRec | undefined) || null;
}

export function customerFromSession(token: string | null | undefined): CustomerRec | null {
  if (!token || token.length < 20) return null;
  const row = getDb()
    .prepare("SELECT c.* FROM customer_sessions s JOIN customers c ON c.id = s.customer_id WHERE s.token_hash = ? AND s.expires_at > ? AND c.state = 'enabled'")
    .get(sha(token), nowIso()) as CustomerRec | undefined;
  return row || null;
}

export function createSession(customerId: number): { token: string; maxAge: number } {
  const token = crypto.randomBytes(32).toString("base64url");
  const maxAge = SESSION_DAYS * 86400;
  getDb()
    .prepare("INSERT INTO customer_sessions(token_hash, customer_id, expires_at, created_at) VALUES(?, ?, ?, ?)")
    .run(sha(token), customerId, new Date(Date.now() + maxAge * 1000).toISOString(), nowIso());
  return { token, maxAge };
}

export function destroySession(token: string | null | undefined) {
  if (token) getDb().prepare("DELETE FROM customer_sessions WHERE token_hash = ?").run(sha(token));
}

export function destroyAllSessions(customerId: number) {
  getDb().prepare("DELETE FROM customer_sessions WHERE customer_id = ?").run(customerId);
}

export function addresses(customerId: number): AddressRec[] {
  return getDb().prepare("SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id").all(customerId) as AddressRec[];
}

export async function registerCustomer(input: { email: string; password: string; first_name: string; last_name: string; accepts_marketing: boolean; locale: string }): Promise<CustomerRec | "taken"> {
  const db = getDb();
  const existing = customerByEmail(input.email);
  if (existing && existing.password_hash) return "taken";
  const hash = await hashPassword(input.password);
  const now = nowIso();
  if (existing) {
    db.prepare("UPDATE customers SET password_hash = ?, first_name = ?, last_name = ?, accepts_marketing = ?, locale = ?, updated_at = ? WHERE id = ?").run(
      hash,
      input.first_name,
      input.last_name,
      input.accepts_marketing ? 1 : existing.accepts_marketing,
      input.locale,
      now,
      existing.id,
    );
    return customerById(existing.id)!;
  }
  const id = nextCustomerId();
  db.prepare(
    "INSERT INTO customers(id, email, first_name, last_name, password_hash, accepts_marketing, locale, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, input.email.trim(), input.first_name, input.last_name, hash, input.accepts_marketing ? 1 : 0, input.locale, now, now);
  return customerById(id)!;
}

export function nextCustomerId(): number {
  const row = getDb().prepare("SELECT MAX(id) AS m FROM customers").get() as { m: number | null };
  return Math.max(1000, (row.m || 0) + 1);
}

/** Finds or creates a guest customer record for an order. */
export function upsertGuest(email: string, first: string, last: string, phone: string | null, locale: string): CustomerRec {
  const existing = customerByEmail(email);
  if (existing) {
    getDb()
      .prepare("UPDATE customers SET phone = COALESCE(?, phone), first_name = CASE WHEN first_name = '' THEN ? ELSE first_name END, last_name = CASE WHEN last_name = '' THEN ? ELSE last_name END, updated_at = ? WHERE id = ?")
      .run(phone, first, last, nowIso(), existing.id);
    return customerById(existing.id)!;
  }
  const id = nextCustomerId();
  const now = nowIso();
  getDb()
    .prepare("INSERT INTO customers(id, email, first_name, last_name, phone, locale, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, email.trim(), first, last, phone, locale, now, now);
  return customerById(id)!;
}

export async function checkLogin(email: string, password: string): Promise<CustomerRec | null> {
  const c = customerByEmail(email);
  if (!c || !c.password_hash || c.state !== "enabled") {
    await hashPassword("timing-equaliser");
    return null;
  }
  return (await verifyPassword(password, c.password_hash)) ? c : null;
}

export function createToken(customerId: number, kind: "reset" | "activate", hours: number): string {
  const token = crypto.randomBytes(24).toString("base64url");
  getDb()
    .prepare("INSERT INTO customer_tokens(token_hash, customer_id, kind, expires_at) VALUES(?, ?, ?, ?)")
    .run(sha(token), customerId, kind, new Date(Date.now() + hours * 3600_000).toISOString());
  return token;
}

export function consumeToken(customerId: number, token: string, kind: "reset" | "activate"): boolean {
  const row = getDb()
    .prepare("SELECT * FROM customer_tokens WHERE token_hash = ? AND customer_id = ? AND kind = ? AND used = 0 AND expires_at > ?")
    .get(sha(token), customerId, kind, nowIso());
  if (!row) return false;
  getDb().prepare("UPDATE customer_tokens SET used = 1 WHERE token_hash = ?").run(sha(token));
  return true;
}

export function peekToken(customerId: number, token: string, kind: "reset" | "activate"): boolean {
  return !!getDb()
    .prepare("SELECT 1 FROM customer_tokens WHERE token_hash = ? AND customer_id = ? AND kind = ? AND used = 0 AND expires_at > ?")
    .get(sha(token), customerId, kind, nowIso());
}

export async function setPassword(customerId: number, password: string) {
  const hash = await hashPassword(password);
  getDb().prepare("UPDATE customers SET password_hash = ?, state = 'enabled', updated_at = ? WHERE id = ?").run(hash, nowIso(), customerId);
  destroyAllSessions(customerId);
}
