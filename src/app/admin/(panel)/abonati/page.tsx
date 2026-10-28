import type { Metadata } from "next";
import Link from "next/link";
import { Download, Mail } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fmtDate, fmtDateTime } from "@/lib/admin/common";
import { SUB_STATUS, listSubscribers, localeLabel, sourceLabel, subscriberCounts } from "@/lib/admin/subscribers";
import { Badge, Empty, PageHeader } from "@/components/admin/ui";
import { Pager, SearchBar } from "@/components/admin/settings/ListTools";
import { SubscriberActions } from "./SubscriberActions";

export const metadata: Metadata = { title: "Абонати" };
export const dynamic = "force-dynamic";

type SP = Promise<{ status?: string; q?: string; page?: string }>;

export default async function SubscribersPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = SUB_STATUS.some((t) => t.key === sp.status) ? sp.status! : "subscribed";
  const q = String(sp.q || "").slice(0, 100);
  const { rows, total, page, pages } = listSubscribers({ status, q, page: Math.max(1, Number(sp.page) || 1) });
  const counts = subscriberCounts();
  const query = (o: { status?: string; page?: number }) => {
    const p = new URLSearchParams();
    const st = o.status ?? status;
    if (st !== "subscribed") p.set("status", st);
    if (q) p.set("q", q);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const exportHref = `/admin/abonati/export${query({ page: 1 })}`;

  return (
    <>
      <PageHeader
        title="Абонати"
        description="Хората, записали се за бюлетина от сайта (формата за бюлетин, контактната форма или при поръчка). Формите на Klaviyo в сайта събират абонати директно в Klaviyo — те не са тук."
        actions={
          <a href={exportHref} className="btn btn-ghost h-11 px-5" download>
            <Download className="h-5 w-5" /> Изтегли CSV (Excel)
          </a>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2" role="navigation" aria-label="Статус">
        {SUB_STATUS.map((t) => (
          <Link key={t.key} href={`/admin/abonati${query({ status: t.key, page: 1 })}`} className="chip" aria-current={status === t.key ? "page" : undefined}>
            {t.label}
            <span className="text-xs opacity-70">{counts[t.key] ?? 0}</span>
          </Link>
        ))}
      </div>
      <SearchBar action="/admin/abonati" q={q} placeholder="Търсене по имейл" keep={{ status: status !== "subscribed" ? status : undefined }} />

      {rows.length ? (
        <div className="relative overflow-x-auto rounded-3xl border border-line bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Имейл</th>
                <th>Статус</th>
                <th>Откъде</th>
                <th>Език</th>
                <th>Записан на</th>
                <th>
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.email}>
                  <td className="break-all font-bold">{s.email}</td>
                  <td>{s.status === "subscribed" ? <Badge tone="mint">абониран</Badge> : <Badge>отписан {fmtDate(s.updated_at)}</Badge>}</td>
                  <td className="text-sm">{sourceLabel(s.source)}</td>
                  <td className="text-sm">{localeLabel(s.locale)}</td>
                  <td className="whitespace-nowrap text-sm text-ink-soft">{fmtDateTime(s.created_at)}</td>
                  <td className="text-right">
                    <SubscriberActions email={s.email} subscribed={s.status === "subscribed"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={<Mail className="h-8 w-8" />} title={q ? "Няма намерени абонати" : status === "unsubscribed" ? "Няма отписали се" : "Все още няма абонати"}>
          {q ? "Опитайте с друга част от имейла." : "Абонатите се появяват тук, когато някой се запише за бюлетина в сайта."}
        </Empty>
      )}
      <Pager page={page} pages={pages} total={total} noun="абоната" href={(p) => `/admin/abonati${query({ page: p })}`} />
      <p className="mt-4 text-sm text-muted">
        CSV файлът съдържа списъка, който виждате в момента (с избрания статус и търсене). Отваря се направо с Excel. Изпращайте бюлетин само на „абонирани“.
      </p>
    </>
  );
}
