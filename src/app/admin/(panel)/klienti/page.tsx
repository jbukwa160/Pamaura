import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fmtDate, money } from "@/lib/admin/common";
import { listCustomers } from "@/lib/admin/customers";
import { Badge, Empty, PageHeader } from "@/components/admin/ui";
import { Notice, Pager, SearchBar } from "@/components/admin/settings/ListTools";

export const metadata: Metadata = { title: "Клиенти" };
export const dynamic = "force-dynamic";

type SP = Promise<{ q?: string; page?: string; erased?: string }>;

export default async function CustomersPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = String(sp.q || "").slice(0, 100);
  const { rows, total, page, pages } = listCustomers({ q, page: Math.max(1, Number(sp.page) || 1) });
  const href = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return `/admin/klienti${s ? `?${s}` : ""}`;
  };
  const erased = sp.erased !== undefined ? Math.max(0, Number(sp.erased) || 0) : null;

  return (
    <>
      <PageHeader
        title="Клиенти"
        description="Всеки, който е поръчал или се е регистрирал в сайта. Отворете клиент, за да видите поръчките и адресите му или да промените данните."
      />
      {erased !== null ? (
        <Notice tone="ok" className="mb-5">
          Личните данни на клиента са изтрити.{" "}
          {erased ? `${erased} ${erased === 1 ? "поръчка остава" : "поръчки остават"} в „Поръчки“, вече без връзка с клиента.` : ""}
        </Notice>
      ) : null}
      <SearchBar action="/admin/klienti" q={q} placeholder="Име, имейл или телефон" />

      {rows.length ? (
        <div className="relative overflow-x-auto rounded-3xl border border-line bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Телефон</th>
                <th className="text-right">Поръчки</th>
                <th className="text-right">Похарчени</th>
                <th>От</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const name = `${c.first_name} ${c.last_name}`.trim();
                const spent = Object.entries(c.spent).filter(([, v]) => v > 0);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/klienti/${c.id}`} className="block font-black hover:text-brand">
                        {name || c.email}
                      </Link>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {name ? c.email : null}
                        {c.has_account ? <Badge tone="sky">профил</Badge> : null}
                        {c.accepts_marketing ? <Badge tone="grape">бюлетин</Badge> : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-sm">{c.phone || <span className="text-muted">—</span>}</td>
                    <td className="text-right font-bold">{c.orders}</td>
                    <td className="whitespace-nowrap text-right font-extrabold">
                      {spent.length ? (
                        spent.map(([m, v]) => (
                          <span key={m} className="block">
                            {money(v, m)}
                          </span>
                        ))
                      ) : (
                        <span className="font-normal text-muted">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-sm text-ink-soft">{fmtDate(c.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={<Users className="h-8 w-8" />} title={q ? "Няма намерени клиенти" : "Все още няма клиенти"}>
          {q ? "Опитайте с друго търсене — част от името, имейла или телефона." : "Клиентите се появяват тук след първата поръчка или регистрация."}
        </Empty>
      )}
      <Pager page={page} pages={pages} total={total} noun="клиента" href={href} />
      <p className="mt-4 text-sm text-muted">„Похарчени“ не включва отказаните и върнатите поръчки.</p>
    </>
  );
}
