import type { Metadata } from "next";
import Link from "next/link";
import { Layers } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { listCollections, type CollectionKind } from "@/lib/admin/collections";
import { Badge, Card, Empty, PageHeader } from "@/components/admin/ui";
import { ProductThumb } from "@/components/admin/products/ProductPicker";

export const metadata: Metadata = { title: "Колекции" };
export const dynamic = "force-dynamic";

const KIND: Record<CollectionKind, { label: string; tone: "sky" | "grape" | "muted" }> = {
  manual: { label: "Ръчна", tone: "sky" },
  smart: { label: "Автоматична", tone: "grape" },
  all: { label: "Всички продукти", tone: "muted" },
};

export default async function CollectionsPage() {
  await requireAdmin();
  const rows = listCollections();
  return (
    <>
      <PageHeader title="Колекции" description="Групи от продукти, които се показват в менюто и на началната страница. В ръчните колекции вие избирате продуктите и реда им." />
      {rows.length ? (
        <Card className="!p-0 md:!p-0">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-16">
                    <span className="sr-only">Снимка</span>
                  </th>
                  <th>Колекция</th>
                  <th>Вид</th>
                  <th>Продукти</th>
                  <th>Статус</th>
                  <th>Превод RO</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="relative">
                    <td>
                      <ProductThumb src={c.thumb} />
                    </td>
                    <td className="min-w-56">
                      <Link href={`/admin/kolektsii/${c.id}`} className="font-bold after:absolute after:inset-0 hover:underline">
                        {c.title}
                      </Link>
                      <span className="block text-xs text-muted">/collections/{c.handle}</span>
                    </td>
                    <td>
                      <Badge tone={KIND[c.kind].tone}>{KIND[c.kind].label}</Badge>
                    </td>
                    <td className="whitespace-nowrap">
                      {c.shown}
                      {c.kind === "manual" && c.total !== c.shown ? <span className="text-sm text-muted"> (+{c.total - c.shown} скрити)</span> : null}
                    </td>
                    <td>{c.published ? <Badge tone="mint">Публикувана</Badge> : <Badge tone="sun">Скрита</Badge>}</td>
                    <td>{c.hasRo ? <Badge tone="mint">има</Badge> : <Badge tone="sun">липсва</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Empty icon={<Layers className="h-8 w-8" />} title="Няма колекции" />
      )}
      <p className="mt-3 text-sm text-muted">„Продукти“ е броят продукти, които клиентите виждат в колекцията (без черновите).</p>
    </>
  );
}
