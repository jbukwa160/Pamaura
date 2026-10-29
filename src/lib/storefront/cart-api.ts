// Shopify AJAX Cart API: /cart.js, /cart/add, /cart/change, /cart/update, /cart/clear, permalinks.
import { CART_COOKIE, CartError, addItem, changeItem, priceCart, saveCart, updateItems, type PricedLine } from "../cart";
import { discountApplicationJson, type AutoResult } from "../auto-discounts";
import { escapeHtml } from "../mail";
import { DropFactory, mediaJson, type ProductDrop } from "../liquid/drops/catalog";
import { cdnFileUrl } from "../liquid/drops/base";
import { createEnv, renderSectionById } from "../liquid/render";
import { RFloat } from "../liquid/rnum";
import { shopifyJson } from "../liquid/json";
import { localePath } from "../liquid/state";
import { parseBody } from "./body";
import { cookie, type StoreRequest } from "./context";
import { shippingRatesForCart } from "../shipping/rates";

const JSON_TYPE = "application/json; charset=utf-8";

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(shopifyJson(data), { status, headers: { "Content-Type": JSON_TYPE, ...headers } });
}

function lineJson(sr: StoreRequest, f: DropFactory, l: PricedLine, auto: AutoResult | null) {
  const s = sr.state;
  const p = f.product(l.product.id) as ProductDrop;
  const v = p.variantDrop(l.variant);
  const img = v.image || p.featured_image;
  const imgUrl = img ? "https:" + cdnFileUrl(s, img.r.name, img.r.version, img.r.folder) : null;
  const def = p.has_only_default_variant;
  return {
    id: l.variant.id,
    properties: l.item.properties,
    quantity: l.item.quantity,
    variant_id: l.variant.id,
    key: l.item.key,
    title: def ? p.title : `${p.title} - ${v.title}`,
    price: l.price,
    original_price: l.price,
    presentment_price: l.price / 100 === Math.floor(l.price / 100) ? new RFloat(l.price / 100) : l.price / 100,
    // a cart-level discount ("Bundle & Save") lowers line_price / discounted_price, not final_line_price
    discounted_price: l.price - Math.round(l.cart_discount / l.item.quantity),
    line_price: l.line_price - l.cart_discount,
    original_line_price: l.line_price,
    total_discount: l.cart_discount,
    discounts: auto && l.cart_discount ? [{ amount: l.cart_discount, title: escapeHtml(auto.discount.title) }] : [],
    sku: l.variant.sku || null,
    grams: l.variant.weight,
    vendor: l.product.vendor,
    taxable: l.variant.taxable,
    product_id: l.product.id,
    product_has_only_default_variant: def,
    gift_card: false,
    final_price: l.price,
    final_line_price: l.line_price,
    url: `${p.url}?variant=${l.variant.id}`,
    featured_image: img ? { aspect_ratio: img.aspect_ratio, alt: img.alt || p.title, height: img.height, url: imgUrl, width: img.width } : null,
    image: imgUrl,
    handle: p.handle,
    requires_shipping: l.variant.requires_shipping,
    product_type: p.type,
    product_title: p.title,
    product_description: p.description,
    variant_title: def ? null : v.title,
    variant_options: v.options,
    options_with_values: p.options.map((name, i) => ({ name, value: v.options[i] })),
    line_level_discount_allocations: [],
    line_level_total_discount: 0,
    quantity_rule: { min: 1, max: null, increment: 1 },
    has_components: false,
  };
}

export function cartJson(sr: StoreRequest) {
  const s = sr.state;
  const f = new DropFactory(s);
  const pc = priceCart(s.cart, s.market, s.catalog);
  return {
    token: s.cart.token,
    note: s.cart.note,
    attributes: s.cart.attributes,
    original_total_price: pc.original_total_price,
    total_price: pc.total_price,
    total_discount: pc.total_discount,
    total_weight: new RFloat(pc.total_weight),
    item_count: pc.item_count,
    items: pc.lines.map((l) => lineJson(sr, f, l, pc.auto)),
    requires_shipping: pc.requires_shipping,
    currency: s.market.currency,
    items_subtotal_price: pc.original_total_price,
    cart_level_discount_applications: pc.auto ? [discountApplicationJson(pc.auto)] : [],
    discount_codes: [],
  };
}

function persist(sr: StoreRequest) {
  sr.state.cart.market = sr.state.market.handle;
  const wasNew = sr.state.cart.transient;
  saveCart(sr.state.cart);
  if (wasNew || sr.cookies[CART_COOKIE] !== sr.state.cart.token) {
    sr.setCookies.push(cookie(CART_COOKIE, sr.state.cart.token, { maxAge: 14 * 86400, secure: sr.secure }));
  }
}

function errorJson(e: unknown) {
  if (e instanceof CartError) return json({ status: e.status, message: e.messageText, description: e.description }, e.status);
  console.error("[cart]", e);
  return json({ status: 500, message: "Cart Error", description: "Something went wrong" }, 500);
}

async function sectionsFor(sr: StoreRequest, sections: unknown): Promise<Record<string, string | null> | undefined> {
  if (!sections) return undefined;
  const ids = (Array.isArray(sections) ? sections : String(sections).split(","))
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, 5);
  if (!ids.length) return undefined;
  const env = createEnv(sr.state, {}, { pageTitle: "", pageDescription: null, canonicalUrl: "" });
  const out: Record<string, string | null> = {};
  for (const id of ids) out[id] = await renderSectionById(env, id, "cart", null);
  return out;
}

function propsOf(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = String(x);
  return out;
}

export async function handleCartApi(sr: StoreRequest, sub: string, isJs: boolean): Promise<Response> {
  const req = sr.req;
  const s = sr.state;
  const L = s.locale;
  const redirectCart = () => new Response(null, { status: 302, headers: { Location: localePath(s, "/cart") } });

  if (sub === "" && (req.method === "GET" || req.method === "HEAD")) return json(cartJson(sr));

  if (sub === "shipping_rates") {
    const rates = shippingRatesForCart(s);
    return json({ shipping_rates: rates });
  }
  if (sub === "prepare_shipping_rates") return json(null);
  if (sub === "async_shipping_rates") return json({ shipping_rates: shippingRatesForCart(s) });

  if (req.method !== "POST") return json({ status: 405, message: "Method not allowed", description: "" }, 405);
  const body = await parseBody(req);

  try {
    switch (sub) {
      case "add": {
        const items: { id: unknown; quantity?: unknown; properties?: unknown }[] = Array.isArray(body.items)
          ? (body.items as { id: unknown }[])
          : body.items && typeof body.items === "object"
            ? Object.values(body.items as Record<string, { id: unknown }>)
            : [{ id: body.id, quantity: body.quantity, properties: body.properties }];
        const added = [];
        for (const it of items) {
          const id = Number(it.id);
          if (!id) throw new CartError(422, L === "ro" ? "Parametrul id lipsește" : L === "bg" ? "Липсва параметър id" : "Parameter Missing or Invalid: Required parameter missing or invalid: items");
          added.push(addItem(s.cart, id, Number(it.quantity || 1), propsOf(it.properties), L));
        }
        persist(sr);
        if (!isJs) return redirectCart();
        const cj = cartJson(sr);
        const lines = added.map((a) => cj.items.find((x) => x.key === a.key)).filter(Boolean);
        const out: Record<string, unknown> = Array.isArray(body.items) || (body.items && typeof body.items === "object") ? { items: lines } : { ...lines[0] };
        const secs = await sectionsFor(sr, body.sections);
        if (secs) out.sections = secs;
        return json(out);
      }
      case "change": {
        changeItem(s.cart, { id: body.id as string | number | undefined, line: body.line ? Number(body.line) : undefined, quantity: Number(body.quantity ?? 0), properties: body.properties ? propsOf(body.properties) : undefined }, L);
        persist(sr);
        if (!isJs) return redirectCart();
        const out: Record<string, unknown> = cartJson(sr);
        const secs = await sectionsFor(sr, body.sections);
        if (secs) out.sections = secs;
        return json(out);
      }
      case "update": {
        if (body.updates) {
          const u = body.updates as Record<string, number> | number[];
          updateItems(s.cart, Array.isArray(u) ? u.map(Number) : Object.fromEntries(Object.entries(u).map(([k, v]) => [k, Number(v)])), L);
        }
        if (body.note !== undefined) s.cart.note = String(body.note).slice(0, 5000);
        if (body.attributes && typeof body.attributes === "object") {
          for (const [k, v] of Object.entries(body.attributes as Record<string, unknown>)) {
            if (v === "" || v === null) delete s.cart.attributes[k];
            else s.cart.attributes[k] = String(v);
          }
        }
        persist(sr);
        if (!isJs) {
          if (body.checkout !== undefined) return new Response(null, { status: 302, headers: { Location: `/checkouts/${s.cart.token}?locale=${s.market.path}` } });
          return redirectCart();
        }
        const out: Record<string, unknown> = cartJson(sr);
        const secs = await sectionsFor(sr, body.sections);
        if (secs) out.sections = secs;
        return json(out);
      }
      case "clear": {
        s.cart.items = [];
        s.cart.note = null;
        s.cart.attributes = {};
        persist(sr);
        if (!isJs) return redirectCart();
        return json(cartJson(sr));
      }
      default:
        return json({ status: 404, message: "Not Found", description: "" }, 404);
    }
  } catch (e) {
    if (!isJs && e instanceof CartError) return redirectCart();
    return errorJson(e);
  }
}

/** /cart/<variant>:<qty>,<variant>:<qty> → a fresh cart with those lines, then checkout. */
export function handlePermalink(sr: StoreRequest, spec: string): Response {
  const s = sr.state;
  s.cart.items = [];
  for (const part of spec.split(",")) {
    const [vid, qty] = part.split(":");
    try {
      addItem(s.cart, Number(vid), Number(qty || 1), {}, s.locale);
    } catch {
      /* skip unavailable */
    }
  }
  persist(sr);
  return new Response(null, { status: 302, headers: { Location: s.cart.items.length ? `/checkouts/${s.cart.token}?locale=${s.market.path}` : localePath(s, "/cart") } });
}

export { mediaJson };
