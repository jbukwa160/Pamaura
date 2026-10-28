// Admin sign-in: accounts in admin_users (created with `npm run admin:user`), sessions in admin_sessions.
// The cookie holds a random token; the database keeps only its SHA-256 hash.
import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, nowIso } from "../db";
import { hashPassword, verifyPassword } from "../password";
import { clientIp as ipOf } from "../rate-limit";

export const ADMIN_COOKIE = "admin_session";
const SHORT = 12 * 60 * 60 * 1000; // 12 h
const LONG = 30 * 24 * 60 * 60 * 1000; // "remember me": 30 days

export interface AdminUser {
  id: number;
  username: string;
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Same proxy rules as the storefront (TRUST_PROXY, see rate-limit.ts). */
async function clientIp(): Promise<string> {
  return ipOf(new Request("http://admin.local/", { headers: await headers() }));
}

async function secureCookie(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  if (proto) return proto === "https";
  return process.env.NODE_ENV === "production";
}

export function hasAdminUsers(): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM admin_users LIMIT 1").get());
}

/** The signed-in admin, or null. */
export async function getAdmin(): Promise<AdminUser | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const row = getDb()
    .prepare("SELECT u.id, u.username, s.expires_at FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id WHERE s.token_hash = ?")
    .get(sha(token)) as { id: number; username: string; expires_at: string } | undefined;
  if (!row || row.expires_at < nowIso()) return null;
  return { id: row.id, username: row.username };
}

/** For pages and server actions: the admin, or a redirect to the sign-in page. */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

// Failed attempts per IP and per username (15 minutes window) — slows down password guessing.
const WINDOW = 15 * 60 * 1000;
function failures(key: string): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE key = ? AND at > ?").get(key, Date.now() - WINDOW) as { n: number }).n;
}
function fail(key: string) {
  getDb().prepare("INSERT INTO rate_limits(key, at) VALUES(?, ?)").run(key, Date.now());
}

export async function login(username: string, password: string, remember: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = await clientIp();
  const ipKey = `admin-login-ip:${ip}`;
  const userKey = `admin-login-user:${username.toLowerCase()}`;
  if (failures(ipKey) >= 20 || failures(userKey) >= 8) return { ok: false, error: "Твърде много неуспешни опити. Опитайте отново след 15 минути." };
  const db = getDb();
  const user = db.prepare("SELECT id, password_hash FROM admin_users WHERE username = ?").get(username) as { id: number; password_hash: string } | undefined;
  // compare against a dummy hash when the user does not exist, so both cases take the same time
  const ok = user ? await verifyPassword(password, user.password_hash) : (await verifyPassword(password, DUMMY), false);
  if (!user || !ok) {
    fail(ipKey);
    fail(userKey);
    return { ok: false, error: "Грешно потребителско име или парола." };
  }
  db.prepare("DELETE FROM rate_limits WHERE key = ?").run(userKey);
  const token = crypto.randomBytes(32).toString("base64url");
  const ttl = remember ? LONG : SHORT;
  db.prepare("INSERT INTO admin_sessions(token_hash, user_id, expires_at, created_at, ip) VALUES(?, ?, ?, ?, ?)").run(sha(token), user.id, new Date(Date.now() + ttl).toISOString(), nowIso(), ip);
  db.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").run(nowIso());
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await secureCookie(),
    path: "/",
    ...(remember ? { maxAge: ttl / 1000 } : {}),
  });
  return { ok: true };
}

const DUMMY = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function logout() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(sha(token));
  jar.delete(ADMIN_COOKIE);
}

/** After a password change: sign out every other session of that admin. */
export async function endOtherSessions(userId: number) {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  getDb()
    .prepare("DELETE FROM admin_sessions WHERE user_id = ? AND token_hash != ?")
    .run(userId, token ? sha(token) : "");
}

export function passwordProblem(p: string): string | null {
  if (p.length < 10) return "Паролата трябва да е поне 10 знака.";
  if (p.length > 200) return "Паролата е твърде дълга.";
  if (!/[a-zа-я]/i.test(p) || !/\d/.test(p)) return "Използвайте поне една буква и една цифра.";
  return null;
}

export async function setAdminPassword(userId: number, password: string) {
  getDb().prepare("UPDATE admin_users SET password_hash = ?, password_changed_at = ? WHERE id = ?").run(await hashPassword(password), nowIso(), userId);
}

export function generatePassword(): string {
  // 16 characters without look-alikes (0/O, 1/l/I)
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(16);
  let out = "";
  for (const b of bytes) out += abc[b % abc.length];
  return out;
}
