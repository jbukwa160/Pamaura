// Theme asset versions for ?v= cache busting (changes when the file changes).
import crypto from "node:crypto";
import fs from "node:fs";
import { themePath } from "./theme";

const cache = new Map<string, { mtime: number; v: string }>();

export function assetVersion(name: string): string {
  const file = themePath("assets", name);
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return "";
  }
  const hit = cache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.v;
  const hash = crypto.createHash("sha1").update(fs.readFileSync(file)).digest();
  // numeric like Shopify's versions
  const v = BigInt("0x" + hash.subarray(0, 8).toString("hex")).toString().slice(0, 20);
  cache.set(file, { mtime: st.mtimeMs, v });
  return v;
}
