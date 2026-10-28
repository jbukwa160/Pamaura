// Alignment helpers for the importers: tokenise our rendering and the live page, diff them, and
// read the live content at the places where our rendering has probes.
import { diffArrays } from "diff";


/** Normalised tokens plus, for each, the exact source text (for copying live HTML verbatim). */
export function tokensWithRaw(html: string): { tok: string[]; raw: string[]; gaps: string[] } {
  const src = html
    .replace(/template--\d+__/g, "template--X__")
    .replace(/sections--\d+__/g, "sections--X__")
    .replace(/\/cdn\/shop\/t\/\d+\/assets\/([^"'?\s)]+)\?v=\d+/g, "/cdn/shop/t/T/assets/$1")
    .replace(/shopify-block-[A-Za-z0-9]+__/g, "shopify-block-X__");
  const tok: string[] = [], raw: string[] = [], gaps: string[] = [];
  let pendingGap = "";
  for (const m of src.matchAll(/<[^>]*>|[^<]+/g)) {
    const t = m[0];
    if (t.startsWith("<")) {
      tok.push(t.replace(/\s+/g, " "));
      raw.push(t);
      gaps.push(pendingGap);
      pendingGap = "";
    } else {
      const s = t.replace(/\s+/g, " ").trim();
      if (s) {
        tok.push(s);
        raw.push(t);
        gaps.push(pendingGap);
        pendingGap = "";
      } else pendingGap += t;
    }
  }
  return { tok, raw, gaps };
}

export function tokens(html: string): string[] {
  const norm = html
    .replace(/template--\d+__/g, "template--X__")
    .replace(/sections--\d+__/g, "sections--X__")
    .replace(/\/cdn\/shop\/t\/\d+\/assets\/([^"'?\s)]+)\?v=\d+/g, "/cdn/shop/t/T/assets/$1")
    .replace(/shopify-block-[A-Za-z0-9]+__/g, "shopify-block-X__");
  const out: string[] = [];
  for (const m of norm.matchAll(/<[^>]*>|[^<]+/g)) {
    const t = m[0];
    if (t.startsWith("<")) out.push(t.replace(/\s+/g, " "));
    else {
      const s = t.replace(/\s+/g, " ").trim();
      if (s) out.push(s);
    }
  }
  return out;
}

export interface Pair {
  ours: string[];
  live: string[];
  liveStart: number;
}

/** Pairs every changed run in ours with the changed run in live at the same place. */
export function changedRuns(a: string[], b: string[]): { pairs: Pair[]; liveIndexOf: (oursIndex: number) => number } {
  const parts = diffArrays(a, b);
  const pairs: Pair[] = [];
  let ia = 0, ib = 0;
  const map: number[] = new Array(a.length).fill(-1);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.added && !p.removed) {
      for (let k = 0; k < p.count!; k++) map[ia + k] = ib + k;
      ia += p.count!;
      ib += p.count!;
      continue;
    }
    if (p.removed) {
      const next = parts[i + 1];
      const live = next && next.added ? next.value : [];
      pairs.push({ ours: p.value, live, liveStart: ib });
      ia += p.count!;
      if (next && next.added) {
        ib += next.count!;
        i++;
      }
      continue;
    }
    if (p.added) ib += p.count!;
  }
  return { pairs, liveIndexOf: (i) => map[i] };
}

export function decode(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&amp;/g, "&");
}

export function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? "";
  return out;
}

/** Live HTML (verbatim) inside the element opened at token i. */
export function balanced(liveTokens: string[], i: number, raw: string[], gaps: string[]): string {
  const open = liveTokens[i];
  const tag = open.match(/^<([a-z0-9-]+)/i)?.[1]?.toLowerCase();
  if (!tag) return "";
  let depth = 0;
  let out = "";
  for (let k = i; k < liveTokens.length; k++) {
    const t = liveTokens[k];
    if (new RegExp(`^<${tag}[\\s>]`, "i").test(t)) depth++;
    else if (new RegExp(`^</${tag}>`, "i").test(t)) depth--;
    if (k > i) out += gaps[k];
    if (depth === 0) break;
    if (k > i) out += raw[k];
  }
  return out;
}

