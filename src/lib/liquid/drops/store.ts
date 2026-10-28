// shop, request, routes, localization, cart, line items, customer, addresses, orders.
import { priceCart, type PricedLine } from "../../cart";
import { convertAmount, type Market } from "../../catalog";
import { addresses as customerAddresses, type AddressRec } from "../../customers";
import { getDb } from "../../db";
import { listCustomerOrders, type OrderRec, type OrderLineRec } from "../../orders";
import { localePath, type RenderState } from "../state";
import { ImageDrop, SDrop, cdnFileUrl } from "./base";
import { translateOptionValue, type DropFactory, type ProductDrop, type VariantDrop } from "./catalog";

export class CurrencyDrop extends SDrop {
  declare r: { iso_code: string; symbol: string; name: string };
  constructor(m: Market) {
    super({ iso_code: m.currency, symbol: m.currency_symbol, name: m.currency });
  }
  get iso_code() {
    return this.r.iso_code;
  }
  get symbol() {
    return this.r.symbol;
  }
  get name() {
    return this.r.name;
  }
  valueOf() {
    return this.r.iso_code;
  }
}

export class ShopDrop extends SDrop {
  constructor(private s: RenderState, private f: DropFactory) {
    super({ name: s.catalog.shop.name });
  }
  private get shop() {
    return this.s.catalog.shop;
  }
  get name() {
    return this.shop.name;
  }
  get email() {
    return this.shop.email;
  }
  get phone() {
    return this.shop.phone;
  }
  get description() {
    return this.shop.description;
  }
  get domain() {
    return this.shop.domain;
  }
  get url() {
    return this.s.origin;
  }
  get secure_url() {
    return this.s.origin.replace(/^http:/, "https:");
  }
  get permanent_domain() {
    return this.shop.myshopify_domain;
  }
  get currency() {
    return this.shop.currency;
  }
  get money_format() {
    return this.s.market.money_format;
  }
  get money_with_currency_format() {
    return this.s.market.money_with_currency_format;
  }
  get locale() {
    return this.s.locale;
  }
  get id() {
    return 64072614067;
  }
  get address() {
    const a = this.shop.address;
    return { street: a.street, city: a.city, zip: a.zip, province: a.province, country: a.country, company: a.company, summary: [a.street, a.city, a.country].filter(Boolean).join(", ") };
  }
  get customer_accounts_enabled() {
    return this.shop.customer_accounts_enabled;
  }
  get customer_accounts_optional() {
    return true;
  }
  get checkout() {
    return { guest_login: false };
  }
  get taxes_included() {
    return this.shop.taxes_included;
  }
  get enabled_payment_types() {
    return [];
  }
  get password_message() {
    return this.shop.password_message;
  }
  get products_count() {
    return this.s.catalog.products.filter((p) => p.status === "active").length;
  }
  get collections_count() {
    return this.s.catalog.collections.filter((c) => c.published).length;
  }
  get types() {
    return [...new Set(this.s.catalog.products.map((p) => p.product_type).filter(Boolean))].sort();
  }
  get vendors() {
    return [...new Set(this.s.catalog.products.map((p) => p.vendor).filter(Boolean))].sort();
  }
  /** Shopify store policies are not used by this shop (the legal texts are pages). */
  get shipping_policy() {
    return null;
  }
  get privacy_policy() {
    return null;
  }
  get refund_policy() {
    return null;
  }
  get terms_of_service() {
    return null;
  }
  get policies() {
    return [];
  }
  get published_locales() {
    return this.s.catalog.markets.filter((m) => m.enabled).map((m) => new ShopLocaleDrop(this.s, m));
  }
  get metafields() {
    return this.f.metafields("shop", 0);
  }
  get brand() {
    return null;
  }
}

export class ShopLocaleDrop extends SDrop {
  constructor(private s: RenderState, private m: Market) {
    super({ iso_code: m.language });
  }
  get iso_code() {
    return this.m.language;
  }
  get name() {
    return this.m.language_name;
  }
  get endonym_name() {
    return this.m.language_name;
  }
  get primary() {
    return this.m.primary;
  }
  get root_url() {
    return "/" + this.m.path;
  }
  valueOf() {
    return this.m.language;
  }
}

export class RequestDrop extends SDrop {
  constructor(private s: RenderState) {
    super({ path: s.fullPath });
  }
  get host() {
    return this.s.host;
  }
  get origin() {
    return this.s.origin;
  }
  get path() {
    return this.s.fullPath;
  }
  get page_type() {
    return this.s.pageType;
  }
  get design_mode() {
    return false;
  }
  get visual_preview_mode() {
    return false;
  }
  get locale() {
    return new ShopLocaleDrop(this.s, this.s.market);
  }
}

export class RoutesDrop extends SDrop {
  constructor(private s: RenderState) {
    super({ root: s.market.path });
  }
  private p(x: string) {
    return localePath(this.s, x);
  }
  get root_url() {
    return this.p("/");
  }
  get account_url() {
    return this.p("/account");
  }
  get account_login_url() {
    return this.p("/account/login");
  }
  get account_logout_url() {
    return this.p("/account/logout");
  }
  get account_register_url() {
    return this.p("/account/register");
  }
  get account_addresses_url() {
    return this.p("/account/addresses");
  }
  get account_recover_url() {
    return this.p("/account/recover");
  }
  get collections_url() {
    return this.p("/collections");
  }
  get all_products_collection_url() {
    return this.p("/collections/all");
  }
  get search_url() {
    return this.p("/search");
  }
  get predictive_search_url() {
    return this.p("/search/suggest");
  }
  get cart_url() {
    return this.p("/cart");
  }
  get cart_add_url() {
    return this.p("/cart/add");
  }
  get cart_change_url() {
    return this.p("/cart/change");
  }
  get cart_clear_url() {
    return this.p("/cart/clear");
  }
  get cart_update_url() {
    return this.p("/cart/update");
  }
  get product_recommendations_url() {
    return this.p("/recommendations/products");
  }
  get storefront_login_url() {
    return this.p("/storefront/login");
  }
}

export class CountryDrop extends SDrop {
  constructor(private s: RenderState, private m: Market) {
    super({ iso_code: m.country });
  }
  get iso_code() {
    return this.m.country;
  }
  get name() {
    return this.m.country_name;
  }
  get currency() {
    return new CurrencyDrop(this.m);
  }
  get unit_system() {
    return "metric";
  }
  get market() {
    return { handle: this.m.handle, id: this.m.handle };
  }
  get available_languages() {
    return [new ShopLocaleDrop(this.s, this.m)];
  }
  get continent() {
    return "Europe";
  }
  get popular() {
    return false;
  }
  valueOf() {
    return this.m.country_name;
  }
}

export class LocalizationDrop extends SDrop {
  constructor(private s: RenderState) {
    super({ market: s.market.handle });
  }
  private markets() {
    return this.s.catalog.markets.filter((m) => m.enabled);
  }
  get available_countries() {
    return this.markets().map((m) => new CountryDrop(this.s, m));
  }
  get available_languages() {
    // Languages offered for the current country (each market has one language here).
    return [new ShopLocaleDrop(this.s, this.s.market)];
  }
  get country() {
    return new CountryDrop(this.s, this.s.market);
  }
  get language() {
    return new ShopLocaleDrop(this.s, this.s.market);
  }
  get market() {
    return { handle: this.s.market.handle, id: this.s.market.handle, metafields: {} };
  }
}

// ---------------------------------------------------------------------------------------------
// Cart

export class LineItemDrop extends SDrop {
  declare r: PricedLine;
  constructor(private f: DropFactory, line: PricedLine) {
    super(line);
  }
  private get s() {
    return this.f.s;
  }
  private get pd(): ProductDrop {
    return this.f.product(this.r.product.id)!;
  }
  private get vd(): VariantDrop {
    return this.f.variant(this.r.variant.id)!;
  }
  get id() {
    return this.r.variant.id;
  }
  get key() {
    return this.r.item.key;
  }
  get product() {
    return this.pd;
  }
  get product_id() {
    return this.r.product.id;
  }
  get variant() {
    return this.vd;
  }
  get variant_id() {
    return this.r.variant.id;
  }
  get title() {
    const p = this.pd;
    return p.has_only_default_variant ? p.title : `${p.title} - ${this.vd.title}`;
  }
  get quantity() {
    return this.r.item.quantity;
  }
  get price() {
    return this.r.price;
  }
  get final_price() {
    return this.r.price;
  }
  get original_price() {
    return this.r.price;
  }
  get line_price() {
    return this.r.line_price;
  }
  get final_line_price() {
    return this.r.line_price;
  }
  get original_line_price() {
    return this.r.line_price;
  }
  get total_discount() {
    return 0;
  }
  get discounts() {
    return [];
  }
  get line_level_discount_allocations() {
    return [];
  }
  get line_level_total_discount() {
    return 0;
  }
  get url() {
    return `${this.pd.url}?variant=${this.r.variant.id}`;
  }
  get image() {
    return this.vd.image || this.pd.featured_image;
  }
  get featured_image() {
    return this.image;
  }
  get featured_media() {
    return this.vd.featured_media || this.pd.featured_media;
  }
  get media() {
    return this.pd.media;
  }
  get properties() {
    return this.r.item.properties;
  }
  get options_with_values() {
    const p = this.r.product;
    if (this.pd.has_only_default_variant) return [];
    return p.options.map((o, i) => ({
      name: this.pd.options[i],
      value: translateOptionValue(this.s, p, i, (this.r.variant as unknown as Record<string, string>)[`option${i + 1}`]),
    }));
  }
  get gift_card() {
    return false;
  }
  get requires_shipping() {
    return this.r.variant.requires_shipping;
  }
  get taxable() {
    return this.r.variant.taxable;
  }
  get sku() {
    return this.r.variant.sku;
  }
  get vendor() {
    return this.r.product.vendor;
  }
  get grams() {
    return this.r.variant.weight;
  }
  get unit_price() {
    return null;
  }
  get unit_price_measurement() {
    return null;
  }
  get selling_plan_allocation() {
    return null;
  }
  get item_components() {
    return [];
  }
  get has_components() {
    return false;
  }
  get message() {
    return "";
  }
  get url_to_remove() {
    return localePath(this.s, `/cart/change?id=${encodeURIComponent(this.r.item.key)}&quantity=0`);
  }
  get price_varies() {
    return false;
  }
  get selected_or_first_available_variant() {
    return this.vd;
  }
  get fulfillment() {
    return null;
  }
  get successfully_fulfilled_quantity() {
    return 0;
  }
}

export class CartDrop extends SDrop {
  private priced: ReturnType<typeof priceCart> | null = null;
  constructor(private f: DropFactory) {
    super({ token: f.s.cart.token });
  }
  private get s() {
    return this.f.s;
  }
  private pc() {
    if (!this.priced) this.priced = priceCart(this.s.cart, this.s.market, this.s.catalog);
    return this.priced;
  }
  get items() {
    return this.pc().lines.map((l) => new LineItemDrop(this.f, l));
  }
  get item_count() {
    return this.pc().item_count;
  }
  get items_count() {
    return this.pc().item_count;
  }
  get total_price() {
    return this.pc().total_price;
  }
  get original_total_price() {
    return this.pc().original_total_price;
  }
  get items_subtotal_price() {
    return this.pc().total_price;
  }
  get total_discount() {
    return 0;
  }
  get total_weight() {
    return this.pc().total_weight;
  }
  get checkout_charge_amount() {
    return this.pc().total_price;
  }
  get requires_shipping() {
    return this.pc().requires_shipping;
  }
  get note() {
    return this.s.cart.note;
  }
  get attributes() {
    return this.s.cart.attributes;
  }
  get currency() {
    return new CurrencyDrop(this.s.market);
  }
  get taxes_included() {
    return this.s.catalog.shop.taxes_included;
  }
  get duties_included() {
    return false;
  }
  get cart_level_discount_applications() {
    return [];
  }
  get discount_applications() {
    return [];
  }
  get empty() {
    return this.pc().item_count === 0;
  }
  get token() {
    return this.s.cart.token;
  }
}

// ---------------------------------------------------------------------------------------------
// Customer & orders

export class AddressDrop extends SDrop {
  declare r: Partial<AddressRec> & { name?: string };
  constructor(a: Partial<AddressRec> & { name?: string }) {
    super(a);
  }
  get id() {
    return this.r.id ?? null;
  }
  get first_name() {
    return this.r.first_name ?? "";
  }
  get last_name() {
    return this.r.last_name ?? "";
  }
  get name() {
    return this.r.name ?? [this.r.first_name, this.r.last_name].filter(Boolean).join(" ");
  }
  get company() {
    return this.r.company ?? "";
  }
  get address1() {
    return this.r.address1 ?? "";
  }
  get address2() {
    return this.r.address2 ?? "";
  }
  get street() {
    return [this.r.address1, this.r.address2].filter(Boolean).join(", ");
  }
  get city() {
    return this.r.city ?? "";
  }
  get province() {
    return this.r.province ?? "";
  }
  get province_code() {
    return this.r.province_code ?? "";
  }
  get country() {
    return this.r.country ?? "";
  }
  get country_code() {
    return this.r.country_code ?? "";
  }
  get zip() {
    return this.r.zip ?? "";
  }
  get phone() {
    return this.r.phone ?? "";
  }
  get summary() {
    return [this.street, this.city, this.zip, this.country].filter(Boolean).join(", ");
  }
  get url() {
    return this.r.id ? `/account/addresses/${this.r.id}` : "";
  }
}

export class CustomerDrop extends SDrop {
  constructor(private s: RenderState, private f: DropFactory) {
    super({ id: s.customer!.id });
  }
  private get c() {
    return this.s.customer!;
  }
  get id() {
    return this.c.id;
  }
  get email() {
    return this.c.email;
  }
  get first_name() {
    return this.c.first_name;
  }
  get last_name() {
    return this.c.last_name;
  }
  get name() {
    return [this.c.first_name, this.c.last_name].filter(Boolean).join(" ") || this.c.email;
  }
  get phone() {
    return this.c.phone;
  }
  get accepts_marketing() {
    return !!this.c.accepts_marketing;
  }
  get tags() {
    return JSON.parse(this.c.tags || "[]");
  }
  get has_account() {
    return !!this.c.password_hash;
  }
  get addresses() {
    return customerAddresses(this.c.id).map((a) => new AddressDrop(a));
  }
  get addresses_count() {
    return customerAddresses(this.c.id).length;
  }
  get default_address() {
    const a = customerAddresses(this.c.id)[0];
    return a ? new AddressDrop(a) : null;
  }
  get new_address() {
    return new AddressDrop({});
  }
  private allOrders() {
    return listCustomerOrders(this.c.id).map((o) => new OrderDrop(this.s, this.f, o));
  }
  get orders() {
    return this.allOrders();
  }
  get orders_count() {
    return this.allOrders().length;
  }
  get last_order() {
    return this.allOrders()[0] ?? null;
  }
  get total_spent() {
    return listCustomerOrders(this.c.id)
      .filter((o) => o.status !== "cancelled")
      .reduce((n, o) => n + o.total, 0);
  }
}

const FIN: Record<string, Record<string, string>> = {
  bg: { pending: "Изчакващо", paid: "Платено", refunded: "Възстановено", voided: "Анулирано" },
  ro: { pending: "În așteptare", paid: "Plătită", refunded: "Rambursată", voided: "Anulată" },
};
const FUL: Record<string, Record<string, string>> = {
  bg: { unfulfilled: "Неизпълнено", fulfilled: "Изпълнено" },
  ro: { unfulfilled: "Neexpediată", fulfilled: "Expediată" },
};

export class OrderDrop extends SDrop {
  declare r: OrderRec;
  constructor(private s: RenderState, private f: DropFactory, o: OrderRec) {
    super(o);
  }
  private lines(): OrderLineRec[] {
    return getDb().prepare("SELECT * FROM order_lines WHERE order_id = ? ORDER BY id").all(this.r.id) as OrderLineRec[];
  }
  get id() {
    return this.r.id;
  }
  get name() {
    return `#${this.r.number}`;
  }
  get order_number() {
    return this.r.number;
  }
  get created_at() {
    return this.r.created_at;
  }
  get email() {
    return this.r.email;
  }
  get phone() {
    return this.r.phone;
  }
  get currency() {
    return this.r.currency;
  }
  get customer_url() {
    return localePath(this.s, `/account/orders/${this.r.token}`);
  }
  get order_status_url() {
    return localePath(this.s, `/orders/${this.r.token}`);
  }
  get financial_status() {
    return this.r.financial_status;
  }
  get financial_status_label() {
    return FIN[this.s.locale]?.[this.r.financial_status] ?? this.r.financial_status;
  }
  get fulfillment_status() {
    return this.r.fulfillment_status;
  }
  get fulfillment_status_label() {
    return FUL[this.s.locale]?.[this.r.fulfillment_status] ?? this.r.fulfillment_status;
  }
  get cancelled() {
    return this.r.status === "cancelled";
  }
  get cancelled_at() {
    return this.r.cancelled_at;
  }
  get cancel_reason() {
    return this.r.cancel_reason;
  }
  get cancel_reason_label() {
    return this.r.cancel_reason;
  }
  get note() {
    return this.r.note;
  }
  get total_price() {
    return this.r.total;
  }
  get subtotal_price() {
    return this.r.subtotal - this.r.discount_total;
  }
  get line_items_subtotal_price() {
    return this.r.subtotal;
  }
  get total_discounts() {
    return this.r.discount_total;
  }
  get shipping_price() {
    return this.r.shipping_total + this.r.cod_fee;
  }
  get tax_price() {
    return this.r.tax_total;
  }
  get tax_lines() {
    return this.r.tax_total ? [{ title: "ДДС", price: this.r.tax_total, rate: 0.2, rate_percentage: 20 }] : [];
  }
  get shipping_methods() {
    return [{ title: this.r.shipping_title, price: this.r.shipping_total + this.r.cod_fee, original_price: this.r.shipping_total + this.r.cod_fee }];
  }
  get cart_level_discount_applications() {
    return this.r.discount_total ? [{ title: this.r.discount_code, total_allocated_amount: this.r.discount_total, type: "discount_code", value_type: "percentage" }] : [];
  }
  get discount_applications() {
    return this.cart_level_discount_applications;
  }
  get shipping_address() {
    const a = JSON.parse(this.r.shipping_address || "{}");
    return new AddressDrop(a);
  }
  get billing_address() {
    const a = JSON.parse(this.r.billing_address || this.r.shipping_address || "{}");
    return new AddressDrop(a);
  }
  get line_items() {
    return this.lines().map((l) => new OrderLineDrop(this.s, this.f, l));
  }
  get item_count() {
    return this.lines().reduce((n, l) => n + l.quantity, 0);
  }
  get tags() {
    return [];
  }
}

export class OrderLineDrop extends SDrop {
  declare r: OrderLineRec;
  constructor(private s: RenderState, private f: DropFactory, l: OrderLineRec) {
    super(l);
  }
  get id() {
    return this.r.id;
  }
  get title() {
    return this.r.variant_title && this.r.variant_title !== "Default Title" ? `${this.r.title} - ${this.r.variant_title}` : this.r.title;
  }
  get quantity() {
    return this.r.quantity;
  }
  get sku() {
    return this.r.sku;
  }
  get price() {
    return this.r.price;
  }
  get final_price() {
    return this.r.price;
  }
  get original_price() {
    return this.r.original_price;
  }
  get final_line_price() {
    return this.r.price * this.r.quantity;
  }
  get original_line_price() {
    return this.r.original_price * this.r.quantity;
  }
  get line_price() {
    return this.r.price * this.r.quantity;
  }
  get line_level_discount_allocations() {
    return [];
  }
  get properties() {
    return JSON.parse(this.r.properties || "{}");
  }
  get selling_plan_allocation() {
    return null;
  }
  get unit_price() {
    return null;
  }
  get unit_price_measurement() {
    return null;
  }
  get fulfillment() {
    return null;
  }
  get image() {
    return ImageDrop.fromName(this.s, this.r.image);
  }
  get product() {
    return this.r.product_id ? this.f.product(this.r.product_id) : null;
  }
  get variant() {
    return this.r.variant_id ? this.f.variant(this.r.variant_id) : null;
  }
  get url() {
    return this.r.handle ? localePath(this.s, `/products/${this.r.handle}`) : null;
  }
}

export function moneyAmountInMarket(cents: number, m: Market) {
  return convertAmount(cents, m);
}

export { cdnFileUrl };
