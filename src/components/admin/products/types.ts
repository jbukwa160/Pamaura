// Shapes shared by the product / collection editors (browser) and their server actions, plus small helpers that
// both sides use. No server imports here: client components import this file too.
import type { BgRo } from "../ui";

/** Shopify's option of a product without variants. */
export const DEFAULT_OPTION = "Title";
export const DEFAULT_VALUE = "Default Title";

export type ProductStatus = "active" | "draft" | "archived";
export const STATUS_LABEL: Record<string, string> = { active: "Активен", draft: "Чернова", archived: "Архивиран" };

/** A product in pickers (upsells, collection products). */
export interface PickerProduct {
  id: number;
  title: string;
  handle: string;
  status: string;
  /** shown in the shop (active and published) */
  visible: boolean;
  thumb: string;
}

export type MetafieldKind = "text" | "multiline" | "rich" | "file" | "products" | "readonly";

export interface MetafieldForm {
  key: string;
  type: string;
  kind: MetafieldKind;
  label: string;
  hint: string;
  /** text / HTML / file key / JSON list of product gids */
  value: string;
  /** Romanian translation (text kinds) */
  ro: string;
  /** preview URL of a file value */
  url: string;
}

export interface MediaForm {
  /** null = uploaded in this session, saved as a new picture */
  id: number | null;
  key: string;
  type: string; // image | video | external_video
  file: string;
  url: string;
  alt: string;
}

export interface VariantForm {
  /** null = added in this session */
  id: number | null;
  key: string;
  /** one per product option */
  values: BgRo[];
  price: string;
  compareAt: string;
  sku: string;
  barcode: string;
  track: boolean;
  qty: string;
  /** stock when the editor was opened: the stock is only written when it was changed here (orders change it too) */
  qty0: number | null;
  continueSelling: boolean;
  /** grams */
  weight: string;
}

export interface ProductForm {
  title: BgRo;
  body: BgRo;
  status: string;
  vendor: string;
  productType: BgRo;
  tags: string[];
  templateSuffix: string;
  handle: string;
  seoTitle: BgRo;
  seoDescription: BgRo;
  /** option names; a product without variants has Shopify's single "Title" option */
  options: BgRo[];
  variants: VariantForm[];
  media: MediaForm[];
  metafields: MetafieldForm[];
}

export interface CollectionForm {
  title: BgRo;
  body: BgRo;
  image: string;
  imageUrl: string;
  imageAlt: string;
  published: boolean;
  sortOrder: string;
  templateSuffix: string;
  handle: string;
  seoTitle: BgRo;
  seoDescription: BgRo;
  /** manual collections: products in order */
  productIds: number[];
  metafields: MetafieldForm[];
}

export type SaveResult<T> = { ok?: boolean; error?: string; value?: T };

/** Sort orders the storefront supports for collections (Shopify values). */
export const COLLECTION_SORTS: { value: string; label: string }[] = [
  { value: "manual", label: "Ръчно (по реда по-долу)" },
  { value: "best-selling", label: "Най-продавани първо" },
  { value: "title-ascending", label: "По азбучен ред, А – Я" },
  { value: "title-descending", label: "По азбучен ред, Я – А" },
  { value: "price-ascending", label: "Цена, от ниска към висока" },
  { value: "price-descending", label: "Цена, от висока към ниска" },
  { value: "created-ascending", label: "Дата, от стари към нови" },
  { value: "created-descending", label: "Дата, от нови към стари" },
];

/** "12,99" / "12.99" / "12" → 1299 cents; "" → null; invalid → NaN (same rules as parseMoney in ui.tsx). */
export function parseCents(text: string): number | null {
  const t = String(text ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}

/** 1299 → "12,99" */
export function centsText(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Whole number text → number; "" → null; invalid → NaN. */
export function parseWhole(text: string, allowNegative = false): number | null {
  const t = String(text ?? "").trim().replace(/\s/g, "");
  if (!t) return null;
  if (!(allowNegative ? /^-?\d+$/ : /^\d+$/).test(t)) return NaN;
  return Number(t);
}

export interface RonMarket {
  rate: number;
  rounding: string;
  format: string;
}

/** Same conversion as convertPrice in lib/catalog.ts (shop currency → market currency, with its rounding). */
export function convertCents(cents: number, m: { rate: number; rounding: string }): number {
  if (m.rate === 1 && m.rounding === "none") return cents;
  const raw = (cents * m.rate) / 100;
  let major: number;
  switch (m.rounding) {
    case "whole_up":
      major = Math.ceil(raw - 1e-9);
      break;
    case "whole":
      major = Math.round(raw);
      break;
    case "99":
      major = Math.ceil(raw - 1e-9) - 0.01;
      break;
    default:
      major = Math.round(raw * 100) / 100;
  }
  return Math.round(major * 100);
}

/** Has the product only Shopify's default variant (no options to choose)? */
export function isDefaultOnly(f: Pick<ProductForm, "options" | "variants">): boolean {
  return f.options.length === 1 && f.options[0].bg === DEFAULT_OPTION && f.variants.length === 1 && f.variants[0].values[0]?.bg === DEFAULT_VALUE;
}

export const productGid = (id: number) => `gid://shopify/Product/${id}`;

/** Product ids of a list.product_reference value. */
export function gidList(value: string): number[] {
  try {
    const arr = JSON.parse(value || "[]") as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((g) => {
        const m = String(g).match(/(\d+)$/);
        return m ? Number(m[1]) : NaN;
      })
      .filter((n) => Number.isSafeInteger(n) && n > 0);
  } catch {
    return [];
  }
}
