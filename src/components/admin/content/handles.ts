// Web addresses ("handles") of pages and blog posts, made the way Shopify makes them: lowercase, words joined
// with "-", Cyrillic kept, accents on Latin letters dropped (the same rules as the storefront's handleize).
// Pure functions: used by the editors (while typing) and by the server actions (validation).

export const HANDLE_MAX = 200;

/** "Направи си сет!" → "направи-си-сет", "Crème brûlée" → "creme-brulee". */
export function toHandle(s: string): string {
  let out = "";
  let prevLatin = false;
  for (const ch of String(s).toLowerCase().normalize("NFD")) {
    if (/\p{M}/u.test(ch)) {
      if (!prevLatin) out += ch;
      continue;
    }
    out += ch;
    prevLatin = /[a-z]/.test(ch);
  }
  return out
    .normalize("NFC")
    .replace(/['"’`()[\]]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, HANDLE_MAX)
    .replace(/-+$/, "");
}

/** Lenient clean-up while typing: keeps a trailing "-" so the next word can be typed. */
export function handleTyping(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, HANDLE_MAX);
}

export function isValidHandle(h: string): boolean {
  return h.length > 0 && h.length <= HANDLE_MAX && toHandle(h) === h;
}
