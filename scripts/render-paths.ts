// Renders storefront paths through the router (no server) — for checks and diffs.
//   npx tsx scripts/render-paths.ts /bg-bg /bg-bg/products/x --out <dir>
import fs from "node:fs";
import path from "node:path";
import { handleStorefront } from "../src/lib/storefront/router";

async function main() {
  const args = process.argv.slice(2);
  const oi = args.indexOf("--out");
  const out = oi >= 0 ? args[oi + 1] : null;
  const paths = args.filter((a, i) => !a.startsWith("--") && (oi < 0 || i !== oi + 1));
  for (const p of paths) {
    const t = Date.now();
    const res = await handleStorefront(new Request("http://pamaura.com" + p, { headers: { host: "pamaura.com", accept: "text/html" } }));
    const body = await res.text();
    console.log(`${res.status} ${p} ${body.length}B ${Date.now() - t}ms${res.headers.get("location") ? " → " + res.headers.get("location") : ""}`);
    if (out) {
      const file = path.join(out, decodeURIComponent(p).replace(/^\//, "").replace(/[/?&=]/g, "__") || "root") + ".html";
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
