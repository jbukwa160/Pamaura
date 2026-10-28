// Ruby numeric semantics for Liquid, as Shopify evaluates them.
//
// Shopify runs Liquid on Ruby, where 3 and 3.0 are different values: `7 | divided_by: 2` is 3 but
// `7.0 | divided_by: 2` is 3.5, and a float prints as "3.0". JS has only one number type, so a float
// whose value happens to be integral (3.0) is wrapped in RFloat. Non-integral JS numbers are floats
// by definition and stay plain numbers. Float literals in templates (`times: 100.0`) are rewritten to
// RFloat by source.ts before parsing.
import { Drop } from "liquidjs";

export class RFloat extends Drop {
  constructor(public readonly n: number) {
    super();
  }
  // LiquidJS calls valueOf() for output and most conversions: Ruby prints floats as "3.0".
  valueOf(): string {
    return formatFloat(this.n);
  }
  toString(): string {
    return formatFloat(this.n);
  }
  toJSON(): number {
    return this.n;
  }
  equals(other: unknown): boolean {
    const o = num(other);
    return o !== null && o.v === this.n;
  }
  gt(other: unknown): boolean {
    const o = num(other);
    return o !== null && this.n > o.v;
  }
  geq(other: unknown): boolean {
    const o = num(other);
    return o !== null && this.n >= o.v;
  }
  lt(other: unknown): boolean {
    const o = num(other);
    return o !== null && this.n < o.v;
  }
  leq(other: unknown): boolean {
    const o = num(other);
    return o !== null && this.n <= o.v;
  }
}

/** Ruby Float#to_s for the values themes produce. */
export function formatFloat(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "Infinity" : n < 0 ? "-Infinity" : "NaN";
  if (Number.isInteger(n)) {
    if (Math.abs(n) >= 1e16) return expForm(n);
    return n.toFixed(1);
  }
  const abs = Math.abs(n);
  if (abs < 1e-4) return expForm(n);
  return String(n);
}

function expForm(n: number): string {
  // Ruby: 1.0e+20, 1.5e-05
  const [m, e] = n.toExponential().split("e");
  const mant = m.includes(".") ? m : m + ".0";
  const exp = Number(e);
  return `${mant}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
}

export interface RNum {
  v: number;
  float: boolean;
}

/** Liquid's to_number: integers stay integers, "1.5" (digits.digits) is a float, other strings use Ruby's to_i. */
export function num(x: unknown): RNum | null {
  if (x instanceof RFloat) return { v: x.n, float: true };
  if (typeof x === "number") return Number.isNaN(x) ? null : { v: x, float: !Number.isInteger(x) };
  if (typeof x === "boolean" || x === null || x === undefined) return null;
  if (typeof x === "string") {
    const s = x.trim();
    if (/^-?\d+\.\d+$/.test(s)) return { v: parseFloat(s), float: true };
    // String#to_i: leading whitespace, optional sign, digits ("12abc" → 12, "abc" → 0)
    const m = x.match(/^\s*([-+]?\d+)/);
    return { v: m ? parseInt(m[1], 10) : 0, float: false };
  }
  if (typeof x === "object" && x !== null && typeof (x as { valueOf: () => unknown }).valueOf === "function") {
    const v = (x as { valueOf: () => unknown }).valueOf();
    if (v !== x) return num(v);
  }
  return null;
}

/** Liquid's Utils.to_number (nil/unknown → 0). */
export function toNum(x: unknown): RNum {
  return num(x) ?? { v: 0, float: false };
}

export function make(v: number, float: boolean): number | RFloat {
  if (float) return Number.isInteger(v) ? new RFloat(v) : v;
  return v;
}

export function plainNumber(x: unknown): number {
  return toNum(x).v;
}

export function isRubyFloat(x: unknown): boolean {
  return x instanceof RFloat || (typeof x === "number" && !Number.isInteger(x));
}

// ---------------------------------------------------------------------------------------------
// Liquid turns floats into BigDecimal(float.to_s) before arithmetic and the result back with to_f,
// so `0.1 | plus: 0.2` is 0.3 and `100 | divided_by: 0.563` is 177.61989342806393 (not …396).
// Dec is that decimal: m × 10^-e with a BigInt mantissa.

interface Dec {
  m: bigint;
  e: number;
}

function decOf(x: RNum): Dec {
  if (!x.float) return { m: BigInt(Math.trunc(x.v)), e: 0 };
  // shortest round-trip digits, as Ruby's Float#to_s
  const [mant, exp] = String(x.v).toLowerCase().split("e");
  const neg = mant.startsWith("-");
  const [ip, fp = ""] = mant.replace("-", "").split(".");
  let m = BigInt(ip + fp);
  let e = fp.length - Number(exp || 0);
  if (e < 0) {
    m *= 10n ** BigInt(-e);
    e = 0;
  }
  return { m: neg ? -m : m, e };
}

function align(a: Dec, b: Dec): [bigint, bigint, number] {
  const e = Math.max(a.e, b.e);
  return [a.m * 10n ** BigInt(e - a.e), b.m * 10n ** BigInt(e - b.e), e];
}

function decToNumber(d: Dec): number {
  const neg = d.m < 0n;
  let digits = (neg ? -d.m : d.m).toString();
  if (d.e > 0) {
    digits = digits.padStart(d.e + 1, "0");
    digits = digits.slice(0, digits.length - d.e) + "." + digits.slice(digits.length - d.e);
  }
  return parseFloat((neg ? "-" : "") + digits);
}

/** Quotient with 40 significant digits (BigDecimal divides to at least 32), truncated. */
function decDiv(a: Dec, b: Dec): Dec {
  const [x, y] = align(a, b);
  const extra = 40 + Math.max(0, y.toString().length - x.toString().length);
  const q = (x * 10n ** BigInt(extra)) / y;
  return { m: q, e: extra };
}

function decFloor(d: Dec): bigint {
  const p = 10n ** BigInt(d.e);
  const q = d.m / p;
  return d.m < 0n && q * p !== d.m ? q - 1n : q;
}

function arith(a: unknown, b: unknown, op: "+" | "-" | "*" | "/" | "%"): number | RFloat {
  const x = toNum(a), y = toNum(b);
  if (!x.float && !y.float) {
    // Ruby Integer arithmetic
    if (op === "+") return x.v + y.v;
    if (op === "-") return x.v - y.v;
    if (op === "*") return x.v * y.v;
    if (y.v === 0) throw new Error("divided by 0");
    if (op === "/") return Math.floor(x.v / y.v);
    return x.v - y.v * Math.floor(x.v / y.v);
  }
  const dx = decOf(x), dy = decOf(y);
  let r: Dec;
  if (op === "+" || op === "-") {
    const [p, q, e] = align(dx, dy);
    r = { m: op === "+" ? p + q : p - q, e };
  } else if (op === "*") {
    r = { m: dx.m * dy.m, e: dx.e + dy.e };
  } else {
    if (dy.m === 0n) throw new Error("divided by 0");
    if (op === "/") r = decDiv(dx, dy);
    else {
      // BigDecimal#% takes the sign of the divisor: x - y * floor(x / y)
      const [p, q, e] = align(dx, dy);
      const fl = decFloor(decDiv({ m: p, e }, { m: q, e }));
      r = { m: p - q * fl, e };
    }
  }
  return make(decToNumber(r), true);
}

export function plus(a: unknown, b: unknown) {
  return arith(a, b, "+");
}
export function minus(a: unknown, b: unknown) {
  return arith(a, b, "-");
}
export function times(a: unknown, b: unknown) {
  return arith(a, b, "*");
}
export function dividedBy(a: unknown, b: unknown) {
  return arith(a, b, "/");
}
export function modulo(a: unknown, b: unknown) {
  return arith(a, b, "%");
}

/** Round half away from zero at `digits` decimals, on the decimal value (BigDecimal#round). */
export function roundTo(v: number, digits: number): number {
  if (!Number.isFinite(v)) return v;
  const d = decOf({ v, float: true });
  const neg = d.m < 0n;
  const m = neg ? -d.m : d.m;
  const drop = d.e - digits;
  if (drop <= 0) return v;
  const p = 10n ** BigInt(drop);
  let q = m / p;
  if ((m % p) * 2n >= p) q += 1n;
  const out: Dec = digits >= 0 ? { m: neg ? -q : q, e: digits } : { m: (neg ? -q : q) * 10n ** BigInt(-digits), e: 0 };
  return decToNumber(out);
}

export function round(a: unknown, d: unknown) {
  const x = toNum(a);
  const digits = d === undefined || d === null ? 0 : Math.trunc(toNum(d).v);
  if (!x.float) {
    // Integer#round(n): negative n rounds to tens, hundreds… (half up)
    if (digits >= 0) return x.v;
    const p = Math.pow(10, -digits);
    return Math.sign(x.v) * Math.round(Math.abs(x.v) / p) * p;
  }
  const r = roundTo(x.v, digits);
  // Liquid: `result = result.to_i if n == 0`
  if (digits === 0) return Math.trunc(r);
  return make(r, true);
}
export function ceil(a: unknown) {
  return Math.ceil(toNum(a).v);
}
export function floor(a: unknown) {
  return Math.floor(toNum(a).v);
}
export function abs(a: unknown) {
  const x = toNum(a);
  return make(Math.abs(x.v), x.float);
}
export function atMost(a: unknown, b: unknown) {
  const x = toNum(a), y = toNum(b);
  return y.v < x.v ? make(y.v, y.float) : make(x.v, x.float);
}
export function atLeast(a: unknown, b: unknown) {
  const x = toNum(a), y = toNum(b);
  return y.v > x.v ? make(y.v, y.float) : make(x.v, x.float);
}
