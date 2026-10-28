// Products and collections for the "applies to" pickers of the discount editor.
import "server-only";
import { getCatalog } from "@/lib/catalog";
import type { PickItem } from "@/components/admin/settings/PickList";

export function pickers(): { products: PickItem[]; collections: PickItem[] } {
  const cat = getCatalog();
  const products = cat.products
    .map((p) => ({ id: p.id, title: p.title, hint: p.status === "active" ? p.handle : `${p.handle} · ${p.status === "draft" ? "чернова" : "архив"}` }))
    .sort((a, b) => a.title.localeCompare(b.title, "bg"));
  const collections = cat.collections
    // the checkout matches collections by their product list (product_ids): an empty collection never matches
    .map((c) => ({ id: c.id, title: c.title, hint: `${c.handle} · ${c.product_ids.length ? `${c.product_ids.length} продукта` : "празна — кодът няма да важи за нищо"}` }))
    .sort((a, b) => a.title.localeCompare(b.title, "bg"));
  return { products, collections };
}
