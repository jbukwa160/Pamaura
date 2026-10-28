// Collections in the admin: list, editor data, saving. Manual collections keep their products in
// collection_products (position order); smart collections (rules) and the "all products" one are computed by the
// storefront and shown read-only.
import "server-only";
import { getCatalog } from "../catalog";
import { getDb, nowIso } from "../db";
import { collectionProductIds, handleize } from "../liquid/drops/catalog";
import type { RenderState } from "../liquid/state";
import { catalogChanged, getTranslations, setTranslation } from "./common";
import { fileUrl } from "./uploads";
import { FormError, addRedirect, bgRo, bgRoAsTyped, line, longText, metafieldForms, pickerProducts, saveMetafieldForms, themeTemplates } from "./products";
import { COLLECTION_SORTS, type CollectionForm, type PickerProduct } from "@/components/admin/products/types";

export type CollectionKind = "manual" | "smart" | "all";
export interface CollectionRules {
  disjunctive: boolean;
  rules: { column: string; relation: string; condition: string }[];
}

interface CollectionRec {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  image_file: string | null;
  image_alt: string | null;
  sort_order: string;
  template_suffix: string | null;
  published: number;
  published_at: string | null;
  updated_at: string;
  seo_title: string | null;
  seo_description: string | null;
  rules: string | null;
  all_products: number;
}

function parseRules(s: string | null): CollectionRules | null {
  if (!s) return null;
  try {
    const r = JSON.parse(s) as CollectionRules;
    return r && Array.isArray(r.rules) && r.rules.length ? r : null;
  } catch {
    return null;
  }
}

function kindOf(c: Pick<CollectionRec, "rules" | "all_products">): CollectionKind {
  if (c.all_products) return "all";
  return parseRules(c.rules) ? "smart" : "manual";
}

/** Ids of the products the shop shows in a collection (published; rules applied), as the storefront computes them. */
function shownIds(id: number): number[] {
  const cat = getCatalog();
  const c = cat.collectionById.get(id);
  if (!c) return [];
  // collectionProductIds only reads `catalog` from the render state
  return collectionProductIds({ catalog: cat } as unknown as RenderState, c);
}

export interface CollectionListRow {
  id: number;
  handle: string;
  title: string;
  kind: CollectionKind;
  published: boolean;
  thumb: string;
  /** products listed in a manual collection (also hidden ones) */
  total: number;
  /** products the shop shows */
  shown: number;
  hasRo: boolean;
}

export function listCollections(): CollectionListRow[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.handle, c.title, c.image_file, c.published, c.rules, c.all_products,
        (SELECT COUNT(*) FROM collection_products cp WHERE cp.collection_id = c.id) AS n,
        (SELECT t.value FROM translations t WHERE t.locale = 'ro' AND t.owner_type = 'collection' AND t.owner_id = CAST(c.id AS TEXT) AND t.field = 'title') AS title_ro
       FROM collections c ORDER BY c.title COLLATE NOCASE`,
    )
    .all() as (Pick<CollectionRec, "id" | "handle" | "title" | "image_file" | "published" | "rules" | "all_products"> & { n: number; title_ro: string | null })[];
  return rows.map((r) => ({
    id: r.id,
    handle: r.handle,
    title: r.title,
    kind: kindOf(r),
    published: !!r.published,
    thumb: fileUrl(r.image_file, 120),
    total: r.n,
    shown: shownIds(r.id).length,
    hasRo: !!r.title_ro?.trim(),
  }));
}

export interface CollectionEditorData {
  id: number;
  kind: CollectionKind;
  form: CollectionForm;
  rules: CollectionRules | null;
  /** smart / all: the products the shop shows */
  ruleProducts: PickerProduct[];
  visible: boolean;
}

export function collectionEditorData(id: number): CollectionEditorData | null {
  const db = getDb();
  const c = db.prepare("SELECT * FROM collections WHERE id = ?").get(id) as CollectionRec | undefined;
  if (!c) return null;
  const t = getTranslations("collection", id);
  const kind = kindOf(c);
  const productIds =
    kind === "manual" ? (db.prepare("SELECT product_id FROM collection_products WHERE collection_id = ? ORDER BY position").all(id) as { product_id: number }[]).map((r) => r.product_id) : [];
  let ruleProducts: PickerProduct[] = [];
  if (kind !== "manual") {
    const shown = new Set(shownIds(id));
    ruleProducts = pickerProducts().filter((p) => shown.has(p.id));
  }
  return {
    id,
    kind,
    rules: parseRules(c.rules),
    ruleProducts,
    visible: !!c.published,
    form: {
      title: { bg: c.title, ro: t.title ?? "" },
      body: { bg: c.body_html, ro: t.body_html ?? "" },
      image: c.image_file ?? "",
      imageUrl: fileUrl(c.image_file, 600),
      imageAlt: c.image_alt ?? "",
      published: !!c.published,
      sortOrder: c.sort_order,
      templateSuffix: c.template_suffix ?? "",
      handle: c.handle,
      seoTitle: { bg: c.seo_title ?? "", ro: t.seo_title ?? "" },
      seoDescription: { bg: c.seo_description ?? "", ro: t.seo_description ?? "" },
      productIds,
      metafields: metafieldForms("collection", id),
    },
  };
}

/** Validates and saves a collection; returns the fresh editor state. */
export function saveCollection(id: number, input: CollectionForm): CollectionForm {
  const db = getDb();
  const c = db.prepare("SELECT * FROM collections WHERE id = ?").get(id) as CollectionRec | undefined;
  if (!c) throw new FormError("Колекцията не съществува (може би е изтрита).");
  if (!input || typeof input !== "object") throw new FormError("Невалидни данни.");

  const title = bgRo(input.title);
  if (!title.bg) throw new FormError("Въведете заглавие на колекцията.");
  const body = { bg: longText(input.body?.bg, 200_000, "Описанието"), ro: longText(input.body?.ro, 200_000, "Описанието (RO)") };
  const image = line(input.image, 500);
  if (image) {
    const f = db.prepare("SELECT mime FROM files WHERE name = ?").get(image) as { mime: string } | undefined;
    if (!f || !f.mime.startsWith("image/")) throw new FormError("Снимката на колекцията не е намерена. Качете я отново.");
  }
  const imageAlt = line(input.imageAlt, 512);
  const published = !!input.published;
  const sortOrder = String(input.sortOrder ?? "");
  if (sortOrder !== c.sort_order && !COLLECTION_SORTS.some((s) => s.value === sortOrder)) throw new FormError("Изберете подредба на продуктите.");
  const suffix = line(input.templateSuffix, 100);
  if (suffix && suffix !== c.template_suffix && !themeTemplates("collection").includes(suffix)) throw new FormError("Избраният шаблон не съществува в темата.");
  const handle = String(input.handle ?? "") === c.handle ? c.handle : handleize(line(input.handle, 255)).slice(0, 255).replace(/-+$/, "");
  if (!handle) throw new FormError("Адресът (URL) на колекцията не може да е празен.");
  if (handle !== c.handle && db.prepare("SELECT 1 FROM collections WHERE handle = ? AND id != ?").get(handle, id)) {
    throw new FormError(`Друга колекция вече използва адреса „${handle}“. Изберете друг.`);
  }
  const seoTitle = bgRoAsTyped(input.seoTitle, 255);
  const seoDescription = bgRoAsTyped(input.seoDescription, 1000);

  const kind = kindOf(c);
  let productIds: number[] | null = null;
  if (kind === "manual") {
    const exists = db.prepare("SELECT 1 FROM products WHERE id = ?");
    productIds = [...new Set((Array.isArray(input.productIds) ? input.productIds : []).slice(0, 2000).map(Number))].filter((n) => Number.isSafeInteger(n) && exists.get(n));
  }

  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE collections SET handle = ?, title = ?, body_html = ?, image_file = ?, image_alt = ?, sort_order = ?, template_suffix = ?, published = ?,
        published_at = CASE WHEN ? = 1 AND published_at IS NULL THEN ? ELSE published_at END,
        updated_at = ?, seo_title = ?, seo_description = ? WHERE id = ?`,
    ).run(
      handle,
      title.bg,
      body.bg,
      image || null,
      imageAlt || null,
      sortOrder,
      suffix || null,
      published ? 1 : 0,
      published ? 1 : 0,
      now,
      now,
      seoTitle.bg || null,
      seoDescription.bg || null,
      id,
    );
    if (handle !== c.handle) addRedirect(`/collections/${c.handle}`, `/collections/${handle}`);
    setTranslation("collection", id, "title", title.ro);
    setTranslation("collection", id, "body_html", body.ro);
    setTranslation("collection", id, "seo_title", seoTitle.ro);
    setTranslation("collection", id, "seo_description", seoDescription.ro);

    if (productIds) {
      const current = (db.prepare("SELECT product_id FROM collection_products WHERE collection_id = ? ORDER BY position").all(id) as { product_id: number }[]).map((r) => r.product_id);
      if (current.join(",") !== productIds.join(",")) {
        db.prepare("DELETE FROM collection_products WHERE collection_id = ?").run(id);
        const ins = db.prepare("INSERT INTO collection_products(collection_id, product_id, position) VALUES(?, ?, ?)");
        productIds.forEach((pid, i) => ins.run(id, pid, i + 1));
      }
    }
    saveMetafieldForms("collection", id, input.metafields);
  })();
  catalogChanged();
  return collectionEditorData(id)!.form;
}
