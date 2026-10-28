// Polite, cached HTTP for the importer. Responses are kept in DATA_DIR/import-cache so a rerun
// (or a run without network) uses the same data; --refresh ignores the cache.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const UA = "PamauraBackendImporter/1.0 (store owner migration; contact hello@pamaura.com)";
let lastAt = 0;
const DELAY_MS = Number(process.env.IMPORT_DELAY_MS || 400);

export class Fetcher {
  constructor(
    public cacheDir: string,
    public refresh: boolean,
  ) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  private keyFile(url: string) {
    const h = crypto.createHash("sha1").update(url).digest("hex");
    return path.join(this.cacheDir, h.slice(0, 2), h);
  }

  private async wait() {
    const d = Date.now() - lastAt;
    if (d < DELAY_MS) await new Promise((r) => setTimeout(r, DELAY_MS - d));
    lastAt = Date.now();
  }

  /** GET text; null on 404. Cached. */
  async text(url: string, opts: { cache?: boolean } = {}): Promise<string | null> {
    const file = this.keyFile(url);
    const useCache = opts.cache !== false;
    if (useCache && !this.refresh && fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      return raw === "\u0000404" ? null : raw;
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      await this.wait();
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "bg" }, redirect: "follow" });
        if (res.status === 404) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, "\u0000404");
          return null;
        }
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        const body = await res.text();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, body);
        return body;
      } catch (e) {
        if (attempt === 4) throw e;
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    return null;
  }

  async json<T>(url: string): Promise<T | null> {
    const t = await this.text(url);
    return t === null ? null : (JSON.parse(t) as T);
  }

  /** Downloads a binary to `dest` unless it exists. Returns bytes written (0 = already there). */
  async download(url: string, dest: string): Promise<number> {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return 0;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    for (let attempt = 0; attempt < 5; attempt++) {
      await this.wait();
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA } });
        if (res.status === 404) throw new Error(`404 ${url}`);
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const tmp = dest + ".part";
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, dest);
        return buf.length;
      } catch (e) {
        if (attempt === 4 || String((e as Error).message).startsWith("404")) throw e;
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    throw new Error(`download failed: ${url}`);
  }
}
