// Shared Shopify drops: images, media, fonts, colors, metafields, metaobjects.
import { Drop } from "liquidjs";
import type { FileRec, Media, Metafield, Metaobject, VideoSource } from "../../catalog";
import { RFloat, formatFloat } from "../rnum";
import { tr, type RenderState } from "../state";

/**
 * Base for all drops. `r` is an enumerable own field on purpose: LiquidJS treats objects without
 * own keys as `empty`, and Shopify drops are never empty. Keys ending in "?" map to the getter
 * without it (product.gift_card? → gift_card).
 */
export class SDrop extends Drop {
  constructor(public r: unknown) {
    super();
  }
  liquidMethodMissing(key: string): unknown {
    if (typeof key === "string" && key.endsWith("?")) {
      const base = key.slice(0, -1);
      const v = (this as unknown as Record<string, unknown>)[base];
      return typeof v === "function" ? !!(v as () => unknown).call(this) : !!v;
    }
    return undefined;
  }
}

/** URL of a file. Without version/folder, `name` is a files-table key and is looked up. */
export function cdnFileUrl(s: RenderState, name: string, version?: string | number, folder?: string): string {
  if (version === undefined && folder === undefined) {
    const f = s.catalog.files.get(name);
    if (f) return `//${s.host}/cdn/shop/${f.folder}/${encodeFileName(f.plain)}?v=${f.version}`;
    return `//${s.host}/cdn/shop/files/${encodeFileName(name)}`;
  }
  const q = version ? `?v=${version}` : "";
  return `//${s.host}/cdn/shop/${folder || "files"}/${encodeFileName(name)}${q}`;
}

export function encodeFileName(name: string) {
  return name
    .split("/")
    .map((p) => encodeURIComponent(p).replace(/%40/g, "@"))
    .join("/");
}

/** A Shopify image (product image, MediaImage, image_picker file). */
export class ImageDrop extends SDrop {
  declare r: { name: string; folder: string; version: string; width: number | null; height: number | null; alt: string | null; id: number | null; position?: number; product_id?: number | null; variant_ids?: number[]; media_id?: number | null; focal?: { x: number; y: number } | null; productImage?: boolean; rawAlt?: string | null };
  constructor(private s: RenderState, rec: ImageDrop["r"]) {
    super(rec);
  }
  static fromFile(s: RenderState, f: FileRec, extra: Partial<ImageDrop["r"]> = {}) {
    return new ImageDrop(s, { name: f.plain, folder: f.folder, version: f.version, width: f.width, height: f.height, alt: f.alt, id: null, ...extra });
  }
  static fromName(s: RenderState, name: string | null | undefined, extra: Partial<ImageDrop["r"]> = {}): ImageDrop | null {
    if (!name) return null;
    const f = s.catalog.files.get(name);
    if (!f) return null;
    return ImageDrop.fromFile(s, f, extra);
  }
  get id() {
    return this.r.id ?? this.r.media_id ?? null;
  }
  get alt() {
    return this.r.alt ?? "";
  }
  get width() {
    return this.r.width;
  }
  get height() {
    return this.r.height;
  }
  get aspect_ratio() {
    const { width, height } = this.r;
    if (!width || !height) return null;
    const ratio = width / height;
    return Number.isInteger(ratio) ? new RFloat(ratio) : ratio;
  }
  get src() {
    return cdnFileUrl(this.s, this.r.name, this.r.version, this.r.folder);
  }
  get url() {
    return this.src;
  }
  get position() {
    return this.r.position ?? null;
  }
  get product_id() {
    return this.r.product_id ?? null;
  }
  get variants() {
    return (this.r.variant_ids || []).map((id) => this.s.catalog.variantById.get(id)).filter(Boolean);
  }
  get attached_to_variant() {
    return (this.r.variant_ids || []).length > 0;
  }
  get media_type() {
    return "image";
  }
  /** The preview image reports the stored alt (no product-title fallback), like Shopify. */
  get preview_image(): ImageDrop {
    if (this.r.rawAlt === undefined) return this;
    return new ImageDrop(this.s, { ...this.r, alt: this.r.rawAlt, rawAlt: undefined });
  }
  /** Files report the centre (50.0% 50.0%) when no focal point was set; product images report none. */
  get presentation() {
    if (this.r.productImage && !this.r.focal) return { focal_point: null };
    const f = this.r.focal || { x: 50, y: 50 };
    return { focal_point: new FocalPoint(f.x, f.y) };
  }
  get file_name() {
    return this.r.name;
  }
  /** `{{ image }}` prints the relative path, like Shopify ("files/x.jpg"). */
  valueOf() {
    return `${this.r.folder}/${this.r.name}`;
  }
  toString() {
    return this.valueOf();
  }
}

class FocalPoint extends SDrop {
  constructor(
    public px: number,
    public py: number,
  ) {
    super({ x: px, y: py });
  }
  get x() {
    return Number.isInteger(this.px) ? new RFloat(this.px) : this.px;
  }
  get y() {
    return Number.isInteger(this.py) ? new RFloat(this.py) : this.py;
  }
  valueOf() {
    return `${formatFloat(this.px)}% ${formatFloat(this.py)}%`;
  }
}

export class VideoSourceDrop extends SDrop {
  declare r: VideoSource;
  constructor(private s: RenderState, src: VideoSource) {
    super(src);
  }
  /** Shopify prints video sources as //<shop>/cdn/shop/videos/c/vp/<id>/<file>?v=0 */
  get url() {
    const u = this.r.url;
    if (/^(https?:)?\/\//.test(u)) return u;
    return `//${this.s.host}/cdn/shop/videos/${encodeFileName(u)}?v=0`;
  }
  get format() {
    return this.r.format;
  }
  get mime_type() {
    return this.r.mime_type;
  }
  get width() {
    return this.r.width;
  }
  get height() {
    return this.r.height;
  }
}

/** Product media: image, video, external_video. */
export class MediaDrop extends SDrop {
  declare r: Media;
  constructor(private s: RenderState, m: Media) {
    super(m);
  }
  get id() {
    return this.r.id;
  }
  get media_type() {
    return this.r.media_type;
  }
  get position() {
    return this.r.position;
  }
  get alt() {
    return productAlt(this.s, this.r) ?? "";
  }
  get preview_image() {
    return ImageDrop.fromName(this.s, this.r.file, { id: this.r.media_type === "image" ? this.r.image_id : null, media_id: this.r.id, alt: this.r.alt, position: this.r.position, product_id: this.r.product_id, variant_ids: this.r.variant_ids, productImage: true });
  }
  get aspect_ratio() {
    const w = this.r.width, h = this.r.height;
    if (this.r.media_type === "video" && this.r.sources.length) {
      // Shopify rounds video aspect ratios to 3 decimals (0.563). The preview image has the
      // original proportions; renditions are rounded to even pixel sizes (606×1080).
      const pf = this.r.file ? this.s.catalog.files.get(this.r.file) : null;
      const s0 = this.r.sources.find((x) => x.format === "mp4") || this.r.sources[0];
      const [vw, vh] = pf?.width && pf.height ? [pf.width, pf.height] : [s0.width, s0.height];
      const ratio = Math.round((vw / vh) * 1000) / 1000;
      return Number.isInteger(ratio) ? new RFloat(ratio) : ratio;
    }
    if (!w || !h) return null;
    const ratio = w / h;
    return Number.isInteger(ratio) ? new RFloat(ratio) : ratio;
  }
  get width() {
    return this.r.width;
  }
  get height() {
    return this.r.height;
  }
  get src() {
    return this.preview_image?.src ?? null;
  }
  get sources() {
    return this.r.sources.map((x) => new VideoSourceDrop(this.s, x));
  }
  get external_id() {
    return this.r.external_id;
  }
  get host() {
    return this.r.host;
  }
  get duration() {
    return this.r.duration ?? null;
  }
  get variants() {
    return this.r.variant_ids.map((id) => this.s.catalog.variantById.get(id)).filter(Boolean);
  }
  valueOf() {
    if (this.r.file) {
      const f = this.s.catalog.files.get(this.r.file);
      return f ? `${f.folder}/${f.plain}` : `files/${this.r.file}`;
    }
    return String(this.r.id);
  }
}

/** A video from Content → Files (theme `video` settings, file_reference metafields). */
export function videoFromFile(s: RenderState, f: FileRec): MediaDrop | null {
  const meta = f.meta;
  if (!meta?.sources?.length) return null;
  return new MediaDrop(s, {
    id: meta.media_id ?? 0,
    image_id: null,
    product_id: null,
    position: 1,
    media_type: "video",
    alt: f.alt,
    file: meta.preview ?? null,
    width: meta.width ?? null,
    height: meta.height ?? null,
    sources: meta.sources,
    duration: null,
    created_at: null,
    updated_at: null,
    external_id: null,
    host: null,
    variant_ids: [],
  });
}

/** Shopify falls back to the product title when a product image has no alt text. */
export function productAlt(s: RenderState, m: Pick<Media, "alt" | "product_id">): string | null {
  if (m.alt) return m.alt;
  if (m.product_id == null) return null;
  const p = s.catalog.productById.get(m.product_id);
  if (!p) return null;
  return tr(s, "product", p.id, "title", p.title);
}

/** Builds an ImageDrop (media_type image, id = media id) or MediaDrop for a media record. */
export function mediaDrop(s: RenderState, m: Media | undefined | null): ImageDrop | MediaDrop | null {
  if (!m) return null;
  if (m.media_type === "image") {
    return ImageDrop.fromName(s, m.file, { id: m.id, media_id: m.id, alt: productAlt(s, m), rawAlt: m.alt, position: m.position, product_id: m.product_id, variant_ids: m.variant_ids, width: m.width, height: m.height, productImage: true });
  }
  return new MediaDrop(s, m);
}

/** In Shopify the MediaImage drop's id is the media id, unlike product.images[] ids. */
export class MediaImageDrop extends ImageDrop {}

// ---------------------------------------------------------------------------------------------
// Fonts

export interface FontVariant {
  family_key: string; // fira_sans
  family: string; // Fira Sans
  style: "normal" | "italic";
  weight: number;
  woff2: string; // file name under /cdn/fonts/<family_key>/
  woff: string;
}

export class FontDrop extends SDrop {
  declare r: { handle: string; family: string; style: string; weight: number; fallback: string; system: boolean };
  constructor(handle: string, family: string, style: string, weight: number, fallback: string, system = false) {
    super({ handle, family, style, weight, fallback, system });
  }
  /** CSS-ready: Shopify quotes names that contain spaces ("Fira Sans", Assistant). */
  get family() {
    return !this.r.system && /\s/.test(this.r.family) ? `"${this.r.family}"` : this.r.family;
  }
  get style() {
    return this.r.style;
  }
  get weight() {
    return this.r.weight;
  }
  get fallback_families() {
    return this.r.fallback;
  }
  get system() {
    return this.r.system;
  }
  get baseline_ratio() {
    return null;
  }
  get variants() {
    return [];
  }
  valueOf() {
    return this.r.handle;
  }
  toString() {
    return this.r.handle;
  }
}

// ---------------------------------------------------------------------------------------------
// Colors (Shopify color settings print the saved value as-is)

export class ColorDrop extends SDrop {
  declare r: { raw: string };
  constructor(raw: string) {
    super({ raw });
  }
  private rgba() {
    return parseColor(this.r.raw);
  }
  get red() {
    return this.rgba()?.[0] ?? 0;
  }
  get green() {
    return this.rgba()?.[1] ?? 0;
  }
  get blue() {
    return this.rgba()?.[2] ?? 0;
  }
  get alpha() {
    const a = this.rgba()?.[3] ?? 1;
    return Number.isInteger(a) ? new RFloat(a) : a;
  }
  get rgb() {
    const c = this.rgba();
    return c ? `${c[0]} ${c[1]} ${c[2]}` : "";
  }
  get rgba_str() {
    const c = this.rgba();
    return c ? `${c[0]} ${c[1]} ${c[2]} / ${c[3]}` : "";
  }
  valueOf() {
    return this.r.raw;
  }
  toString() {
    return this.r.raw;
  }
}

export function parseColor(input: string): [number, number, number, number] | null {
  const s = String(input || "").trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100) / 100 : 1;
    return [r, g, b, a];
  }
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  m = s.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  if (s === "transparent") return [0, 0, 0, 0];
  return null;
}

// ---------------------------------------------------------------------------------------------
// video_url setting

export class VideoUrlDrop extends SDrop {
  declare r: { url: string; id: string; type: string };
  constructor(url: string) {
    let id = "", type = "";
    const yt = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
    const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (yt) {
      id = yt[1];
      type = "youtube";
    } else if (vm) {
      id = vm[1];
      type = "vimeo";
    }
    super({ url, id, type });
  }
  get id() {
    return this.r.id;
  }
  get type() {
    return this.r.type;
  }
  valueOf() {
    return this.r.url;
  }
  toString() {
    return this.r.url;
  }
}

// ---------------------------------------------------------------------------------------------
// Metafields & metaobjects

/** Resolves drops for references inside metafield values. Implemented in drops/index.ts. */
export interface RefResolver {
  product(id: number): unknown;
  variant(id: number): unknown;
  collection(id: number): unknown;
  page(id: number): unknown;
  file(name: string): unknown;
  metaobject(id: number): unknown;
}

export function gidId(gid: string): { type: string; id: string } | null {
  const m = String(gid).match(/^gid:\/\/shopify\/(\w+)\/(.+)$/);
  return m ? { type: m[1], id: m[2] } : null;
}

export class MetafieldDrop extends SDrop {
  declare r: Metafield;
  constructor(private s: RenderState, mf: Metafield, private refs: RefResolver, private translated?: string) {
    super(mf);
  }
  get type() {
    return this.r.type;
  }
  get list() {
    return this.r.type.startsWith("list.");
  }
  get raw() {
    return this.translated ?? this.r.value;
  }
  get value() {
    return metafieldValue(this.r.type, this.raw, this.refs);
  }
  get namespace() {
    return this.r.namespace;
  }
  get key() {
    return this.r.key;
  }
  /** `{{ product.metafields.ns.key }}` prints the stored value (JSON for lists / rich text). */
  valueOf() {
    const t = this.r.type;
    if (t === "file_reference") {
      const f = this.value as ImageDrop | null;
      return f ? String(f.src) : "";
    }
    return this.raw;
  }
  toString() {
    return String(this.valueOf());
  }
}

export function metafieldValue(type: string, raw: string, refs: RefResolver): unknown {
  const parseJson = () => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const ref = (t: string, v: string): unknown => {
    const g = gidId(v);
    switch (t) {
      case "product_reference":
        return g ? refs.product(Number(g.id)) : null;
      case "variant_reference":
        return g ? refs.variant(Number(g.id)) : null;
      case "collection_reference":
        return g ? refs.collection(Number(g.id)) : null;
      case "page_reference":
        return g ? refs.page(Number(g.id)) : null;
      case "file_reference":
        // stored as the file name (our files table)
        return refs.file(g ? g.id : v);
      case "metaobject_reference":
        return g ? refs.metaobject(Number(g.id)) : null;
      default:
        return v;
    }
  };
  if (type.startsWith("list.")) {
    const inner = type.slice(5);
    const arr = (parseJson() as unknown[]) || [];
    return arr.map((x) => (inner.endsWith("_reference") ? ref(inner, String(x)) : x)).filter((x) => x !== null && x !== undefined);
  }
  switch (type) {
    case "number_integer":
      return parseInt(raw, 10);
    case "number_decimal": {
      const n = parseFloat(raw);
      return Number.isInteger(n) ? new RFloat(n) : n;
    }
    case "boolean":
      return raw === "true";
    case "rich_text_field":
      // Shopify's JSON tree, or HTML (imported / edited in our admin)
      return raw.trim().startsWith("{") ? parseJson() : raw;
    case "rating": {
      const r = (parseJson() || {}) as { value?: string; scale_min?: string; scale_max?: string };
      const f = (x: string | undefined) => {
        const n = parseFloat(x || "0");
        return Number.isInteger(n) ? new RFloat(n) : n;
      };
      return { rating: f(r.value), scale_min: f(r.scale_min), scale_max: f(r.scale_max) };
    }
    case "json":
    case "dimension":
    case "volume":
    case "weight":
      return parseJson();
    case "color":
      return new ColorDrop(raw);
    default:
      if (type.endsWith("_reference")) return ref(type, raw);
      return raw;
  }
}

/** product.metafields → namespaces → keys */
export class MetafieldsDrop extends SDrop {
  constructor(private s: RenderState, private ownerType: string, private ownerId: number | string, private refs: RefResolver) {
    super({ ownerType, ownerId });
  }
  liquidMethodMissing(ns: string) {
    const list = this.s.catalog.metafields.get(`${this.ownerType}:${this.ownerId}`) || [];
    const fields = list.filter((m) => m.namespace === ns);
    if (!fields.length) return undefined;
    return new MetafieldNamespaceDrop(this.s, this.ownerType, this.ownerId, ns, fields, this.refs);
  }
}

class MetafieldNamespaceDrop extends SDrop {
  constructor(private s: RenderState, private ownerType: string, private ownerId: number | string, ns: string, private fields: Metafield[], private refs: RefResolver) {
    super({ ns });
  }
  liquidMethodMissing(key: string) {
    const mf = this.fields.find((m) => m.key === key);
    if (!mf) return undefined;
    const tkey = `metafield:${this.ownerType}.${this.ownerId}.${mf.namespace}.${mf.key}`;
    const translated = this.s.locale !== this.s.catalog.shop.primary_locale ? this.s.catalog.translations.get(this.s.locale)?.get(`${tkey}:value`) : undefined;
    return new MetafieldDrop(this.s, mf, this.refs, translated);
  }
  get size() {
    return this.fields.length;
  }
}

export class MetaobjectDrop extends SDrop {
  declare r: Metaobject;
  constructor(private s: RenderState, mo: Metaobject, private refs: RefResolver) {
    super(mo);
  }
  get handle() {
    return this.r.handle;
  }
  get id() {
    return this.r.id;
  }
  get type() {
    return this.r.type;
  }
  liquidMethodMissing(key: string) {
    const f = this.r.fields[key];
    if (!f) return super.liquidMethodMissing(key);
    const tkey = `metaobject:${this.r.id}:${key}`;
    const translated = this.s.locale !== this.s.catalog.shop.primary_locale ? this.s.catalog.translations.get(this.s.locale)?.get(`${tkey}`) : undefined;
    return new MetafieldDrop(this.s, { namespace: this.r.type, key, type: f.type, value: f.value }, this.refs, translated);
  }
}
