/**
 * Create an admin account or reset its password.
 *
 *   npm run admin:user -- --user admin                   # random password, printed once
 *   npm run admin:user -- --user admin --password "…"    # choose the password
 *   npm run admin:user -- --list                         # existing admin usernames
 *   npm run admin:user -- --delete --user someone        # remove an admin
 */
import crypto from "node:crypto";
import { getDb, nowIso } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

const argv = process.argv.slice(2);
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

function generatePassword(): string {
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (const b of crypto.randomBytes(16)) out += abc[b % abc.length];
  return out;
}

function passwordProblem(p: string): string | null {
  if (p.length < 10) return "The password must be at least 10 characters.";
  if (!/[a-zа-я]/i.test(p) || !/\d/.test(p)) return "Use at least one letter and one digit.";
  return null;
}

async function main() {
  const db = getDb();
  if (argv.includes("--list")) {
    console.table(db.prepare("SELECT username, created_at, password_changed_at FROM admin_users ORDER BY id").all());
    return;
  }
  const username = (arg("user") ?? "").trim();
  if (!/^[a-zA-Z0-9._@-]{3,40}$/.test(username)) {
    console.error("Give a username with --user (3–40 letters, digits, . _ @ -). Example: npm run admin:user -- --user admin");
    process.exit(1);
  }
  if (argv.includes("--delete")) {
    const r = db.prepare("DELETE FROM admin_users WHERE username = ?").run(username);
    console.log(r.changes ? `Deleted admin "${username}".` : `No admin called "${username}".`);
    return;
  }
  const given = arg("password");
  if (given) {
    const problem = passwordProblem(given);
    if (problem) {
      console.error(problem);
      process.exit(1);
    }
  }
  const password = given ?? generatePassword();
  const hash = await hashPassword(password);
  const existing = db.prepare("SELECT id FROM admin_users WHERE username = ?").get(username) as { id: number } | undefined;
  if (existing) {
    db.prepare("UPDATE admin_users SET password_hash = ?, password_changed_at = ? WHERE id = ?").run(hash, nowIso(), existing.id);
    db.prepare("DELETE FROM admin_sessions WHERE user_id = ?").run(existing.id);
    db.prepare("DELETE FROM rate_limits WHERE key = ?").run(`admin-login-user:${username.toLowerCase()}`);
    console.log(`Password for "${username}" was reset; their sessions were signed out.`);
  } else {
    db.prepare("INSERT INTO admin_users(username, password_hash, password_changed_at, created_at) VALUES(?, ?, ?, ?)").run(username, hash, nowIso(), nowIso());
    console.log(`Admin "${username}" created.`);
  }
  if (!given) console.log(`\n  Username: ${username}\n  Password: ${password}\n\nKeep it somewhere safe — it is not stored in plain text anywhere.`);
  console.log("Sign in at /admin");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
