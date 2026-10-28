// JSON the way Shopify's Ruby serializer writes it: "/" as "\/", <>& as < > &,
// floats with a decimal point (1.0), non-ASCII left as UTF-8.
import { Drop } from "liquidjs";
import { RFloat, formatFloat } from "./rnum";

export function shopifyJson(value: unknown): string {
  return ser(value, 0);
}

function ser(v: unknown, depth: number): string {
  if (depth > 40) return "null";
  if (v === null || v === undefined) return "null";
  if (v instanceof RFloat) return formatFloat(v.n);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "null";
    return Number.isInteger(v) ? String(v) : formatFloat(v);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return str(v);
  if (Array.isArray(v)) return "[" + v.map((x) => ser(x, depth + 1)).join(",") + "]";
  if (typeof v === "object") {
    const o = v as { toShopifyJSON?: () => unknown; toJSON?: () => unknown };
    if (typeof o.toShopifyJSON === "function") return ser(o.toShopifyJSON(), depth + 1);
    if (typeof o.toJSON === "function") return ser(o.toJSON(), depth + 1);
    if (v instanceof Drop) {
      const val = (v as unknown as { valueOf: () => unknown }).valueOf();
      if (val !== v) return ser(val, depth + 1);
      return "null";
    }
    const parts: string[] = [];
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x === undefined) continue;
      parts.push(str(k) + ":" + ser(x, depth + 1));
    }
    return "{" + parts.join(",") + "}";
  }
  return "null";
}

function str(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = s.charCodeAt(i);
    switch (c) {
      case '"':
        out += '\\"';
        break;
      case "\\":
        out += "\\\\";
        break;
      case "/":
        out += "\\/";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      case "\b":
        out += "\\b";
        break;
      case "\f":
        out += "\\f";
        break;
      case "<":
        out += "\\u003c";
        break;
      case ">":
        out += "\\u003e";
        break;
      case "&":
        out += "\\u0026";
        break;
      default:
        if (code < 0x20 || code === 0x2028 || code === 0x2029) out += "\\u" + code.toString(16).padStart(4, "0");
        else out += c;
    }
  }
  return out + '"';
}
