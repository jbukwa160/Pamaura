import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { collectionEditorData } from "@/lib/admin/collections";
import { pickerProducts, themeTemplates } from "@/lib/admin/products";
import { CollectionEditor } from "./CollectionEditor";

export const metadata: Metadata = { title: "Колекция" };
export const dynamic = "force-dynamic";

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^\d{1,16}$/.test(id)) notFound();
  const cid = Number(id);
  const data = collectionEditorData(cid);
  if (!data) notFound();
  return (
    <CollectionEditor
      key={cid}
      id={cid}
      kind={data.kind}
      initial={data.form}
      rules={data.rules}
      ruleProducts={data.ruleProducts}
      templates={themeTemplates("collection")}
      products={pickerProducts()}
    />
  );
}
