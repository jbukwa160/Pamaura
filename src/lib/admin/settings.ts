// Shop settings in the admin: exchange-rate preview and the checks for the <head> codes.
import "server-only";
import { convertAmount, convertPrice, getCatalog, isPublished, type Market } from "../catalog";
import { formatMoney } from "../money";
import { shippingSettings } from "../shipping/rates";

export const ROUNDING_LABELS: Record<Market["rounding"], string> = {
  none: "без закръгляне (до стотинка)",
  whole_up: "нагоре до цяло число (49,06 → 50,00)",
  whole: "до най-близкото цяло число (49,46 → 49,00)",
  "99": "нагоре до ,99 (49,06 → 49,99)",
};

export interface RateRow {
  label: string;
  base: string;
  local: string;
}

export interface RatePreview {
  /** product prices: converted with the market's rounding (convertPrice, as the shop does) */
  prices: RateRow[];
  /** delivery prices and thresholds: plain conversion without rounding (convertAmount) */
  amounts: RateRow[];
  /** variants with their own price in this market, which the rate does not change */
  ownPrices: number;
}

export function ratePreview(handle: string, rate: number): RatePreview | null {
  const cat = getCatalog();
  const market = cat.markets.find((m) => m.handle === handle && !m.primary);
  const base = cat.markets.find((m) => m.primary) ?? cat.markets[0];
  if (!market || !base) return null;
  const m: Market = { ...market, rate };
  const fmt = (c: number, mk: Market) => formatMoney(c, mk.money_format);

  const prices: RateRow[] = [{ label: "Пример", base: fmt(899, base), local: fmt(convertPrice(899, m), m) }];
  for (const p of cat.products.filter(isPublished)) {
    const v = p.variants.find((x) => !x.market_prices[m.handle]);
    if (!v) continue;
    prices.push({ label: p.title, base: fmt(v.price, base), local: fmt(convertPrice(v.price, m), m) });
    if (prices.length >= 4) break;
  }

  const ship = shippingSettings();
  const amounts: RateRow[] = [];
  for (const method of ship.methods.filter((x) => x.enabled && x.markets.includes(m.handle)).slice(0, 2)) {
    amounts.push({ label: `Доставка: ${method.title.bg}`, base: fmt(method.price, base), local: fmt(convertAmount(method.price, m), m) });
  }
  if (ship.free_threshold !== null) amounts.push({ label: "Безплатна доставка над", base: fmt(ship.free_threshold, base), local: fmt(convertAmount(ship.free_threshold, m), m) });

  let ownPrices = 0;
  for (const v of cat.variantById.values()) if (v.market_prices[m.handle]) ownPrices++;
  return { prices, amounts, ownPrices };
}

export const HEAD_LIMITS = { token: 100, extra: 20000 };

const TOKEN: Record<"google" | "facebook" | "klaviyo", RegExp> = {
  google: /^[A-Za-z0-9_-]+$/,
  facebook: /^[A-Za-z0-9]+$/,
  klaviyo: /^[A-Za-z0-9]{1,20}$/,
};

/**
 * The verification code from what the admin pasted: the bare code, the whole <meta … content="…"> tag, or for
 * Klaviyo the script address with company_id=…. "" when empty, null when it is not a valid code (it goes
 * straight into the HTML of every page, so nothing else is allowed).
 */
export function cleanHeadToken(raw: unknown, kind: keyof typeof TOKEN): string | null {
  let v = String(raw ?? "").trim();
  if (!v) return "";
  const content = /content\s*=\s*["']([^"']*)["']/i.exec(v);
  if (content) v = content[1].trim();
  const company = /company_id=([A-Za-z0-9]+)/.exec(v);
  if (kind === "klaviyo" && company) v = company[1];
  if (v.length > HEAD_LIMITS.token) return null;
  return TOKEN[kind].test(v) ? v : null;
}
