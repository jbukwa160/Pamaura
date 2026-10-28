import type { Metadata } from "next";
import Link from "next/link";
import { Search, ShoppingBag } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fmtDateTime, money } from "@/lib/admin/common";
import { FINANCIAL_LABELS, PAYMENT_LABELS, STATUS_TABS, STATUS_TONE, listOrders, shipTo, statusCounts } from "@/lib/admin/orders";
import { Badge, Empty, PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Поръчки" };
export const dynamic = "force-dynamic";

type SP = Promise<{ status?: string; q?: string; page?: string }>;

export default async function OrdersPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = STATUS_TABS.some((t) => t.key === sp.status) ? sp.status! : "all";
  const q = (sp.q || "").slice(0, 100);
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, pages } = listOrders({ status, q, page });
  const counts = statusCounts();
  const href = (o: { status?: string; page?: number }) => {
    const p = new URLSearchParams();
    const st = o.status ?? status;
    if (st !== "all") p.set("status", st);
    if (q) p.set("q", q);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    const s = p.toString();
    return `/admin/poruchki${s ? `?${s}` : ""}`;
  };
  const label = (k: string) => STATUS_TABS.find((t) => t.key === k)?.label ?? k;

  return (
    <>
      <PageHeader title="Поръчки" description="Всички поръчки от сайта. Отворете поръчка, за да смените статуса, да създадете товарителница или да пишете на клиента." />
      <div className="mb-4 flex flex-wrap gap-2" role="navigation" aria-label="Статус">
        {STATUS_TABS.map((t) => (
          <Link key={t.key} href={href({ status: t.key, page: 1 })} className="chip" aria-current={status === t.key ? "page" : undefined}>
            {t.label}
            <span className="text-xs opacity-70">{counts[t.key] ?? 0}</span>
          </Link>
        ))}
      </div>
      <form className="mb-5 flex gap-2" action="/admin/poruchki">
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        <label className="flex flex-1 items-center rounded-[0.875rem] border-2 border-line bg-white focus-within:border-sky">
          <Search className="ml-3 h-5 w-5 text-muted" />
          <input name="q" defaultValue={q} placeholder="Номер, имейл, телефон, име или номер на пратка" className="w-full bg-transparent px-3 py-2.5 outline-none focus-visible:outline-none" aria-label="Търсене" />
        </label>
        <button className="btn btn-ghost h-12 px-5">Търси</button>
      </form>

      {rows.length ? (
        <div className="overflow-x-auto rounded-3xl border border-line bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Поръчка</th>
                <th>Дата</th>
                <th>Клиент</th>
                <th>Доставка</th>
                <th>Плащане</th>
                <th className="text-right">Сума</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const to = shipTo(o);
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/admin/poruchki/${o.id}`} className="font-black hover:text-brand">
                        #{o.number}
                      </Link>
                      {o.market !== "bg" ? <span className="ml-1.5 text-xs font-bold text-muted">{o.market.toUpperCase()}</span> : null}
                    </td>
                    <td className="whitespace-nowrap text-sm text-ink-soft">{fmtDateTime(o.created_at)}</td>
                    <td>
                      <span className="block font-bold">{to.name || "—"}</span>
                      <span className="block text-xs text-muted">{o.phone || o.email}</span>
                    </td>
                    <td className="text-sm">
                      <span className="block">{o.shipping_title}</span>
                      {o.tracking_number ? <span className="block text-xs text-muted">{o.tracking_number}</span> : null}
                    </td>
                    <td className="text-sm">
                      <span className="block">{PAYMENT_LABELS[o.payment_method] || o.payment_method}</span>
                      {o.financial_status === "paid" ? <span className="text-xs font-bold text-mint">{FINANCIAL_LABELS.paid}</span> : null}
                    </td>
                    <td className="whitespace-nowrap text-right font-extrabold">{money(o.total, o.market)}</td>
                    <td>
                      <Badge tone={STATUS_TONE[o.status]}>{label(o.status)}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={<ShoppingBag className="h-8 w-8" />} title={q ? "Няма намерени поръчки" : "Все още няма поръчки"}>
          {q ? "Опитайте с друго търсене." : "Поръчките от сайта ще се появят тук."}
        </Empty>
      )}

      {pages > 1 ? (
        <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Страници">
          <span className="text-sm font-bold text-muted">
            {total} поръчки · страница {page} от {pages}
          </span>
          <span className="flex gap-2">
            {page > 1 ? (
              <Link href={href({ page: page - 1 })} className="btn btn-ghost h-10 px-4 text-sm">
                ← Предишна
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={href({ page: page + 1 })} className="btn btn-ghost h-10 px-4 text-sm">
                Следваща →
              </Link>
            ) : null}
          </span>
        </nav>
      ) : null}
    </>
  );
}
