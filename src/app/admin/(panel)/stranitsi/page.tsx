import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus, Search } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fmtDate } from "@/lib/admin/common";
import { listPages, templateLabel } from "@/lib/admin/content";
import { Badge, Empty, PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Страници" };
export const dynamic = "force-dynamic";

type SP = Promise<{ q?: string }>;

export default async function PagesList({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const q = String((await searchParams).q || "").slice(0, 100);
  const rows = listPages(q);

  return (
    <>
      <PageHeader
        title="Страници"
        description="Информационните страници на сайта: история, контакти, общи условия, доставка… Новите страници добавете и в „Меню“, за да се виждат."
        actions={
          <Link href="/admin/stranitsi/nova" className="btn btn-primary h-12 px-6">
            <Plus className="h-5 w-5" /> Нова страница
          </Link>
        }
      />
      <form className="mb-5 flex gap-2" action="/admin/stranitsi">
        <label className="flex flex-1 items-center rounded-[0.875rem] border-2 border-line bg-white focus-within:border-sky">
          <Search className="ml-3 h-5 w-5 text-muted" />
          <input name="q" defaultValue={q} placeholder="Заглавие, адрес или дума от текста" className="w-full bg-transparent px-3 py-2.5 outline-none focus-visible:outline-none" aria-label="Търсене" />
        </label>
        <button className="btn btn-ghost h-12 px-5">Търси</button>
      </form>

      {rows.length ? (
        <div className="overflow-x-auto rounded-3xl border border-line bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Страница</th>
                <th>Адрес</th>
                <th>Шаблон</th>
                <th>Статус</th>
                <th>Променена</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="min-w-56">
                    <Link href={`/admin/stranitsi/${p.id}`} className="font-black hover:text-brand">
                      {p.title}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {p.roTitle ? <span>RO: {p.roTitle}</span> : null}
                      {p.roMissing ? <Badge tone="sun">няма пълен RO превод</Badge> : null}
                    </span>
                  </td>
                  <td className="max-w-64 truncate font-mono text-xs text-ink-soft" title={`/pages/${p.handle}`}>
                    /pages/{p.handle}
                  </td>
                  <td className="text-sm">{templateLabel(p.template)}</td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      <Badge tone={p.published ? "mint" : "muted"}>{p.published ? "Видима" : "Скрита"}</Badge>
                      {p.inMenu ? <Badge tone="sky">в менюто</Badge> : null}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-sm text-ink-soft">{fmtDate(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={<FileText className="h-8 w-8" />} title={q ? "Няма намерени страници" : "Все още няма страници"}>
          {q ? "Опитайте с друго търсене." : "Създайте първата с бутона „Нова страница“."}
        </Empty>
      )}
      {rows.length ? <p className="mt-3 text-sm font-bold text-muted">{rows.length} страници</p> : null}
    </>
  );
}
