import type { Metadata } from "next";
import Link from "next/link";
import { Package, Plus, Search } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { money } from "@/lib/admin/common";
import { listProducts } from "@/lib/admin/products";
import { Badge, Card, Empty, PageHeader } from "@/components/admin/ui";
import { ProductThumb } from "@/components/admin/products/ProductPicker";
import { STATUS_LABEL } from "@/components/admin/products/types";

export const metadata: Metadata = { title: "Продукти" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "Всички" },
  { key: "active", label: "Активни" },
  { key: "draft", label: "Чернови" },
  { key: "archived", label: "Архивирани" },
] as const;

const STATUS_TONE: Record<string, "mint" | "sun" | "muted"> = { active: "mint", draft: "sun", archived: "muted" };

function href(status: string, q: string) {
  const p = new URLSearchParams();
  if (status !== "all") p.set("status", status);
  if (q) p.set("q", q);
  const s = p.toString();
  return `/admin/produkti${s ? `?${s}` : ""}`;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 200);
  const status = typeof sp.status === "string" && TABS.some((t) => t.key === sp.status) ? sp.status : "all";
  const { rows, counts } = listProducts({ q, status });

  return (
    <>
      <PageHeader
        title="Продукти"
        description="Всички продукти на магазина. Натиснете продукт, за да промените текстовете, снимките, цените или наличността."
        actions={
          <Link href="/admin/produkti/nov" className="btn btn-primary h-12 px-6">
            <Plus className="h-5 w-5" /> Нов продукт
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action="/admin/produkti" className="relative w-full sm:w-80">
          {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input type="search" name="q" defaultValue={q} placeholder="Име, адрес или код (SKU)" aria-label="Търсене на продукти" className="field !pl-10" />
        </form>
        <nav className="flex flex-wrap gap-2" aria-label="Статус">
          {TABS.filter((t) => t.key !== "archived" || counts.archived).map((t) => (
            <Link key={t.key} href={href(t.key, q)} className="chip" aria-current={status === t.key ? "page" : undefined}>
              {t.label} <span className="opacity-60">{counts[t.key] ?? 0}</span>
            </Link>
          ))}
        </nav>
      </div>

      {rows.length ? (
        <Card className="!p-0 md:!p-0">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-16">
                    <span className="sr-only">Снимка</span>
                  </th>
                  <th>Продукт</th>
                  <th>Статус</th>
                  <th>Наличност</th>
                  <th>Цена</th>
                  <th>Превод RO</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="relative">
                    <td>
                      <ProductThumb src={p.thumb} />
                    </td>
                    <td className="min-w-56">
                      <Link href={`/admin/produkti/${p.id}`} className="font-bold after:absolute after:inset-0 hover:underline">
                        {p.title}
                      </Link>
                      <span className="block text-xs text-muted">
                        /{p.handle}
                        {p.variants > 1 ? ` · ${p.variants} варианта` : ""}
                      </span>
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[p.status] ?? "muted"}>{STATUS_LABEL[p.status] ?? p.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap">
                      {p.stock === null ? (
                        <span className="text-sm text-muted">не се следи</span>
                      ) : p.stock <= 0 ? (
                        <Badge tone="brand">изчерпан</Badge>
                      ) : (
                        <span className={p.stock <= 5 ? "font-bold text-brand-dark" : ""}>{p.stock} бр.</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap font-bold">
                      {p.priceMin === null ? "—" : p.priceMin === p.priceMax ? money(p.priceMin) : `${money(p.priceMin)} – ${money(p.priceMax!)}`}
                    </td>
                    <td>{p.hasRo ? <Badge tone="mint">има</Badge> : <Badge tone="sun">липсва</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Empty icon={<Package className="h-8 w-8" />} title={q ? "Няма намерени продукти" : "Няма продукти"}>
          {q ? (
            <>
              Опитайте с друга дума или{" "}
              <Link href={href(status, "")} className="font-bold text-sky hover:underline">
                изчистете търсенето
              </Link>
              .
            </>
          ) : (
            "Добавете първия продукт с бутона „Нов продукт“."
          )}
        </Empty>
      )}
      <p className="mt-3 text-sm text-muted">
        {rows.length} от {counts.all} продукта. Наличността е сборът от вариантите, за които се следи.
      </p>
    </>
  );
}
