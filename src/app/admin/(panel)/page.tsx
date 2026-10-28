import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Mail, Package, ShoppingBag, Truck, Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fmtDateTime, money, sofiaDay } from "@/lib/admin/common";
import { STATUS_TABS, STATUS_TONE, shipTo } from "@/lib/admin/orders";
import { getDb } from "@/lib/db";
import { failedMailCount } from "@/lib/mail";
import type { OrderRec } from "@/lib/orders";
import { getCarrier } from "@/lib/shipping/couriers";
import { Badge, Card, PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Табло" };
export const dynamic = "force-dynamic";

interface Totals {
  n: number;
  eur: number;
  ron: number;
}

function totalsSince(fromIso: string): Totals {
  const rows = getDb()
    .prepare("SELECT currency, COUNT(*) AS n, SUM(total) AS s FROM orders WHERE created_at >= ? AND status NOT IN ('cancelled','returned') GROUP BY currency")
    .all(fromIso) as { currency: string; n: number; s: number }[];
  const out: Totals = { n: 0, eur: 0, ron: 0 };
  for (const r of rows) {
    out.n += r.n;
    if (r.currency === "RON") out.ron += r.s;
    else out.eur += r.s;
  }
  return out;
}

/** Midnight in Sofia, `days` days ago, as ISO. */
function sofiaMidnight(daysAgo: number): string {
  const day = sofiaDay(new Date(Date.now() - daysAgo * 86400_000));
  // Sofia is UTC+2 / UTC+3; find the UTC instant whose Sofia date is `day` at 00:00
  for (const off of [3, 2]) {
    const d = new Date(`${day}T00:00:00+0${off}:00`);
    if (sofiaDay(d) === day && sofiaDay(new Date(d.getTime() - 1)) !== day) return d.toISOString();
  }
  return new Date(`${day}T00:00:00Z`).toISOString();
}

function Stat({ label, totals, icon }: { label: string; totals: Totals; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-line bg-white p-5">
      <div className="flex items-center gap-2 text-sm font-extrabold text-muted">
        {icon} {label}
      </div>
      <p className="mt-2 text-3xl font-black">{totals.n}</p>
      <p className="text-sm font-bold text-ink-soft">
        {totals.n ? (
          <>
            {money(totals.eur, "bg")}
            {totals.ron ? ` + ${money(totals.ron, "ro")}` : ""}
          </>
        ) : (
          "няма поръчки"
        )}
      </p>
    </div>
  );
}

export default async function Dashboard() {
  await requireAdmin();
  const db = getDb();
  const today = totalsSince(sofiaMidnight(0));
  const week = totalsSince(sofiaMidnight(6));
  const month = totalsSince(sofiaMidnight(29));
  const waiting = db.prepare("SELECT * FROM orders WHERE status IN ('new','confirmed') ORDER BY created_at ASC LIMIT 10").all() as OrderRec[];
  const lowStock = db
    .prepare(
      `SELECT v.id, v.title, v.inventory_quantity AS qty, p.id AS product_id, p.title AS product
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.inventory_management IS NOT NULL AND v.inventory_policy != 'continue' AND v.inventory_quantity <= 5 AND p.status = 'active'
       ORDER BY v.inventory_quantity ASC LIMIT 12`,
    )
    .all() as { id: number; title: string; qty: number; product_id: number; product: string }[];
  const failedMail = failedMailCount();
  const smtp = Boolean(process.env.SMTP_HOST);
  const couriers = (["econt", "speedy", "boxnow"] as const).map((c) => ({ id: c, ok: getCarrier(c).isConfigured() }));
  const pendingReviews = (db.prepare("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'").get() as { n: number }).n;
  const label = (k: string) => STATUS_TABS.find((t) => t.key === k)?.label ?? k;

  return (
    <>
      <PageHeader title="Табло" description="Как върви магазинът днес и какво чака действие." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Днес" totals={today} icon={<ShoppingBag className="h-4 w-4" />} />
        <Stat label="Последните 7 дни" totals={week} icon={<Wallet className="h-4 w-4" />} />
        <Stat label="Последните 30 дни" totals={month} icon={<Wallet className="h-4 w-4" />} />
      </div>

      {!smtp || failedMail || pendingReviews ? (
        <div className="mt-6 space-y-3">
          {!smtp ? (
            <p className="flex items-start gap-2 rounded-2xl bg-sun-soft p-4 font-bold">
              <Mail className="mt-0.5 h-5 w-5 shrink-0" />
              Пощата не е настроена: имейлите към клиентите (потвърждения, изпратени поръчки) се записват в папката outbox и не стигат до тях. Попълнете SMTP_* в .env.local.
            </p>
          ) : null}
          {failedMail ? (
            <p className="flex items-start gap-2 rounded-2xl bg-brand-soft p-4 font-bold text-brand-dark">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> {failedMail} имейла чакат повторно изпращане (пощенският сървър не отговори). Опитът се повтаря автоматично.
            </p>
          ) : null}
          {pendingReviews ? (
            <Link href="/admin/otzivi?status=pending" className="flex items-center gap-2 rounded-2xl bg-sky-soft p-4 font-bold">
              {pendingReviews} нови отзива чакат одобрение <ArrowRight className="ml-auto h-4 w-4" />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title="Чакат обработка"
          description="Нови и потвърдени поръчки, най-старите първи."
          actions={
            <Link href="/admin/poruchki" className="btn btn-ghost h-10 px-4 text-sm">
              Всички поръчки <ArrowRight className="h-4 w-4" />
            </Link>
          }
        >
          {waiting.length ? (
            <ul className="divide-y divide-line">
              {waiting.map((o) => {
                const to = shipTo(o);
                return (
                  <li key={o.id}>
                    <Link href={`/admin/poruchki/${o.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:bg-cream">
                      <span className="font-black">#{o.number}</span>
                      <Badge tone={STATUS_TONE[o.status]}>{label(o.status)}</Badge>
                      <span className="min-w-0 flex-1 truncate text-ink-soft">{to.name || o.email}</span>
                      <span className="font-extrabold">{money(o.total, o.market)}</span>
                      <span className="w-full text-xs text-muted sm:w-auto">{fmtDateTime(o.created_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-ink-soft">Няма поръчки за обработка. 🎉</p>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Ниска наличност" description="Варианти с 5 или по-малко бройки.">
            {lowStock.length ? (
              <ul className="divide-y divide-line">
                {lowStock.map((v) => (
                  <li key={v.id}>
                    <Link href={`/admin/produkti/${v.product_id}`} className="flex items-center gap-3 py-2.5 hover:bg-cream">
                      <Package className="h-4 w-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">
                        {v.product} <span className="text-muted">· {v.title}</span>
                      </span>
                      <Badge tone={v.qty <= 0 ? "brand" : "sun"}>{v.qty <= 0 ? "изчерпан" : `${v.qty} бр.`}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-soft">Всички продукти са в наличност.</p>
            )}
          </Card>
          <Card title="Куриери">
            <ul className="space-y-2">
              {couriers.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted" />
                  <span className="flex-1 font-bold">{c.id === "econt" ? "Еконт" : c.id === "speedy" ? "Speedy" : "BOX NOW"}</span>
                  <Badge tone={c.ok ? "mint" : "muted"}>{c.ok ? "свързан" : "не е свързан"}</Badge>
                </li>
              ))}
            </ul>
            <Link href="/admin/dostavka" className="mt-3 inline-block text-sm font-bold text-sky hover:underline">
              Доставка и плащане →
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
