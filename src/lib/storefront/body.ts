// Request body parsing with Rails-style nested keys (items[0][id], properties[Name], updates[]).
type Nested = Record<string, unknown>;

function setDeep(obj: Nested, key: string, value: unknown) {
  const parts: string[] = [];
  const m = key.match(/^([^[]+)((?:\[[^\]]*\])*)$/);
  if (!m) {
    obj[key] = value;
    return;
  }
  parts.push(m[1]);
  for (const b of m[2].matchAll(/\[([^\]]*)\]/g)) parts.push(b[1]);
  let cur: Nested | unknown[] = obj;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const last = i === parts.length - 1;
    const nextIsArray = !last && parts[i + 1] === "";
    if (Array.isArray(cur)) {
      if (p === "") {
        if (last) cur.push(value);
        else {
          // items[][id]=1&items[][quantity]=2 → group by repeated first key
          const nextKey = parts[i + 1];
          let target = cur[cur.length - 1] as Nested | undefined;
          if (!target || typeof target !== "object" || (nextKey in target && parts.length === i + 2)) {
            target = {};
            cur.push(target);
          }
          cur = target;
        }
        continue;
      }
      const idx = Number(p);
      if (last) cur[idx] = value;
      else {
        if (cur[idx] === undefined) cur[idx] = nextIsArray ? [] : {};
        cur = cur[idx] as Nested;
      }
      continue;
    }
    if (last) {
      (cur as Nested)[p] = value;
    } else {
      const existing = (cur as Nested)[p];
      if (existing === undefined || typeof existing !== "object") (cur as Nested)[p] = nextIsArray || /^\d+$/.test(parts[i + 1]) ? [] : {};
      cur = (cur as Nested)[p] as Nested;
    }
  }
}

export async function parseBody(req: Request): Promise<Nested> {
  const type = req.headers.get("content-type") || "";
  if (req.method === "GET" || req.method === "HEAD") return {};
  if (type.includes("application/json")) {
    try {
      const j = await req.json();
      return j && typeof j === "object" ? (j as Nested) : {};
    } catch {
      return {};
    }
  }
  const out: Nested = {};
  if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) {
      if (typeof v !== "string") continue;
      setDeep(out, k, v);
    }
    return out;
  }
  const text = await req.text();
  if (!text) return {};
  for (const [k, v] of new URLSearchParams(text).entries()) setDeep(out, k, v);
  return out;
}

export function paramsToNested(sp: URLSearchParams): Nested {
  const out: Nested = {};
  for (const [k, v] of sp.entries()) setDeep(out, k, v);
  return out;
}
