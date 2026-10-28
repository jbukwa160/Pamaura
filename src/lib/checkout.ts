// Checkout: pricing (server is the authority), validation and order creation.
import crypto from "node:crypto";
import { deleteCart, priceCart, type CartData } from "./cart";
import { getCatalog, type Market } from "./catalog";
import { getDb, getSetting, nowIso } from "./db";
import { discountMessage, evaluateDiscount, type DiscountLine } from "./discounts";
import { formatMoney } from "./liquid/filters";
import { translateOptionValue } from "./liquid/drops/catalog";
import { tr, type RenderState } from "./liquid/state";
import { cdnFileUrl } from "./liquid/drops/base";
import { upsertGuest } from "./customers";
import { addOrderEvent, nextOrderNumber, orderById, type OrderRec } from "./orders";
import { methodPrice, methodsFor, shippingSettings, type ShippingMethod } from "./shipping/rates";
import { subscribe } from "./newsletter";
import { sendOrderEmails } from "./emails/order";

export interface CheckoutOffice {
  id: string;
  name: string;
  address: string;
  city: string;
  cityId?: string;
  postcode?: string;
}

export interface CheckoutInput {
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  method: string;
  office?: CheckoutOffice | null;
  address?: { city: string; cityId?: string; postcode: string; address1: string; address2?: string } | null;
  payment: string;
  discount_code?: string;
  note?: string;
  accepts_marketing?: boolean;
  terms?: boolean;
  idempotency?: string;
}

export interface QuoteLine {
  key: string;
  product_id: number;
  variant_id: number;
  title: string;
  variant_title: string | null;
  quantity: number;
  price: number;
  compare_at_price: number | null;
  line_price: number;
  image: string | null;
  /** thumbnail URL for the checkout summary */
  image_url: string | null;
  handle: string;
  sku: string;
}

export interface QuoteMethod {
  code: string;
  carrier: string;
  kind: string;
  title: string;
  description: string;
  price: number;
}

export interface Quote {
  currency: string;
  market: string;
  lines: QuoteLine[];
  item_count: number;
  subtotal: number;
  discount: { code: string; amount: number; free_shipping: boolean; error: string | null } | null;
  shipping: number;
  method: QuoteMethod | null;
  cod_fee: number;
  total: number;
  tax: number;
  tax_rate: number;
  methods: QuoteMethod[];
  payments: { code: string; title: string; description: string }[];
}

const TEXT: Record<string, Record<string, string>> = {
  bg: {
    cod: "Наложен платеж",
    cod_desc: "Плащате в брой или с карта на куриера при получаване.",
    bank: "Банков превод",
    bank_desc: "Ще получите данните за превод в имейла за поръчката. Изпращаме след получаване на плащането.",
  },
  ro: {
    cod: "Ramburs",
    cod_desc: "Plătiți curierului la livrare, numerar sau cu cardul.",
    bank: "Transfer bancar",
    bank_desc: "Primiți datele pentru transfer în e-mailul comenzii. Expediem după primirea plății.",
  },
};
export const ct = (locale: string, key: string) => TEXT[locale]?.[key] ?? TEXT.bg[key];

export function taxRate(market: Market): number {
  const rates = getSetting<Record<string, number>>("tax_rates", { BG: 20, RO: 21 });
  return rates[market.country] ?? 20;
}

function lineTitle(s: RenderState, productId: number, fallback: string) {
  return tr(s, "product", productId, "title", fallback);
}

export function quote(s: RenderState, cart: CartData, input: Partial<CheckoutInput>): Quote {
  const market = s.market;
  const cat = getCatalog();
  const pc = priceCart(cart, market, cat);
  const lines: QuoteLine[] = pc.lines.map((l) => {
    const def = l.product.variants.length === 1 && (l.variant.title === "Default Title" || l.variant.option1 === "Default Title");
    const vt = def
      ? null
      : [l.variant.option1, l.variant.option2, l.variant.option3]
          .map((v, i) => (v == null ? null : translateOptionValue(s, l.product, i, v)))
          .filter(Boolean)
          .join(" / ");
    const media = l.variant.image_id ? l.product.media.find((m) => m.image_id === l.variant.image_id) : l.product.media.find((m) => m.media_type === "image") || l.product.media[0];
    return {
      key: l.item.key,
      product_id: l.product.id,
      variant_id: l.variant.id,
      title: lineTitle(s, l.product.id, l.product.title),
      variant_title: vt,
      quantity: l.item.quantity,
      price: l.price,
      compare_at_price: l.compare_at_price,
      line_price: l.line_price,
      image: media?.file ?? null,
      image_url: media?.file ? `${cdnFileUrl(s, media.file)}&width=160` : null,
      handle: l.product.handle,
      sku: l.variant.sku,
    };
  });
  const subtotal = pc.total_price;

  let discount: Quote["discount"] = null;
  let discountAmount = 0;
  let freeShipping = false;
  const code = (input.discount_code || "").trim();
  if (code) {
    const dl: DiscountLine[] = pc.lines.map((l) => ({
      product_id: l.product.id,
      collection_ids: cat.collections.filter((c) => c.product_ids.includes(l.product.id)).map((c) => c.id),
      line_price: l.line_price,
    }));
    const r = evaluateDiscount(code, dl, subtotal, market, input.email);
    if (r.ok) {
      discountAmount = r.amount;
      freeShipping = r.freeShipping;
      discount = { code: r.discount!.code, amount: r.amount, free_shipping: r.freeShipping, error: null };
    } else {
      discount = { code, amount: 0, free_shipping: false, error: discountMessage(s.locale, r.error!, r.minAmount ? formatMoney(r.minAmount, market.money_format) : undefined) };
    }
  }

  const afterDiscount = subtotal - discountAmount;
  const methods: QuoteMethod[] = methodsFor(market).map((m: ShippingMethod) => ({
    code: m.code,
    carrier: m.carrier,
    kind: m.kind,
    title: m.title[s.locale] || m.title.bg,
    description: m.description[s.locale] || m.description.bg || "",
    price: freeShipping ? 0 : methodPrice(m, market, afterDiscount),
  }));
  const method = methods.find((m) => m.code === input.method) || null;
  const shipping = method ? method.price : 0;
  const cfg = shippingSettings();
  const payments: Quote["payments"] = [];
  if (cfg.cod_enabled) payments.push({ code: "cod", title: ct(s.locale, "cod"), description: ct(s.locale, "cod_desc") });
  if (cfg.bank_transfer_enabled) payments.push({ code: "bank_transfer", title: ct(s.locale, "bank"), description: ct(s.locale, "bank_desc") });
  const codFee = input.payment === "cod" && cfg.cod_fee ? Math.round(cfg.cod_fee * market.rate) : 0;
  const total = afterDiscount + shipping + codFee;
  const rate = taxRate(market);
  const tax = total - Math.round(total / (1 + rate / 100));
  return { currency: market.currency, market: market.handle, lines, item_count: pc.item_count, subtotal, discount, shipping, method, cod_fee: codFee, total, tax, tax_rate: rate, methods, payments };
}

// ---------------------------------------------------------------------------------------------

const ERR: Record<string, Record<string, string>> = {
  bg: {
    empty: "Количката е празна.",
    email: "Въведете валиден имейл адрес.",
    phone: "Въведете валиден телефонен номер.",
    first_name: "Въведете име.",
    last_name: "Въведете фамилия.",
    method: "Изберете начин на доставка.",
    office: "Изберете офис или автомат.",
    office_gone: "Избраният офис вече не е в списъка на куриера. Изберете друг.",
    city: "Въведете населено място.",
    postcode: "Въведете пощенски код.",
    address1: "Въведете адрес.",
    payment: "Изберете начин на плащане.",
    terms: "Необходимо е да приемете общите условия.",
    stock: "Няма достатъчно наличност от „{{title}}“. Наличност: {{qty}}.",
    discount: "Кодът за отстъпка не може да бъде приложен: {{msg}}",
  },
  ro: {
    empty: "Coșul este gol.",
    email: "Introduceți o adresă de e-mail validă.",
    phone: "Introduceți un număr de telefon valid.",
    first_name: "Introduceți prenumele.",
    last_name: "Introduceți numele.",
    method: "Alegeți metoda de livrare.",
    office: "Alegeți un birou sau un automat.",
    office_gone: "Biroul ales nu mai este în lista curierului. Alegeți altul.",
    city: "Introduceți localitatea.",
    postcode: "Introduceți codul poștal.",
    address1: "Introduceți adresa.",
    payment: "Alegeți metoda de plată.",
    terms: "Trebuie să acceptați termenii și condițiile.",
    stock: "Stoc insuficient pentru „{{title}}”. Disponibil: {{qty}}.",
    discount: "Codul de reducere nu poate fi aplicat: {{msg}}",
  },
};
export function checkoutError(locale: string, key: string, vars: Record<string, string | number> = {}) {
  return (ERR[locale]?.[key] ?? ERR.bg[key]).replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? ""));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizePhone(phone: string, country: string): string | null {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (raw.startsWith("+")) return "+" + digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  const cc = country === "RO" ? "40" : "359";
  if (digits.startsWith(cc) && digits.length >= 11) return "+" + digits;
  if (digits.startsWith("0")) return `+${cc}${digits.slice(1)}`;
  return `+${cc}${digits}`;
}

export interface PlaceResult {
  ok: boolean;
  errors?: Record<string, string>;
  order?: OrderRec;
}

/** Validates and saves the order in one transaction. Idempotent per `input.idempotency`. */
export async function placeOrder(s: RenderState, cart: CartData, input: CheckoutInput, meta: { ip: string; userAgent: string | null }): Promise<PlaceResult> {
  const L = s.locale;
  const errors: Record<string, string> = {};
  const db = getDb();

  if (input.idempotency) {
    const existing = db.prepare("SELECT id FROM orders WHERE idempotency_key = ?").get(`${cart.token}:${input.idempotency}`) as { id: number } | undefined;
    if (existing) return { ok: true, order: orderById(existing.id)! };
  }
  if (!cart.items.length) return { ok: false, errors: { form: checkoutError(L, "empty") } };

  const email = String(input.email || "").trim().slice(0, 200);
  if (!EMAIL_RE.test(email)) errors.email = checkoutError(L, "email");
  const phone = normalizePhone(String(input.phone || ""), s.market.country);
  if (!phone) errors.phone = checkoutError(L, "phone");
  const first = String(input.first_name || "").trim().slice(0, 80);
  const last = String(input.last_name || "").trim().slice(0, 80);
  if (!first) errors.first_name = checkoutError(L, "first_name");
  if (!last) errors.last_name = checkoutError(L, "last_name");

  const q = quote(s, cart, input);
  if (!q.lines.length) return { ok: false, errors: { form: checkoutError(L, "empty") } };
  const method = q.method;
  if (!method) errors.method = checkoutError(L, "method");
  const methodCfg = method ? methodsFor(s.market).find((m) => m.code === method.code) : undefined;

  let office: CheckoutOffice | null = null;
  let address: CheckoutInput["address"] = null;
  if (methodCfg && (methodCfg.kind === "office" || methodCfg.kind === "locker")) {
    const o = input.office;
    if (!o || !o.id) errors.office = checkoutError(L, "office");
    else {
      office = { id: String(o.id).slice(0, 64), name: String(o.name || "").slice(0, 200), address: String(o.address || "").slice(0, 300), city: String(o.city || "").slice(0, 120), cityId: o.cityId ? String(o.cityId) : undefined, postcode: o.postcode ? String(o.postcode) : undefined };
      if (methodCfg.carrier !== "other") {
        const { verifyOffice } = await import("./shipping/offices");
        const verified = await verifyOffice(methodCfg.carrier, office.id);
        if (verified === null) errors.office = checkoutError(L, "office_gone");
        else if (verified) office = { id: verified.id, name: verified.name, address: verified.address, city: verified.city, cityId: verified.cityId, postcode: verified.postcode };
      }
    }
  } else if (methodCfg) {
    const a = input.address || ({} as NonNullable<CheckoutInput["address"]>);
    address = {
      city: String(a.city || "").trim().slice(0, 120),
      cityId: a.cityId ? String(a.cityId) : undefined,
      postcode: String(a.postcode || "").trim().slice(0, 16),
      address1: String(a.address1 || "").trim().slice(0, 300),
      address2: String(a.address2 || "").trim().slice(0, 300),
    };
    if (!address.city) errors.city = checkoutError(L, "city");
    if (!address.postcode) errors.postcode = checkoutError(L, "postcode");
    if (!address.address1) errors.address1 = checkoutError(L, "address1");
  }
  if (!q.payments.some((p) => p.code === input.payment)) errors.payment = checkoutError(L, "payment");
  if (!input.terms) errors.terms = checkoutError(L, "terms");
  if (q.discount?.error) errors.discount_code = checkoutError(L, "discount", { msg: q.discount.error });

  // stock
  const cat = getCatalog();
  for (const l of q.lines) {
    const v = cat.variantById.get(l.variant_id)!;
    if (v.inventory_management && v.inventory_policy !== "continue") {
      const want = q.lines.filter((x) => x.variant_id === v.id).reduce((n, x) => n + x.quantity, 0);
      if (want > v.inventory_quantity) errors[`line_${l.key}`] = checkoutError(L, "stock", { title: l.title + (l.variant_title ? ` – ${l.variant_title}` : ""), qty: Math.max(0, v.inventory_quantity) });
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const shippingAddress = {
    first_name: first,
    last_name: last,
    name: `${first} ${last}`,
    phone,
    email,
    kind: methodCfg!.kind,
    carrier: methodCfg!.carrier,
    office_id: office?.id ?? null,
    office_name: office?.name ?? null,
    office_address: office?.address ?? null,
    city: office?.city ?? address?.city ?? "",
    city_id: office?.cityId ?? address?.cityId ?? null,
    zip: office?.postcode ?? address?.postcode ?? "",
    address1: office ? `${office.name}${office.address ? ", " + office.address : ""}` : address!.address1,
    address2: office ? "" : address!.address2 || "",
    country: s.market.country_name,
    country_code: s.market.country,
  };

  const token = crypto.randomBytes(16).toString("hex");
  const now = nowIso();
  let orderId = 0;
  db.transaction(() => {
    const customerId = s.customer?.id ?? upsertGuest(email, first, last, phone, L).id;
    const number = nextOrderNumber();
    const info = db
      .prepare(
        `INSERT INTO orders(number, token, idempotency_key, customer_id, email, phone, market, locale, currency, subtotal, discount_total, shipping_total, cod_fee, total, tax_included, tax_total,
          discount_code, payment_method, financial_status, fulfillment_status, status, shipping_method, shipping_title, shipping_address, note, attributes, ip, user_agent, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'pending', 'unfulfilled', 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        number,
        token,
        input.idempotency ? `${cart.token}:${input.idempotency}` : null,
        customerId,
        email,
        phone,
        s.market.handle,
        L,
        s.market.currency,
        q.subtotal,
        q.discount?.amount ?? 0,
        q.shipping,
        q.cod_fee,
        q.total,
        q.tax,
        q.discount && !q.discount.error ? q.discount.code : null,
        input.payment,
        method!.code,
        method!.title,
        JSON.stringify(shippingAddress),
        input.note ? String(input.note).slice(0, 2000) : null,
        JSON.stringify(cart.attributes || {}),
        meta.ip,
        meta.userAgent ? meta.userAgent.slice(0, 300) : null,
        now,
        now,
      );
    orderId = Number(info.lastInsertRowid);
    // spread the order discount over the lines (for invoices / refunds)
    let left = q.discount?.amount ?? 0;
    const ins = db.prepare(
      "INSERT INTO order_lines(order_id, product_id, variant_id, title, variant_title, sku, image, handle, quantity, price, original_price, compare_at_price, discount_allocated, properties, requires_shipping, weight) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    q.lines.forEach((l, i) => {
      const share = i === q.lines.length - 1 ? left : Math.round(((q.discount?.amount ?? 0) * l.line_price) / Math.max(1, q.subtotal));
      left -= share;
      const v = cat.variantById.get(l.variant_id)!;
      const item = cart.items.find((x) => x.key === l.key);
      ins.run(orderId, l.product_id, l.variant_id, l.title, l.variant_title, l.sku, l.image, l.handle, l.quantity, l.price, l.price, l.compare_at_price, share, JSON.stringify(item?.properties || {}), v.requires_shipping ? 1 : 0, v.weight);
      if (v.inventory_management) db.prepare("UPDATE variants SET inventory_quantity = inventory_quantity - ?, updated_at = ? WHERE id = ?").run(l.quantity, now, v.id);
    });
    if (q.discount && !q.discount.error) db.prepare("UPDATE discounts SET times_used = times_used + 1 WHERE code = ?").run(q.discount.code);
    addOrderEvent(orderId, "created", `Поръчката е направена от ${s.origin.replace(/^https?:\/\//, "")} (${s.market.path}).`);
    deleteCart(cart.token);
  })();
  // stock changed → reload the catalog for everyone
  const { bumpCatalogVersion } = await import("./db");
  bumpCatalogVersion();
  if (input.accepts_marketing) subscribe(email, "checkout", L);
  const order = orderById(orderId)!;
  try {
    await sendOrderEmails(order, s);
  } catch (e) {
    console.error("[checkout] order e-mails failed", e);
  }
  return { ok: true, order };
}
