/* eslint-disable @next/next/no-img-element -- thumbnails come resized from /cdn */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail, MapPin, Phone, StickyNote } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fmtDateTime, money } from "@/lib/admin/common";
import { FINANCIAL_LABELS, PAYMENT_LABELS, STATUS_TABS, STATUS_TONE, orderCarrier, orderShipment, orderWeight, shipTo } from "@/lib/admin/orders";
import { fileThumb } from "@/lib/checkout-page";
import { orderById, orderEvents, orderLines } from "@/lib/orders";
import { getCarrier } from "@/lib/shipping/couriers";
import { shippingSettings } from "@/lib/shipping/rates";
import { Badge, Card } from "@/components/admin/ui";
import { NoteForm, PaymentToggle, ResendButton, StatusForm, TrackingForm, WaybillPanel } from "./OrderActions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const o = orderById(Number((await params).id));
  return { title: o ? `Поръчка #${o.number}` : "Поръчка" };
}

const CARRIER_NAMES: Record<string, string> = { econt: "Еконт", speedy: "Speedy", boxnow: "BOX NOW", other: "Друг куриер" };

export default async function OrderPage({ params }: Props) {
  await requireAdmin();
  const id = Number((await params).id);
  const order = Number.isInteger(id) ? orderById(id) : null;
  if (!order) notFound();
  const lines = orderLines(order.id);
  const events = orderEvents(order.id);
  const to = shipTo(order);
  const m = (c: number) => money(c, order.market);
  const label = (k: string) => STATUS_TABS.find((t) => t.key === k)?.label ?? k;
  const carrier = orderCarrier(order);
  const shipment = orderShipment(order);
  const pickup = to.kind === "office" || to.kind === "locker";
  const attrs = Object.entries(JSON.parse(order.attributes || "{}") as Record<string, unknown>).filter(([k]) => !k.startsWith("__"));
  const bankDetails = order.payment_method === "bank_transfer" ? shippingSettings().bank_details : "";

  return (
    <>
      <Link href="/admin/poruchki" className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички поръчки
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-black tracking-tight">Поръчка #{order.number}</h1>
        <Badge tone={STATUS_TONE[order.status]}>{label(order.status)}</Badge>
        <Badge tone={order.financial_status === "paid" ? "mint" : "muted"}>{FINANCIAL_LABELS[order.financial_status] || order.financial_status}</Badge>
        {order.market !== "bg" ? <Badge tone="grape">{order.market.toUpperCase()}</Badge> : null}
        <span className="text-sm font-bold text-muted">{fmtDateTime(order.created_at)}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <a href={`/checkouts/order/${order.token}`} target="_blank" rel="noopener" className="btn btn-ghost h-10 px-4 text-sm">
            <ExternalLink className="h-4 w-4" /> Страницата на клиента
          </a>
          <ResendButton orderId={order.id} />
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Продукти">
            <ul className="divide-y divide-line">
              {lines.map((l) => {
                const img = fileThumb(l.image, 120);
                return (
                  <li key={l.id} className="flex items-center gap-4 py-3">
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line bg-canvas">{img ? <img src={img} alt="" className="h-full w-full object-cover" /> : null}</span>
                    <span className="min-w-0 flex-1">
                      {l.product_id ? (
                        <Link href={`/admin/produkti/${l.product_id}`} className="font-bold hover:text-brand">
                          {l.title}
                        </Link>
                      ) : (
                        <span className="font-bold">{l.title}</span>
                      )}
                      <span className="block text-sm text-muted">
                        {[l.variant_title, l.sku ? `SKU ${l.sku}` : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-sm text-ink-soft">
                      {m(l.price)} × {l.quantity}
                    </span>
                    <span className="w-24 whitespace-nowrap text-right font-extrabold">{m(l.price * l.quantity)}</span>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-[0.95rem]">
              <div className="flex justify-between">
                <dt className="text-ink-soft">Междинна сума</dt>
                <dd className="font-bold">{m(order.subtotal)}</dd>
              </div>
              {order.discount_total ? (
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Отстъпка{order.discount_title || order.discount_code ? ` (${order.discount_title || order.discount_code})` : ""}</dt>
                  <dd className="font-bold text-mint">−{m(order.discount_total)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-ink-soft">Доставка · {order.shipping_title}</dt>
                <dd className="font-bold">{order.shipping_total ? m(order.shipping_total) : "Безплатна"}</dd>
              </div>
              {order.cod_fee ? (
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Такса наложен платеж</dt>
                  <dd className="font-bold">{m(order.cod_fee)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-line pt-2 text-lg">
                <dt className="font-black">Общо</dt>
                <dd className="font-black">{m(order.total)}</dd>
              </div>
              <div className="flex justify-between text-sm text-muted">
                <dt>в т.ч. ДДС</dt>
                <dd>{m(order.tax_total)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Доставка" description={`${order.shipping_title}${to.carrier ? ` · ${CARRIER_NAMES[to.carrier] || to.carrier}` : ""}`}>
            <div className="flex items-start gap-3 rounded-2xl bg-canvas p-4">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
              <div>
                <p className="font-bold">{to.name}</p>
                {pickup ? (
                  <>
                    <p>
                      {to.kind === "locker" ? "Автомат" : "Офис"}: {to.office_name}
                      {to.office_id ? <span className="text-muted"> (код {to.office_id})</span> : null}
                    </p>
                    <p className="text-ink-soft">{[to.city, to.office_address].filter(Boolean).join(", ")}</p>
                  </>
                ) : (
                  <>
                    <p>{to.address1}</p>
                    {to.address2 ? <p>{to.address2}</p> : null}
                    <p className="text-ink-soft">{[to.zip, to.city].filter(Boolean).join(" ")}</p>
                    <p className="text-ink-soft">{to.country}</p>
                  </>
                )}
              </div>
            </div>
            <div className="mt-5">
              <WaybillPanel
                orderId={order.id}
                carrier={carrier}
                carrierName={carrier ? CARRIER_NAMES[carrier] : ""}
                configured={carrier ? getCarrier(carrier).isConfigured() : false}
                shipment={shipment ? { trackingNumber: shipment.trackingNumber, createdAt: fmtDateTime(shipment.createdAt), weightKg: shipment.weightKg, codAmount: shipment.codAmount } : null}
                defaults={{ weightKg: orderWeight(order.id), cod: order.payment_method === "cod" && order.financial_status !== "paid", total: m(order.total), boxnow: carrier === "boxnow" }}
                currencyOk={order.currency === "EUR"}
              />
            </div>
            <div className="mt-5 border-t border-line pt-5">
              <TrackingForm orderId={order.id} number={order.tracking_number || ""} company={order.tracking_company || carrier || ""} url={order.tracking_url} />
            </div>
          </Card>

          <Card title="История">
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-line" />
                  <span>
                    <span className="block">{e.message}</span>
                    <span className="block text-xs text-muted">
                      {fmtDateTime(e.created_at)}
                      {e.author ? ` · ${e.author}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Статус">
            <StatusForm orderId={order.id} status={order.status} />
          </Card>
          <Card title="Клиент">
            <p className="font-bold">{to.name}</p>
            <p className="mt-2 flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted" />
              <a href={`mailto:${order.email}`} className="break-all hover:text-brand">
                {order.email}
              </a>
            </p>
            {order.phone ? (
              <p className="mt-1 flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted" />
                <a href={`tel:${order.phone}`} className="hover:text-brand">
                  {order.phone}
                </a>
              </p>
            ) : null}
            {order.customer_id ? (
              <Link href={`/admin/klienti/${order.customer_id}`} className="mt-3 inline-block text-sm font-bold text-sky hover:underline">
                Профил на клиента →
              </Link>
            ) : null}
            <p className="mt-3 text-xs text-muted">
              Език: {order.locale === "ro" ? "румънски" : "български"}{order.ip && !/^(direct|local)$/.test(order.ip) ? ` · IP ${order.ip}` : ""}
            </p>
          </Card>
          <Card title="Плащане">
            <p className="font-bold">{PAYMENT_LABELS[order.payment_method] || order.payment_method}</p>
            {bankDetails ? <p className="mt-2 whitespace-pre-line rounded-2xl bg-canvas p-3 text-sm">{bankDetails}</p> : null}
            <div className="mt-4">
              <PaymentToggle orderId={order.id} paid={order.financial_status === "paid"} />
            </div>
          </Card>
          <Card title="Бележки">
            {order.note ? (
              <div className="mb-4 flex gap-2 rounded-2xl bg-sun-soft p-3 text-sm">
                <StickyNote className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-extrabold">От клиента</span>
                  {order.note}
                </span>
              </div>
            ) : null}
            {attrs.length ? (
              <dl className="mb-4 text-sm">
                {attrs.map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="font-bold">{k}:</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <NoteForm orderId={order.id} note={order.admin_note || ""} />
          </Card>
        </div>
      </div>
    </>
  );
}
