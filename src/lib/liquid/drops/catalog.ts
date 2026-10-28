// Shopify catalog objects: product, variant, options, collection, page, blog, article, linklists.
import type { Article, Blog, Collection, Media, MenuItem, Page, Product, Variant } from "../../catalog";
import { isPublished, marketPrice } from "../../catalog";
import { RFloat } from "../rnum";
import { localePath, tr, type RenderState } from "../state";
import { ImageDrop, MediaDrop, MetafieldsDrop, MetaobjectDrop, SDrop, cdnFileUrl, mediaDrop, productAlt, videoFromFile, type RefResolver } from "./base";
import { applyFilters, buildFilters, sortProducts, type FilterSpec } from "../../collections";
import { SORT_VALUES, shopifyText } from "../../shopify-i18n";
import { toValue } from "liquidjs";

// ---------------------------------------------------------------------------------------------
// Drop cache per request so identity (and selected state) is stable

export class DropFactory implements RefResolver {
  private products = new Map<number, ProductDrop>();
  private collections = new Map<number, CollectionDrop>();
  constructor(public s: RenderState) {}
  product(id: number): ProductDrop | null {
    const hit = this.products.get(id);
    if (hit) return hit;
    const p = this.s.catalog.productById.get(id);
    if (!p) return null;
    const d = new ProductDrop(this, p);
    this.products.set(id, d);
    return d;
  }
  productByHandle(handle: string): ProductDrop | null {
    const p = this.s.catalog.productByHandle.get(String(handle));
    if (!p || !isPublished(p)) return null;
    return this.product(p.id);
  }
  variant(id: number): VariantDrop | null {
    const v = this.s.catalog.variantById.get(id);
    if (!v) return null;
    const p = this.product(v.product_id);
    return p ? p.variantDrop(v) : null;
  }
  collection(id: number): CollectionDrop | null {
    const hit = this.collections.get(id);
    if (hit) return hit;
    const c = this.s.catalog.collectionById.get(id);
    if (!c) return null;
    const d = new CollectionDrop(this, c);
    this.collections.set(id, d);
    return d;
  }
  collectionByHandle(handle: string): CollectionDrop | null {
    const c = this.s.catalog.collectionByHandle.get(String(handle));
    if (!c || !c.published) return null;
    return this.collection(c.id);
  }
  page(id: number): PageDrop | null {
    const p = this.s.catalog.pageById.get(id);
    return p && p.published ? new PageDrop(this, p) : null;
  }
  pageByHandle(handle: string): PageDrop | null {
    const p = this.s.catalog.pageByHandle.get(String(handle));
    return p && p.published ? new PageDrop(this, p) : null;
  }
  blogByHandle(handle: string): BlogDrop | null {
    const b = this.s.catalog.blogByHandle.get(String(handle));
    return b ? new BlogDrop(this, b) : null;
  }
  article(id: number): ArticleDrop | null {
    const a = this.s.catalog.articleById.get(id);
    return a && a.published ? new ArticleDrop(this, a) : null;
  }
  file(name: string): ImageDrop | MediaDrop | null {
    const f = this.s.catalog.files.get(name);
    if (f?.meta?.sources?.length) return videoFromFile(this.s, f);
    return ImageDrop.fromName(this.s, name);
  }
  metaobject(id: number): MetaobjectDrop | null {
    const mo = this.s.catalog.metaobjects.get(id);
    return mo ? new MetaobjectDrop(this.s, mo, this) : null;
  }
  metafields(ownerType: string, ownerId: number | string) {
    return new MetafieldsDrop(this.s, ownerType, ownerId, this);
  }
}

// ---------------------------------------------------------------------------------------------
// Product

export class ProductDrop extends SDrop {
  declare r: Product;
  private variantDrops = new Map<number, VariantDrop>();
  /** Set while rendering a product in a collection context (collection product URL / navigation). */
  constructor(public f: DropFactory, p: Product) {
    super(p);
  }
  private get s() {
    return this.f.s;
  }
  variantDrop(v: Variant): VariantDrop {
    let d = this.variantDrops.get(v.id);
    if (!d) {
      d = new VariantDrop(this, v);
      this.variantDrops.set(v.id, d);
    }
    return d;
  }
  get id() {
    return this.r.id;
  }
  get object_type() {
    return "product";
  }
  get handle() {
    return this.r.handle;
  }
  get title() {
    return tr(this.s, "product", this.r.id, "title", this.r.title);
  }
  get description() {
    return tr(this.s, "product", this.r.id, "body_html", this.r.body_html);
  }
  get content() {
    return this.description;
  }
  get vendor() {
    return this.r.vendor;
  }
  get type() {
    return tr(this.s, "product", this.r.id, "product_type", this.r.product_type);
  }
  get tags() {
    return this.r.tags;
  }
  get url() {
    return localePath(this.s, `/products/${enc(this.r.handle)}`);
  }
  get template_suffix() {
    return this.r.template_suffix;
  }
  get published_at() {
    return this.r.published_at;
  }
  get created_at() {
    return this.r.created_at;
  }
  get updated_at() {
    return this.r.updated_at;
  }
  get gift_card() {
    return this.r.gift_card;
  }
  get requires_selling_plan() {
    return false;
  }
  get selling_plan_groups() {
    return [];
  }
  get selected_selling_plan() {
    return null;
  }
  get selected_selling_plan_allocation() {
    return null;
  }
  get selected_or_first_available_selling_plan_allocation() {
    return null;
  }
  get quantity_price_breaks_configured() {
    return false;
  }
  get metafields() {
    return this.f.metafields("product", this.r.id);
  }
  get variants() {
    return this.r.variants.map((v) => this.variantDrop(v));
  }
  get variants_count() {
    return this.r.variants.length;
  }
  get available() {
    return this.r.variants.some((v) => variantAvailable(v));
  }
  get has_only_default_variant() {
    const v = this.r.variants;
    return v.length === 1 && (v[0].title === "Default Title" || (this.r.options.length === 1 && this.r.options[0].name === "Title" && v[0].option1 === "Default Title"));
  }
  private prices() {
    return this.r.variants.map((v) => marketPrice(v, this.s.market));
  }
  get price() {
    return this.price_min;
  }
  get price_min() {
    const p = this.prices().map((x) => x.price);
    return p.length ? Math.min(...p) : 0;
  }
  get price_max() {
    const p = this.prices().map((x) => x.price);
    return p.length ? Math.max(...p) : 0;
  }
  get price_varies() {
    return this.price_min !== this.price_max;
  }
  // like Shopify: variants without a compare-at price are left out of min / max
  private compares() {
    return this.prices().map((x) => x.compare_at_price ?? 0).filter((c) => c > 0);
  }
  get compare_at_price() {
    const c = this.compare_at_price_min;
    return c || null;
  }
  get compare_at_price_min() {
    const c = this.compares();
    return c.length ? Math.min(...c) : 0;
  }
  get compare_at_price_max() {
    const c = this.compares();
    return c.length ? Math.max(...c) : 0;
  }
  get compare_at_price_varies() {
    return this.compare_at_price_min !== this.compare_at_price_max;
  }
  /** Variant chosen by ?variant= on this product's own page. */
  get selected_variant() {
    const s = this.s;
    if (s.pageType !== "product") return null;
    const id = Number(s.query.get("variant"));
    if (!id) return null;
    const v = this.r.variants.find((x) => x.id === id);
    return v ? this.variantDrop(v) : null;
  }
  get first_available_variant() {
    const v = this.r.variants.find((x) => variantAvailable(x)) || this.r.variants[0];
    return v ? this.variantDrop(v) : null;
  }
  get selected_or_first_available_variant() {
    return this.selected_variant || this.first_available_variant;
  }
  get options() {
    return this.r.options.map((o, i) => tr(this.s, "product", this.r.id, `option_name.${i}`, o.name));
  }
  get options_with_values() {
    return this.r.options.map((o, i) => new ProductOptionDrop(this, i));
  }
  get options_by_name() {
    const out: Record<string, ProductOptionDrop> = {};
    this.r.options.forEach((o, i) => {
      out[this.options[i]] = new ProductOptionDrop(this, i);
    });
    return out;
  }
  get images() {
    return this.r.media.filter((m) => m.media_type === "image").map((m) => productImage(this.s, m));
  }
  get featured_image() {
    const m = this.r.media.find((x) => x.media_type === "image") || this.r.media[0];
    if (!m) return null;
    return m.media_type === "image" ? productImage(this.s, m) : new MediaDrop(this.s, m).preview_image;
  }
  get media() {
    return this.r.media.map((m) => mediaDrop(this.s, m));
  }
  get featured_media() {
    return this.r.media.length ? mediaDrop(this.s, this.r.media[0]) : null;
  }
  get collections() {
    return this.s.catalog.collections
      .filter((c) => c.published && collectionProductIds(this.s, c).includes(this.r.id))
      .map((c) => this.f.collection(c.id));
  }
  get seo() {
    return { title: this.r.seo_title, description: this.r.seo_description };
  }
  /** `product | json` (close to /products/<handle>.js, see productJson) */
  toShopifyJSON() {
    return productJson(this.s, this, false);
  }
}

export function variantAvailable(v: Variant) {
  if (!v.inventory_management) return true;
  if (v.inventory_policy === "continue") return true;
  return v.inventory_quantity > 0;
}

function productImage(s: RenderState, m: Media): ImageDrop {
  return ImageDrop.fromName(s, m.file, {
    id: m.image_id,
    media_id: m.id,
    alt: productAlt(s, m),
    rawAlt: m.alt,
    position: m.position,
    product_id: m.product_id,
    variant_ids: m.variant_ids,
    width: m.width,
    height: m.height,
    productImage: true,
  }) as ImageDrop;
}

export class ProductOptionDrop extends SDrop {
  constructor(private p: ProductDrop, private index: number) {
    super({ index });
  }
  private get s() {
    return this.p.f.s;
  }
  get name() {
    return this.p.options[this.index];
  }
  get position() {
    return this.index + 1;
  }
  /** Translated values in the source order. */
  get values() {
    const opt = this.p.r.options[this.index];
    return opt.values.map((v) => new ProductOptionValueDrop(this.p, this.index, v));
  }
  get selected_value() {
    const v = this.p.selected_or_first_available_variant;
    if (!v) return null;
    return v.options[this.index] ?? null;
  }
  toShopifyJSON() {
    return { name: this.name, position: this.position, values: this.values.map((v) => v.name) };
  }
}

export function translateOptionValue(s: RenderState, p: Product, index: number, value: string): string {
  return tr(s, "product", p.id, `option_value.${index}.${value}`, value);
}

export class ProductOptionValueDrop extends SDrop {
  constructor(private p: ProductDrop, private index: number, private source: string) {
    super({ source });
  }
  get name() {
    return translateOptionValue(this.p.f.s, this.p.r, this.index, this.source);
  }
  get id() {
    return null;
  }
  get position() {
    return this.p.r.options[this.index].values.indexOf(this.source) + 1;
  }
  get selected() {
    const v = this.p.selected_or_first_available_variant;
    return !!v && v.r[`option${this.index + 1}` as "option1"] === this.source;
  }
  get available() {
    return this.p.r.variants.some((v) => v[`option${this.index + 1}` as "option1"] === this.source && variantAvailable(v));
  }
  get variant() {
    const v = this.p.r.variants.find((x) => x[`option${this.index + 1}` as "option1"] === this.source);
    return v ? this.p.variantDrop(v) : null;
  }
  get swatch() {
    return null;
  }
  get product_url() {
    return null;
  }
  valueOf() {
    return this.name;
  }
  toString() {
    return this.name;
  }
  toShopifyJSON() {
    return this.name;
  }
  equals(o: unknown) {
    return String(toValue(o)) === this.name;
  }
  gt() {
    return false;
  }
  geq(o: unknown) {
    return this.equals(o);
  }
  lt() {
    return false;
  }
  leq(o: unknown) {
    return this.equals(o);
  }
}

// ---------------------------------------------------------------------------------------------
// Variant

export class VariantDrop extends SDrop {
  declare r: Variant;
  constructor(public p: ProductDrop, v: Variant) {
    super(v);
  }
  private get s() {
    return this.p.f.s;
  }
  get id() {
    return this.r.id;
  }
  get product() {
    return this.p;
  }
  get options() {
    return [this.r.option1, this.r.option2, this.r.option3]
      .slice(0, Math.max(1, this.p.r.options.length))
      .map((v, i) => (v == null ? null : translateOptionValue(this.s, this.p.r, i, v)))
      .filter((v) => v !== null) as string[];
  }
  get option1() {
    return this.r.option1 == null ? null : translateOptionValue(this.s, this.p.r, 0, this.r.option1);
  }
  get option2() {
    return this.r.option2 == null ? null : translateOptionValue(this.s, this.p.r, 1, this.r.option2);
  }
  get option3() {
    return this.r.option3 == null ? null : translateOptionValue(this.s, this.p.r, 2, this.r.option3);
  }
  get title() {
    return this.options.join(" / ");
  }
  get sku() {
    return this.r.sku || null;
  }
  get barcode() {
    return this.r.barcode || null;
  }
  get price() {
    return marketPrice(this.r, this.s.market).price;
  }
  get compare_at_price() {
    return marketPrice(this.r, this.s.market).compare_at_price;
  }
  get available() {
    return variantAvailable(this.r);
  }
  get inventory_management() {
    return this.r.inventory_management;
  }
  get inventory_policy() {
    return this.r.inventory_policy;
  }
  get inventory_quantity() {
    return this.r.inventory_quantity;
  }
  get incoming() {
    return false;
  }
  get next_incoming_date() {
    return null;
  }
  get requires_shipping() {
    return this.r.requires_shipping;
  }
  get taxable() {
    return this.r.taxable;
  }
  get weight() {
    return this.r.weight;
  }
  get weight_unit() {
    return this.r.weight_unit;
  }
  get weight_in_unit() {
    const g = this.r.weight;
    const u = this.r.weight_unit;
    const n = u === "kg" ? g / 1000 : u === "lb" ? g / 453.59237 : u === "oz" ? g / 28.349523125 : g;
    return Number.isInteger(n) ? new RFloat(n) : n;
  }
  get image() {
    if (!this.r.image_id) return null;
    const m = this.p.r.media.find((x) => x.image_id === this.r.image_id);
    return m ? productImage(this.s, m) : null;
  }
  get featured_image() {
    return this.image;
  }
  get featured_media() {
    if (!this.r.image_id) return null;
    const m = this.p.r.media.find((x) => x.image_id === this.r.image_id);
    return m ? mediaDrop(this.s, m) : null;
  }
  get url() {
    return `${this.p.url}?variant=${this.r.id}`;
  }
  get selected() {
    return this.p.selected_variant?.id === this.r.id;
  }
  get matched() {
    return true;
  }
  get unit_price() {
    return null;
  }
  get unit_price_measurement() {
    return null;
  }
  get selling_plan_allocations() {
    return [];
  }
  get store_availabilities() {
    return [];
  }
  get quantity_rule() {
    return { min: 1, max: null, increment: 1 };
  }
  get quantity_price_breaks() {
    return [];
  }
  get metafields() {
    return this.p.f.metafields("variant", this.r.id);
  }
  get name() {
    return this.p.has_only_default_variant ? this.p.title : `${this.p.title} - ${this.title}`;
  }
  get public_title() {
    return this.p.has_only_default_variant ? null : this.title;
  }
  toShopifyJSON() {
    return variantJson(this.s, this, false);
  }
}

// ---------------------------------------------------------------------------------------------
// AJAX JSON (/products/<handle>.js) and `| json` in Liquid: the same objects, except that Liquid
// gives protocol-relative URLs, option names only, the video duration, `content` and no `url`.

function absoluteImg(s: RenderState, name: string | null, ajax = true): string | null {
  if (!name) return null;
  return (ajax ? "https:" : "") + cdnFileUrl(s, name);
}

export function variantJson(s: RenderState, v: VariantDrop, ajax: boolean) {
  const img = v.image;
  const fm = v.featured_media;
  const im = img?.r.media_id != null ? s.catalog.mediaById.get(img.r.media_id) : undefined;
  // JSON reports the stored alt text (null), not the product-title fallback of `image.alt`
  const rawAlt = img ? (img.r.rawAlt !== undefined ? img.r.rawAlt : img.r.alt) : null;
  const out: Record<string, unknown> = {
    id: v.id,
    title: v.title,
    option1: v.option1,
    option2: v.option2,
    option3: v.option3,
    sku: v.sku,
    requires_shipping: v.requires_shipping,
    taxable: v.taxable,
    featured_image: img
      ? {
          id: img.r.id,
          product_id: v.p.id,
          position: img.r.position,
          created_at: im?.created_at ?? v.p.r.created_at,
          updated_at: im?.updated_at ?? v.p.r.updated_at,
          alt: rawAlt,
          width: img.r.width,
          height: img.r.height,
          src: absoluteImg(s, img.r.name, ajax),
          variant_ids: img.r.variant_ids || [],
        }
      : null,
    available: v.available,
    name: v.name,
    public_title: v.public_title,
    options: v.options,
    price: v.price,
    weight: v.weight,
    compare_at_price: v.compare_at_price,
    inventory_management: v.inventory_management,
    barcode: v.barcode,
  };
  if (fm && img) {
    out.featured_media = {
      alt: rawAlt,
      id: img.r.media_id,
      position: img.r.position,
      preview_image: {
        aspect_ratio: ratio3(img.r.width, img.r.height),
        height: img.r.height,
        width: img.r.width,
        src: absoluteImg(s, img.r.name, ajax),
      },
    };
  }
  if (ajax) {
    out.quantity_rule = { min: 1, max: null, increment: 1 };
    out.quantity_price_breaks = [];
    out.requires_selling_plan = false;
    out.selling_plan_allocations = [];
  } else {
    out.requires_selling_plan = false;
    out.selling_plan_allocations = [];
    out.quantity_rule = { min: 1, max: null, increment: 1 };
  }
  return out;
}

function ratio3(w: number | null, h: number | null) {
  if (!w || !h) return null;
  const r = Math.round((w / h) * 1000) / 1000;
  return Number.isInteger(r) ? new RFloat(r) : r;
}

export function mediaJson(s: RenderState, m: Media, ajax = true) {
  const f = m.file ? s.catalog.files.get(m.file) : null;
  const preview = m.file
    ? { aspect_ratio: ratio3(f?.width ?? m.width, f?.height ?? m.height), height: f?.height ?? m.height, width: f?.width ?? m.width, src: absoluteImg(s, m.file, ajax) }
    : null;
  if (m.media_type === "image") {
    return { alt: m.alt, id: m.id, position: m.position, preview_image: preview, aspect_ratio: ratio3(m.width, m.height), height: m.height, media_type: "image", src: absoluteImg(s, m.file, ajax), width: m.width };
  }
  if (m.media_type === "video") {
    const d = new MediaDrop(s, m);
    return {
      alt: m.alt,
      id: m.id,
      position: m.position,
      preview_image: preview,
      aspect_ratio: preview?.aspect_ratio ?? null,
      duration: m.duration,
      media_type: "video",
      sources: d.sources.map((x) => ({ format: x.format, height: x.height, mime_type: x.mime_type, url: (ajax ? "https:" : "") + String(x.url).replace(/^https?:/, ""), width: x.width })),
    };
  }
  return { alt: m.alt, id: m.id, position: m.position, preview_image: preview, aspect_ratio: preview?.aspect_ratio ?? null, media_type: m.media_type, external_id: m.external_id, host: m.host };
}

export function productJson(s: RenderState, p: ProductDrop, ajax = true) {
  const out: Record<string, unknown> = {
    id: p.id,
    title: p.title,
    handle: p.handle,
    description: p.description,
    published_at: p.r.published_at,
    created_at: p.r.created_at,
    vendor: p.vendor,
    type: p.type,
    tags: p.tags,
    price: p.price,
    price_min: p.price_min,
    price_max: p.price_max,
    available: p.available,
    price_varies: p.price_varies,
    compare_at_price: p.compare_at_price,
    compare_at_price_min: p.compare_at_price_min,
    compare_at_price_max: p.compare_at_price_max,
    compare_at_price_varies: p.compare_at_price_varies,
    variants: p.variants.map((v) => variantJson(s, v, ajax)),
    images: p.r.media.filter((m) => m.media_type === "image").map((m) => cdnFileUrl(s, m.file || "")),
    featured_image: p.featured_image ? cdnFileUrl(s, p.featured_image.r.name, p.featured_image.r.version, p.featured_image.r.folder) : null,
    options: ajax ? p.options_with_values.map((o) => o.toShopifyJSON()) : p.options_with_values.map((o) => o.name),
    url: p.url,
    media: p.r.media.map((m) => mediaJson(s, m, ajax)),
    requires_selling_plan: false,
    selling_plan_groups: [],
  };
  if (!ajax) {
    delete out.url;
    out.content = p.content;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Collections

export function collectionProductIds(s: RenderState, c: Collection): number[] {
  const cat = s.catalog;
  if (c.all_products) return cat.products.filter(isPublished).map((p) => p.id);
  if (c.rules && c.rules.rules.length) {
    const match = (p: Product) => {
      const res = c.rules!.rules.map((r) => ruleMatches(p, r));
      return c.rules!.disjunctive ? res.some(Boolean) : res.every(Boolean);
    };
    return cat.products.filter((p) => isPublished(p) && match(p)).map((p) => p.id);
  }
  return c.product_ids.filter((id) => {
    const p = cat.productById.get(id);
    return p && isPublished(p);
  });
}

function ruleMatches(p: Product, r: { column: string; relation: string; condition: string }): boolean {
  const cond = r.condition.toLowerCase();
  const vals: (string | number)[] = (() => {
    switch (r.column) {
      case "title":
        return [p.title];
      case "type":
        return [p.product_type];
      case "vendor":
        return [p.vendor];
      case "tag":
        return p.tags;
      case "variant_price":
        return p.variants.map((v) => v.price / 100);
      case "variant_compare_at_price":
        return p.variants.map((v) => (v.compare_at_price || 0) / 100);
      case "variant_inventory":
        return p.variants.map((v) => v.inventory_quantity);
      case "variant_title":
        return p.variants.map((v) => v.title);
      default:
        return [];
    }
  })();
  // negative relations hold only when no value matches (a product tagged X fails "tag is not X")
  if (r.relation === "not_equals") return vals.every((v) => String(v).toLowerCase() !== cond);
  if (r.relation === "not_contains") return vals.every((v) => !String(v).toLowerCase().includes(cond));
  return vals.some((v) => {
    const sv = String(v).toLowerCase();
    switch (r.relation) {
      case "equals":
        return sv === cond;
      case "not_equals":
        return sv !== cond;
      case "starts_with":
        return sv.startsWith(cond);
      case "ends_with":
        return sv.endsWith(cond);
      case "contains":
        return sv.includes(cond);
      case "not_contains":
        return !sv.includes(cond);
      case "greater_than":
        return Number(v) > Number(cond);
      case "less_than":
        return Number(v) < Number(cond);
      default:
        return false;
    }
  });
}

export class CollectionDrop extends SDrop {
  declare r: Collection;
  /** set by {% paginate %} */
  pageSize: number | null = null;
  page = 1;
  private cachedAll: ProductDrop[] | null = null;
  constructor(public f: DropFactory, c: Collection) {
    super(c);
  }
  private get s() {
    return this.f.s;
  }
  get id() {
    return this.r.id;
  }
  get handle() {
    return this.r.handle;
  }
  get object_type() {
    return "collection";
  }
  get title() {
    return tr(this.s, "collection", this.r.id, "title", this.r.title);
  }
  get description() {
    return tr(this.s, "collection", this.r.id, "body_html", this.r.body_html);
  }
  get url() {
    return localePath(this.s, `/collections/${enc(this.r.handle)}`);
  }
  get template_suffix() {
    return this.r.template_suffix;
  }
  get published_at() {
    return this.r.published_at;
  }
  get updated_at() {
    return this.r.updated_at;
  }
  /** Without alt text Shopify reports the collection's (untranslated) title. */
  get image() {
    return ImageDrop.fromName(this.s, this.r.image_file, { alt: this.r.image_alt || this.r.title });
  }
  get featured_image() {
    if (this.r.image_file) return this.image;
    const first = this.allProducts()[0];
    // the first product's image with its stored alt (blank → the theme falls back to the collection title)
    return first?.featured_image?.preview_image ?? null;
  }
  get metafields() {
    return this.f.metafields("collection", this.r.id);
  }
  /** Is this the collection of the current request (sort / filters apply)? */
  private isCurrent() {
    return this.s.pageType === "collection" && this.s.path.split("/")[2] === this.r.handle;
  }
  get sort_by() {
    return this.isCurrent() ? this.s.query.get("sort_by") || null : null;
  }
  get default_sort_by() {
    return this.r.sort_order;
  }
  get sort_options() {
    return sortOptions(this.s);
  }
  private baseProducts(): Product[] {
    const ids = collectionProductIds(this.s, this.r);
    const cat = this.s.catalog;
    return ids.map((id) => cat.productById.get(id)!).filter(Boolean);
  }
  /** All products of the collection after sorting and the request's filters. */
  allProducts(): ProductDrop[] {
    if (this.cachedAll) return this.cachedAll;
    let list = this.baseProducts();
    const current = this.isCurrent();
    const sortBy = (current && this.s.query.get("sort_by")) || this.r.sort_order;
    list = sortProducts(this.s, list, sortBy, this.r.product_ids);
    if (current) list = applyFilters(this.s, list, this.filterSpecs());
    this.cachedAll = list.map((p) => this.f.product(p.id)!);
    return this.cachedAll;
  }
  filterSpecs(): FilterSpec[] {
    return buildFilters(this.s, this.baseProducts(), this.url);
  }
  get filters() {
    if (!this.isCurrent()) return [];
    return this.filterSpecs().map((f) => new FilterDrop(f));
  }
  get products() {
    const all = this.allProducts();
    if (this.pageSize) {
      const start = (this.page - 1) * this.pageSize;
      return all.slice(start, start + this.pageSize);
    }
    return all.slice(0, 50);
  }
  get products_count() {
    return this.allProducts().length;
  }
  get all_products_count() {
    return this.baseProducts().length;
  }
  get all_tags() {
    return [...new Set(this.baseProducts().flatMap((p) => p.tags))].sort();
  }
  get tags() {
    return this.all_tags;
  }
  get all_types() {
    return [...new Set(this.baseProducts().map((p) => p.product_type).filter(Boolean))].sort();
  }
  get all_vendors() {
    return [...new Set(this.baseProducts().map((p) => p.vendor).filter(Boolean))].sort();
  }
  get current_type() {
    return null;
  }
  get current_vendor() {
    return null;
  }
  get terms() {
    return null;
  }
  get next_product() {
    return null;
  }
  get previous_product() {
    return null;
  }
  get seo() {
    return { title: this.r.seo_title, description: this.r.seo_description };
  }
  /** for {% paginate %}: total items */
  paginateTotal() {
    return this.allProducts().length;
  }
}

export function sortOptions(s: RenderState) {
  return SORT_VALUES.map((value) => ({ value, name: shopifyText(s.locale, `sort.${value}`) }));
}

export class FilterDrop extends SDrop {
  declare r: FilterSpec;
  constructor(f: FilterSpec) {
    super(f);
  }
  get label() {
    return this.r.label;
  }
  get param_name() {
    return this.r.param_name;
  }
  get type() {
    return this.r.type;
  }
  get presentation() {
    return this.r.presentation;
  }
  get operator() {
    return this.r.operator;
  }
  get values() {
    return this.r.values.map((v) => new FilterValueDrop(v));
  }
  get active_values() {
    return this.r.values.filter((v) => v.active).map((v) => new FilterValueDrop(v));
  }
  get inactive_values() {
    return this.r.values.filter((v) => !v.active).map((v) => new FilterValueDrop(v));
  }
  get false_value() {
    return null;
  }
  get true_value() {
    return null;
  }
  get min_value() {
    return this.r.min_value ? new FilterValueDrop(this.r.min_value) : null;
  }
  get max_value() {
    return this.r.max_value ? new FilterValueDrop(this.r.max_value) : null;
  }
  get range_max() {
    return this.r.range_max ?? null;
  }
  get url_to_remove() {
    return this.r.url_to_remove;
  }
}

class FilterValueDrop extends SDrop {
  declare r: FilterSpec["values"][number];
  constructor(v: FilterSpec["values"][number]) {
    super(v);
  }
  get label() {
    return this.r.label;
  }
  get value() {
    return this.r.value;
  }
  get count() {
    return this.r.count;
  }
  get active() {
    return this.r.active;
  }
  get param_name() {
    return this.r.param_name;
  }
  get url_to_add() {
    return this.r.url_to_add;
  }
  get url_to_remove() {
    return this.r.url_to_remove;
  }
  get swatch() {
    return null;
  }
  get image() {
    return null;
  }
}

/** Global `collections`: collections['handle'], iteration over published collections. */
export class CollectionsDrop extends SDrop {
  constructor(private f: DropFactory) {
    super({});
  }
  liquidMethodMissing(handle: unknown) {
    if (handle instanceof CollectionDrop) return handle;
    return this.f.collectionByHandle(String(toValue(handle)));
  }
  get size() {
    return this.list().length;
  }
  /** Shopify lists collections by title (in the visitor's language, by character code, so Latin titles come before Cyrillic) and leaves out "frontpage". */
  private list() {
    const key = (d: CollectionDrop) => d.title.toLowerCase();
    return this.f.s.catalog.collections
      .filter((c) => c.published && c.handle !== "frontpage")
      .map((c) => this.f.collection(c.id)!)
      .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  }
  [Symbol.iterator]() {
    return this.list()[Symbol.iterator]();
  }
}

export class AllProductsDrop extends SDrop {
  constructor(private f: DropFactory) {
    super({});
  }
  liquidMethodMissing(handle: unknown) {
    if (handle instanceof ProductDrop) return handle;
    return this.f.productByHandle(String(toValue(handle)));
  }
  get size() {
    return this.f.s.catalog.products.filter(isPublished).length;
  }
}

// ---------------------------------------------------------------------------------------------
// Pages, blogs, articles

export class PageDrop extends SDrop {
  declare r: Page;
  constructor(private f: DropFactory, p: Page) {
    super(p);
  }
  get id() {
    return this.r.id;
  }
  get handle() {
    return this.r.handle;
  }
  get object_type() {
    return "page";
  }
  get title() {
    return tr(this.f.s, "page", this.r.id, "title", this.r.title);
  }
  get content() {
    return tr(this.f.s, "page", this.r.id, "body_html", this.r.body_html);
  }
  get author() {
    return this.r.author;
  }
  get url() {
    return localePath(this.f.s, `/pages/${enc(this.r.handle)}`);
  }
  get template_suffix() {
    return this.r.template_suffix;
  }
  get published_at() {
    return this.r.published_at;
  }
  get metafields() {
    return this.f.metafields("page", this.r.id);
  }
}

export class PagesDrop extends SDrop {
  constructor(private f: DropFactory) {
    super({});
  }
  liquidMethodMissing(handle: unknown) {
    if (handle instanceof PageDrop) return handle;
    return this.f.pageByHandle(String(toValue(handle)));
  }
}

export class BlogDrop extends SDrop {
  declare r: Blog;
  pageSize: number | null = null;
  page = 1;
  /** set on article pages for next/previous */
  currentArticleId: number | null = null;
  constructor(private f: DropFactory, b: Blog) {
    super(b);
  }
  get id() {
    return this.r.id;
  }
  get handle() {
    return this.r.handle;
  }
  get title() {
    return tr(this.f.s, "blog", this.r.id, "title", this.r.title);
  }
  get url() {
    return localePath(this.f.s, `/blogs/${enc(this.r.handle)}`);
  }
  get template_suffix() {
    return this.r.template_suffix;
  }
  get comments_enabled() {
    return this.r.commentable !== "no";
  }
  get moderated() {
    return this.r.commentable === "moderate";
  }
  private list(): Article[] {
    const tag = this.f.s.pageType === "blog" ? this.f.s.path.match(/\/tagged\/([^/]+)/)?.[1] : null;
    let list = this.f.s.catalog.articles.filter((a) => a.blog_id === this.r.id && a.published && (!a.published_at || new Date(a.published_at) <= this.f.s.now));
    if (tag) {
      const t = decodeURIComponent(tag).toLowerCase();
      list = list.filter((a) => a.tags.some((x) => handleize(x) === t || x.toLowerCase() === t));
    }
    return list;
  }
  allArticles() {
    return this.list().map((a) => new ArticleDrop(this.f, a));
  }
  get articles() {
    const all = this.allArticles();
    if (this.pageSize) {
      const start = (this.page - 1) * this.pageSize;
      return all.slice(start, start + this.pageSize);
    }
    return all.slice(0, 50);
  }
  get articles_count() {
    return this.list().length;
  }
  paginateTotal() {
    return this.list().length;
  }
  get all_tags() {
    const all = this.f.s.catalog.articles.filter((a) => a.blog_id === this.r.id && a.published).flatMap((a) => a.tags);
    return [...new Set(all)].sort().map((t) => new TagDrop(t));
  }
  get tags() {
    return this.all_tags;
  }
  private neighbour(delta: number) {
    if (!this.currentArticleId) return null;
    const list = this.list();
    const i = list.findIndex((a) => a.id === this.currentArticleId);
    const a = i >= 0 ? list[i + delta] : null;
    return a ? new ArticleDrop(this.f, a) : null;
  }
  get next_article() {
    return this.neighbour(-1);
  }
  get previous_article() {
    return this.neighbour(1);
  }
  get metafields() {
    return this.f.metafields("blog", this.r.id);
  }
}

export class BlogsDrop extends SDrop {
  constructor(private f: DropFactory) {
    super({});
  }
  liquidMethodMissing(handle: unknown) {
    if (handle instanceof BlogDrop) return handle;
    return this.f.blogByHandle(String(toValue(handle)));
  }
}

export class ArticleDrop extends SDrop {
  declare r: Article;
  constructor(private f: DropFactory, a: Article) {
    super(a);
  }
  private get blog() {
    return this.f.s.catalog.blogById.get(this.r.blog_id)!;
  }
  get id() {
    return this.r.id;
  }
  get handle() {
    return this.r.handle;
  }
  get object_type() {
    return "article";
  }
  get title() {
    return tr(this.f.s, "article", this.r.id, "title", this.r.title);
  }
  get author() {
    return this.r.author;
  }
  get content() {
    return tr(this.f.s, "article", this.r.id, "body_html", this.r.body_html);
  }
  get excerpt() {
    return tr(this.f.s, "article", this.r.id, "summary_html", this.r.summary_html);
  }
  get excerpt_or_content() {
    const e = this.excerpt;
    return e && e.trim() ? e : this.content;
  }
  /** Like product images: the (untranslated) article title when the image has no alt, and no focal point. */
  get image() {
    return ImageDrop.fromName(this.f.s, this.r.image_file, { alt: this.r.image_alt || this.r.title, rawAlt: this.r.image_alt, productImage: true });
  }
  get url() {
    return localePath(this.f.s, `/blogs/${enc(this.blog.handle)}/${enc(this.r.handle)}`);
  }
  get published_at() {
    return this.r.published_at;
  }
  get created_at() {
    return this.r.created_at;
  }
  get updated_at() {
    return this.r.updated_at;
  }
  get tags() {
    return this.r.tags.map((t) => new TagDrop(t));
  }
  get template_suffix() {
    return this.r.template_suffix;
  }
  get comments() {
    return [];
  }
  get comments_count() {
    return 0;
  }
  get comments_enabled() {
    return this.blog.commentable !== "no";
  }
  get moderated() {
    return this.blog.commentable === "moderate";
  }
  get comment_post_url() {
    return `${this.url}/comments`;
  }
  get user() {
    return { name: this.r.author, first_name: this.r.author, last_name: "", bio: "", email: "", image: null, homepage: null, account_owner: false };
  }
  get blog_id() {
    return this.r.blog_id;
  }
  get metafields() {
    return this.f.metafields("article", this.r.id);
  }
}

// ---------------------------------------------------------------------------------------------
// Menus

/** Percent-encodes a handle the way Shopify prints it in URLs (Cyrillic handles). */
export function enc(handle: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(handle));
  } catch {
    return encodeURIComponent(handle);
  }
}

/** Encodes each path segment, keeping ?query and #hash as they are. */
export function encodePathPart(p: string): string {
  const cut = p.search(/[?#]/);
  const path = cut >= 0 ? p.slice(0, cut) : p;
  const tail = cut >= 0 ? p.slice(cut) : "";
  return path.split("/").map((seg) => (seg ? enc(seg) : seg)).join("/") + tail;
}

/** Shopify's handle filter: Latin diacritics are dropped (nucă → nuca), Cyrillic is kept. */
/** A blog tag: prints and compares as the tag text; themes link to /tagged/{{ tag.handle }}. */
export class TagDrop extends SDrop {
  declare r: string;
  get handle() {
    return handleize(this.r);
  }
  get size() {
    return [...this.r].length;
  }
  valueOf() {
    return this.r;
  }
  toString() {
    return this.r;
  }
  toJSON() {
    return this.r;
  }
}

export function handleize(s: string): string {
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
    .replace(/^-+|-+$/g, "");
}

/** Resolves menu / setting URLs: shopify://collections/x → /bg-bg/collections/x */
export function resolveUrl(s: RenderState, url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/^shopify:\/\/(\w+)\/?(.*)$/);
  if (m) {
    const kind = m[1];
    const rest = encodePathPart(m[2]);
    switch (kind) {
      case "collections":
        return localePath(s, rest ? `/collections/${rest}` : "/collections");
      case "products":
        return localePath(s, `/products/${rest}`);
      case "pages":
        return localePath(s, `/pages/${rest}`);
      case "blogs":
        return localePath(s, `/blogs/${rest}`);
      case "search":
        return localePath(s, "/search");
      case "policies":
        return localePath(s, `/policies/${rest}`);
      case "shop_images":
        return cdnFileUrl(s, rest);
      default:
        return localePath(s, "/" + rest);
    }
  }
  if (url === "/" || url === "") return localePath(s, "/");
  if (url.startsWith("/") && !url.startsWith("//")) {
    // stored internal links are market-neutral (/collections/all); keep #anchors and queries
    if (url.startsWith("/cdn/") || url.startsWith("/checkouts")) return url;
    const already = s.catalog.markets.some((mk) => url === "/" + mk.path || url.startsWith("/" + mk.path + "/"));
    const encoded = encodePathPart(url);
    return already ? encoded : localePath(s, encoded);
  }
  return url;
}

export class LinkDrop extends SDrop {
  declare r: MenuItem;
  constructor(private s: RenderState, item: MenuItem, private menuHandle: string, private path: string) {
    super(item);
  }
  get title() {
    return tr(this.s, "menu", this.menuHandle, `${this.path}.title`, this.r.title);
  }
  get url() {
    return resolveUrl(this.s, this.r.url) || "#";
  }
  /** From the source title: Shopify keeps the handle when the title is translated. */
  get handle() {
    return handleize(this.r.title);
  }
  get links() {
    return (this.r.items || []).map((it, i) => new LinkDrop(this.s, it, this.menuHandle, `${this.path}.${i}`));
  }
  get levels() {
    const depth = (items: MenuItem[]): number => (items.length ? 1 + Math.max(...items.map((i) => depth(i.items || []))) : 0);
    return depth(this.r.items || []);
  }
  get type() {
    const u = this.r.url || "";
    if (u.includes("/collections/")) return "collection_link";
    if (u.includes("/products/")) return "product_link";
    if (u.includes("/pages/")) return "page_link";
    if (u.includes("/blogs/")) return "blog_link";
    if (u === "/" || u === "shopify://") return "frontpage_link";
    if (u.includes("/search")) return "search_link";
    return "http_link";
  }
  private requestPath() {
    return this.s.fullPath;
  }
  get current() {
    const url = this.url;
    return url === this.requestPath();
  }
  get active() {
    const url = this.url;
    const p = this.requestPath();
    if (url === p) return true;
    // a product opened from a collection marks the collection link active
    if (url !== localePath(this.s, "/") && p.startsWith(url + "/products/")) return true;
    return false;
  }
  get child_active(): boolean {
    return this.links.some((l) => l.active || l.child_active);
  }
  get child_current(): boolean {
    return this.links.some((l) => l.current || l.child_current);
  }
  get object() {
    return null;
  }
}

export class LinklistDrop extends SDrop {
  constructor(private s: RenderState, public handle: string) {
    super({ handle });
  }
  private menu() {
    return this.s.catalog.menus.get(this.handle);
  }
  get title() {
    const m = this.menu();
    return m ? tr(this.s, "menu", this.handle, "title", m.title) : "";
  }
  get links() {
    return (this.menu()?.items || []).map((it, i) => new LinkDrop(this.s, it, this.handle, String(i)));
  }
  get levels() {
    const depth = (items: MenuItem[]): number => (items.length ? 1 + Math.max(...items.map((i) => depth(i.items || []))) : 0);
    return depth(this.menu()?.items || []);
  }
  valueOf() {
    return this.handle;
  }
  toString() {
    return this.handle;
  }
}

export class LinklistsDrop extends SDrop {
  constructor(private s: RenderState) {
    super({});
  }
  liquidMethodMissing(handle: string) {
    const h = String(toValue(handle));
    if (!this.s.catalog.menus.has(h)) return undefined;
    return new LinklistDrop(this.s, h);
  }
}

/** Global `images['name.png']` — files uploaded to Content → Files. */
export class ImagesDrop extends SDrop {
  constructor(private s: RenderState) {
    super({});
  }
  liquidMethodMissing(name: string) {
    return ImageDrop.fromName(this.s, String(toValue(name)));
  }
}
