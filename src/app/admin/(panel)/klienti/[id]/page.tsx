import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, ShoppingBag } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fmtDate, fmtDateTime, money } from "@/lib/admin/common";
import { customerSpent, parseTags } from "@/lib/admin/customers";
import { STATUS_TABS, STATUS_TONE, listOrders } from "@/lib/admin/orders";
import { addresses, customerById } from "@/lib/customers";
import { Badge, Card } from "@/components/admin/ui";
import { CustomerEditor, EraseCustomer } from "./CustomerEditor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function load(raw: string) {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? customerById(id) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireAdmin();
  const c = load((await params).id);
  return { title: c ? `${c.first_name} ${c.last_name}`.trim() || c.email : "Клиент" };
}

export default async function CustomerPage({ params }: Props) {
  await requireAdmin();
  const c = load((await params).id);
  if (!c) notFound();
  const addr = addresses(c.id);
  const { rows: orders, total: orderCount } = listOrders({ customerId: c.id, perPage: 100 });
  const spent = Object.entries(customerSpent(c.id)).filter(([, v]) => v > 0);
  const name = `${c.first_name} ${c.last_name}`.trim();
  const label = (k: string) => STATUS_TABS.find((t) => t.key === k)?.label ?? k;

  const ordersCard = (
    <Card title="Поръчки" description={orderCount ? `${orderCount} ${orderCount === 1 ? "поръчка" : "поръчки"}, най-новите първи.` : undefined}>
      {orders.length ? (
        <div className="relative -mx-5 overflow-x-auto md:-mx-7">
          <table className="table">
            <thead>
              <tr>
                <th className="!pl-5 md:!pl-7">Поръчка</th>
                <th>Дата</th>
                <th>Статус</th>
                <th className="!pr-5 text-right md:!pr-7">Сума</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="!pl-5 md:!pl-7">
                    <Link href={`/admin/poruchki/${o.id}`} className="font-black hover:text-brand">
                      #{o.number}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-sm text-ink-soft">{fmtDateTime(o.created_at)}</td>
                  <td>
                    <Badge tone={STATUS_TONE[o.status]}>{label(o.status)}</Badge>
                  </td>
                  <td className="!pr-5 whitespace-nowrap text-right font-extrabold md:!pr-7">{money(o.total, o.market)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-ink-soft">
          <ShoppingBag className="h-5 w-5 text-muted" /> Клиентът още няма поръчки.
        </p>
      )}
    </Card>
  );

  const side = (
    <>
      <Card title="Обобщение">
        <dl className="space-y-2.5 text-[0.95rem]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Имейл</dt>
            <dd className="min-w-0 break-all text-right font-bold">
              <a href={`mailto:${c.email}`} className="hover:text-brand">
                {c.email}
              </a>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Профил в сайта</dt>
            <dd className="text-right font-bold">{c.password_hash ? "има (влиза с парола)" : "няма (поръчва като гост)"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Език</dt>
            <dd className="text-right font-bold">{c.locale === "ro" ? "румънски" : c.locale === "bg" ? "български" : c.locale || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Клиент от</dt>
            <dd className="text-right font-bold">{fmtDate(c.created_at)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Поръчки</dt>
            <dd className="text-right font-bold">{orderCount}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Похарчени</dt>
            <dd className="text-right font-black">{spent.length ? spent.map(([m, v]) => <span key={m} className="block">{money(v, m)}</span>) : "—"}</dd>
          </div>
        </dl>
      </Card>
      <Card title="Адреси" description={addr.length ? undefined : "Клиентът няма запазени адреси. Адресът за доставка на всяка поръчка е в самата поръчка."}>
        {addr.length ? (
          <ul className="space-y-3">
            {addr.map((a) => (
              <li key={a.id} className="flex gap-2.5 rounded-2xl bg-canvas p-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div className="min-w-0 text-[0.95rem]">
                  <p className="font-bold">
                    {[a.first_name, a.last_name].filter(Boolean).join(" ") || name || "—"}
                    {a.is_default ? (
                      <Badge tone="mint" className="ml-2">
                        основен
                      </Badge>
                    ) : null}
                  </p>
                  {a.company ? <p>{a.company}</p> : null}
                  <p>{[a.address1, a.address2].filter(Boolean).join(", ")}</p>
                  <p>{[a.zip, a.city, a.province].filter(Boolean).join(" ")}</p>
                  {a.country ? <p className="text-ink-soft">{a.country}</p> : null}
                  {a.phone ? <p className="text-ink-soft">{a.phone}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
      <EraseCustomer id={c.id} email={c.email} orders={orderCount} />
    </>
  );

  return (
    <>
      <Link href="/admin/klienti" className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички клиенти
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-black tracking-tight">{name || c.email}</h1>
        {c.password_hash ? <Badge tone="sky">има профил</Badge> : <Badge>гост</Badge>}
        {c.state !== "enabled" ? <Badge tone="brand">{c.state === "disabled" ? "спрян профил" : "поканен"}</Badge> : null}
      </div>
      <CustomerEditor
        id={c.id}
        initial={{
          first_name: c.first_name,
          last_name: c.last_name,
          phone: c.phone ?? "",
          accepts_marketing: Boolean(c.accepts_marketing),
          note: c.note ?? "",
          tags: parseTags(c.tags).join(", "),
        }}
        orders={ordersCard}
        side={side}
      />
    </>
  );
}
