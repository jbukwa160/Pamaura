// Menu links as the storefront stores them: market-neutral paths ("/", "/collections/all", "/pages/<handle>",
// "/blogs/news/<handle>"), shopify:// links, or any address. Pure functions: used by the menu editor and by the
// server action that saves menus.

export type LinkKind = "" | "home" | "collection" | "product" | "page" | "blog" | "article" | "search" | "custom";

export const URL_MAX = 500;

function decode(p: string) {
  try {
    return decodeURI(p);
  } catch {
    return p;
  }
}

/** What a stored URL points to; key = handle ("blog/handle" for posts). */
export function parseLink(url: string): { kind: LinkKind; key: string } {
  const u = url.trim();
  if (!u) return { kind: "", key: "" };
  if (u === "shopify://") return { kind: "home", key: "" };
  const sm = u.match(/^shopify:\/\/(\w+)\/?(.*)$/);
  const p = sm ? `/${sm[1]}${sm[2] ? `/${sm[2]}` : ""}` : u;
  if (p === "/") return { kind: "home", key: "" };
  if (/[?#]/.test(p) || !p.startsWith("/")) return { kind: "custom", key: "" };
  const d = decode(p);
  let m: RegExpMatchArray | null;
  if ((m = d.match(/^\/collections\/([^/]+)$/))) return { kind: "collection", key: m[1] };
  if ((m = d.match(/^\/products\/([^/]+)$/))) return { kind: "product", key: m[1] };
  if ((m = d.match(/^\/pages\/([^/]+)$/))) return { kind: "page", key: m[1] };
  if ((m = d.match(/^\/blogs\/([^/]+)$/))) return { kind: "blog", key: m[1] };
  if ((m = d.match(/^\/blogs\/([^/]+\/[^/]+)$/))) return { kind: "article", key: m[1] };
  if (d === "/search") return { kind: "search", key: "" };
  return { kind: "custom", key: "" };
}

export function buildUrl(kind: LinkKind, key: string): string {
  switch (kind) {
    case "home":
      return "/";
    case "search":
      return "/search";
    case "collection":
      return `/collections/${key}`;
    case "product":
      return `/products/${key}`;
    case "page":
      return `/pages/${key}`;
    case "blog":
    case "article":
      return `/blogs/${key}`;
    default:
      return "";
  }
}

/** Problem with a link address, or null when it can be saved. */
export function urlProblem(url: string): string | null {
  const u = url.trim();
  if (!u) return "Изберете накъде води връзката.";
  if (u.length > URL_MAX) return "Адресът е твърде дълъг.";
  if (/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*|#[^\s]*|mailto:[^\s]+|tel:[+\d\s()-]+|shopify:\/\/[^\s]*)$/i.test(u)) return null;
  return "Адресът трябва да започва с https://, / или # (или mailto: / tel:).";
}
