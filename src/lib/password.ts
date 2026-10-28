// scrypt password hashing: "scrypt$N$r$p$salt$hash" (base64url)
import crypto from "node:crypto";

const N = 16384, R = 8, P = 1, KEYLEN = 32;

function scrypt(password: string, salt: Buffer, n = N, r = R, p = P): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const key = await scrypt(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  const expected = Buffer.from(hash, "base64url");
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}
