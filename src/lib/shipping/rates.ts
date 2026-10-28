// Delivery methods and prices (admin → Доставка). Prices are in the shop currency (EUR cents)
// and converted for other markets.
import { convertAmount, type Market } from "../catalog";
import { priceCart } from "../cart";
import { getSetting } from "../db";
import type { RenderState } from "../liquid/state";

export type Carrier = "econt" | "speedy" | "boxnow" | "other";
export type Kind = "office" | "locker" | "address";

export interface ShippingMethod {
  code: string; // econt_office
  carrier: Carrier;
  kind: Kind;
  enabled: boolean;
  markets: string[]; // market handles
  price: number; // cents, shop currency
  title: Record<string, string>; // per locale
  description: Record<string, string>;
}

export interface ShippingSettings {
  methods: ShippingMethod[];
  free_threshold: number | null; // cents, null = never free
  free_methods: "all" | "office_locker";
  cod_enabled: boolean;
  cod_fee: number; // cents
  bank_transfer_enabled: boolean;
  bank_details: string;
}

export const DEFAULT_SHIPPING: ShippingSettings = {
  methods: [
    { code: "econt_office", carrier: "econt", kind: "office", enabled: true, markets: ["bg"], price: 350, title: { bg: "До офис на Еконт", ro: "La biroul Econt" }, description: { bg: "1–2 работни дни", ro: "1–2 zile lucrătoare" } },
    { code: "econt_locker", carrier: "econt", kind: "locker", enabled: true, markets: ["bg"], price: 350, title: { bg: "До Еконтомат", ro: "La Econtomat" }, description: { bg: "1–2 работни дни", ro: "1–2 zile lucrătoare" } },
    { code: "speedy_office", carrier: "speedy", kind: "office", enabled: true, markets: ["bg"], price: 350, title: { bg: "До офис на Спиди", ro: "La biroul Speedy" }, description: { bg: "1–2 работни дни", ro: "1–2 zile lucrătoare" } },
    { code: "boxnow_locker", carrier: "boxnow", kind: "locker", enabled: true, markets: ["bg"], price: 300, title: { bg: "До автомат BOX NOW", ro: "La automatul BOX NOW" }, description: { bg: "1–2 работни дни", ro: "1–2 zile lucrătoare" } },
    { code: "econt_address", carrier: "econt", kind: "address", enabled: true, markets: ["bg"], price: 550, title: { bg: "До адрес с Еконт", ro: "La adresă cu Econt" }, description: { bg: "1–2 работни дни", ro: "1–2 zile lucrătoare" } },
    { code: "speedy_address", carrier: "speedy", kind: "address", enabled: true, markets: ["bg"], price: 550, title: { bg: "До адрес със Спиди", ro: "La adresă cu Speedy" }, description: { bg: "1–2 работни дни", ro: "1–2 zile lucrătoare" } },
    { code: "ro_address", carrier: "other", kind: "address", enabled: true, markets: ["ro"], price: 600, title: { bg: "До адрес в Румъния", ro: "Livrare prin curier la adresă" }, description: { bg: "2–4 работни дни", ro: "2–4 zile lucrătoare" } },
  ],
  free_threshold: 3500,
  free_methods: "all",
  cod_enabled: true,
  cod_fee: 0,
  bank_transfer_enabled: false,
  bank_details: "",
};

export function shippingSettings(): ShippingSettings {
  const saved = getSetting<Partial<ShippingSettings>>("shipping", {});
  return { ...DEFAULT_SHIPPING, ...saved, methods: saved.methods?.length ? saved.methods : DEFAULT_SHIPPING.methods };
}

/** Office / locker lists: Econt's and BOX NOW's are public, Speedy needs the logins in .env.local. */
export function carrierListsAvailable(c: Carrier): boolean {
  if (c === "speedy") return Boolean(process.env.SPEEDY_USERNAME && process.env.SPEEDY_PASSWORD);
  return true;
}

/** Methods offered at checkout: enabled for the market and the courier connected (Speedy needs its logins for offices and waybills alike). */
export function methodsFor(market: Market): ShippingMethod[] {
  return shippingSettings().methods.filter((m) => m.enabled && m.markets.includes(market.handle) && carrierListsAvailable(m.carrier));
}

/** Price of a method for a cart subtotal (market currency), applying free delivery. */
export function methodPrice(m: ShippingMethod, market: Market, subtotalMarket: number): number {
  const cfg = shippingSettings();
  const threshold = cfg.free_threshold === null ? null : convertAmount(cfg.free_threshold, market);
  const eligible = cfg.free_methods === "all" || m.kind !== "address";
  if (threshold !== null && eligible && subtotalMarket >= threshold) return 0;
  return convertAmount(m.price, market);
}

/** /cart/shipping_rates.json */
export function shippingRatesForCart(s: RenderState) {
  const pc = priceCart(s.cart, s.market, s.catalog);
  return methodsFor(s.market).map((m) => {
    const price = methodPrice(m, s.market, pc.total_price);
    return {
      name: m.title[s.locale] || m.title.bg,
      presentment_name: m.title[s.locale] || m.title.bg,
      code: m.code,
      price: (price / 100).toFixed(2),
      markup: null,
      source: "pamaura",
      delivery_date: null,
      delivery_range: null,
      delivery_days: [],
      compare_price: null,
      phone_required: true,
      currency: s.market.currency,
      carrier_identifier: m.carrier,
      delivery_category: null,
      using_merchant_calculated_rates: false,
      carrier_service_id: null,
      description: m.description[s.locale] || null,
      api_client_id: null,
      requested_fulfillment_service_id: null,
      shipment_options: null,
      charge_items: null,
      has_restrictions: null,
      rating_classification: null,
      accepts_instructions: false,
    };
  });
}
