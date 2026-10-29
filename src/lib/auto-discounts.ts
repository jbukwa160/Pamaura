// Automatic discounts (no code), like the live store's "Bundle & Save": 15% off the whole cart from
// 3 items on. Edited in admin → Отстъпки (setting "automatic_discounts"). They do not combine with
// discount codes; at checkout the larger of the two applies.
import crypto from "node:crypto";
import { getSetting } from "./db";

export interface AutoDiscount {
  id: string;
  title: string;
  enabled: boolean;
  /** percent off every line */
  percentage: number;
  /** minimum number of items in the cart (quantities added up; a multi-pack variant is one item) */
  min_items: number;
}

/** As configured on the live Shopify store (an app discount, checked against its cart). */
export const DEFAULT_AUTOMATIC: AutoDiscount[] = [{ id: "bundle-save", title: "Bundle & Save", enabled: true, percentage: 15, min_items: 3 }];

export function automaticDiscounts(): AutoDiscount[] {
  return getSetting<AutoDiscount[]>("automatic_discounts", DEFAULT_AUTOMATIC);
}

export interface AutoResult {
  discount: AutoDiscount;
  /** total discount, cart currency subunits */
  total: number;
  /** per line, in cart order (same order as the lines passed in) */
  allocations: number[];
}

/**
 * The best automatic discount for these lines. Amounts as Shopify computed them on the live store:
 * the total is the percentage of the subtotal rounded down; each line gets its own share rounded, the
 * last line the remainder (e.g. 15% of €40,97 = €6,14 → €3,30 + €1,50 + €1,34).
 */
export function applyAutomatic(lines: { line_price: number; quantity: number }[]): AutoResult | null {
  const items = lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = lines.reduce((n, l) => n + l.line_price, 0);
  let best: AutoResult | null = null;
  for (const d of automaticDiscounts()) {
    if (!d.enabled || !(d.percentage > 0) || items < Math.max(1, d.min_items)) continue;
    const pct = Math.min(100, d.percentage);
    const total = Math.floor((subtotal * pct) / 100);
    if (total <= 0) continue;
    const allocations: number[] = [];
    let left = total;
    lines.forEach((l, i) => {
      const share = i === lines.length - 1 ? left : Math.min(left, Math.round((l.line_price * pct) / 100));
      allocations.push(share);
      left -= share;
    });
    if (!best || total > best.total) best = { discount: d, total, allocations };
  }
  return best;
}

/** cart.js / Liquid `cart_level_discount_applications` entry. */
export function discountApplicationJson(r: AutoResult) {
  return {
    type: "",
    key: crypto.randomUUID(),
    title: r.discount.title,
    description: null,
    value: Number.isInteger(r.discount.percentage) ? r.discount.percentage.toFixed(1) : String(r.discount.percentage),
    created_at: new Date().toISOString(),
    value_type: "percentage",
    allocation_method: "across",
    target_selection: "all",
    target_type: "line_item",
    total_allocated_amount: r.total,
  };
}
