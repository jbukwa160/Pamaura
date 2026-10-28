import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { pickerProducts, productEditorData, ronMarket, themeTemplates } from "@/lib/admin/products";
import { getDb } from "@/lib/db";
import { ProductEditor } from "./ProductEditor";

export const metadata: Metadata = { title: "Продукт" };
export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^\d{1,16}$/.test(id)) notFound();
  const pid = Number(id);
  const data = productEditorData(pid);
  if (!data) notFound();
  const db = getDb();
  const vendors = (db.prepare("SELECT DISTINCT vendor FROM products WHERE vendor != '' ORDER BY vendor").all() as { vendor: string }[]).map((r) => r.vendor);
  const tags = new Set<string>();
  for (const r of db.prepare("SELECT tags FROM products").all() as { tags: string }[]) {
    try {
      for (const t of JSON.parse(r.tags) as string[]) tags.add(String(t));
    } catch {
      // ignore broken tag lists
    }
  }
  return (
    <ProductEditor
      key={pid}
      id={pid}
      initial={data.form}
      templates={themeTemplates("product")}
      ron={ronMarket()}
      fixedRon={data.fixedRon}
      products={pickerProducts()}
      vendors={vendors}
      tags={[...tags].sort((a, b) => a.localeCompare(b))}
    />
  );
}
