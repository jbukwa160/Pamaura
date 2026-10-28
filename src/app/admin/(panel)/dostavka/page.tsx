import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { courierStatuses } from "@/lib/admin/env-status";
import { knownShippingMethods } from "@/lib/admin/shipping";
import { getCatalog } from "@/lib/catalog";
import { shippingSettings } from "@/lib/shipping/rates";
import { Badge, Card, PageHeader } from "@/components/admin/ui";
import { EnvNames, Notice } from "@/components/admin/settings/ListTools";
import { CourierTest } from "./CourierTest";
import { ShippingEditor, type MarketInfo } from "./ShippingEditor";

export const metadata: Metadata = { title: "Доставка и плащане" };
export const dynamic = "force-dynamic";

const MARKET_LABELS: Record<string, string> = { bg: "България", ro: "Румъния" };
const text = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export default async function ShippingPage() {
  await requireAdmin();
  const cfg = shippingSettings();
  const couriers = courierStatuses();
  const markets: MarketInfo[] = getCatalog().markets.map((m) => ({
    handle: m.handle,
    label: MARKET_LABELS[m.handle] ?? m.name,
    rate: m.rate,
    moneyFormat: m.money_format,
    primary: m.primary,
    enabled: m.enabled,
  }));
  const available = Object.fromEntries(couriers.map((c) => [c.id, c.listsAvailable]));
  const speedy = couriers.find((c) => c.id === "speedy")!;

  return (
    <>
      <PageHeader title="Доставка и плащане" description="Начините на доставка с цените им, безплатната доставка и начините на плащане при поръчка." />

      <Card
        className="mb-6"
        title="Куриери"
        description="Връзката с куриерите се настройва от програмиста във файла .env.local на сървъра. Тук виждате кои данни са попълнени — самите пароли не се показват никъде."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {couriers.map((c) => {
            const missingLogin = c.login.filter((v) => !v.set);
            const missingWaybill = c.waybill.filter((v) => !v.set);
            return (
              <section key={c.id} className="flex flex-col gap-3 rounded-2xl border-2 border-line p-4" aria-label={c.name}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-black">{c.name}</h3>
                  <Badge tone={c.connected ? "mint" : "muted"}>{c.connected ? "свързан" : "не е свързан"}</Badge>
                </div>
                {c.connected ? (
                  <p className="text-sm text-ink-soft">Данните за вход са попълнени. Проверете дали са верни с бутона по-долу.</p>
                ) : (
                  <div className="text-sm">
                    <p className="mb-1.5 font-bold">Липсват в .env.local:</p>
                    <EnvNames vars={missingLogin} />
                  </div>
                )}
                {c.waybill.length ? (
                  <div className="text-sm">
                    <p className="mb-1.5 font-bold">{missingWaybill.length ? "За товарителници липсват:" : "Данни на подателя за товарителници:"}</p>
                    <EnvNames vars={missingWaybill.length ? missingWaybill : c.waybill} />
                    {missingWaybill.length && c.waybillNote ? <p className="mt-1.5 text-xs text-muted">{c.waybillNote}</p> : null}
                  </div>
                ) : null}
                <p className="text-sm text-ink-soft">
                  {c.id === "speedy"
                    ? c.listsAvailable
                      ? "Офисите на Speedy се показват при поръчка."
                      : "Без връзка Speedy не дава списъка с офисите — методите на Speedy са скрити при поръчка."
                    : c.connected
                      ? `${c.id === "boxnow" ? "Автоматите" : "Офисите"} се показват при поръчка; товарителници се създават от поръчката.`
                      : `${c.id === "boxnow" ? "Автоматите" : "Офисите"} се показват при поръчка и без връзка (публичен списък), но товарителници не могат да се създават.`}
                </p>
                <div className="mt-auto">
                  <CourierTest id={c.id} />
                </div>
              </section>
            );
          })}
        </div>
        {!speedy.listsAvailable ? (
          <Notice tone="warn" className="mt-5">
            Speedy не е свързан, затова „До офис на Спиди“ и „До адрес със Спиди“ не се показват на клиентите, дори да са включени по-долу. Ще се появят сами, щом програмистът
            попълни SPEEDY_USERNAME и SPEEDY_PASSWORD.
          </Notice>
        ) : null}
      </Card>

      <ShippingEditor
        initial={{
          methods: knownShippingMethods().map((m) => ({
            code: m.code,
            carrier: m.carrier,
            kind: m.kind,
            enabled: m.enabled,
            price: text(m.price),
            title: { bg: m.title.bg ?? "", ro: m.title.ro ?? "" },
            description: { bg: m.description.bg ?? "", ro: m.description.ro ?? "" },
            markets: m.markets,
          })),
          free_on: cfg.free_threshold !== null,
          free_threshold: cfg.free_threshold !== null ? text(cfg.free_threshold) : "",
          free_methods: cfg.free_methods,
          cod_enabled: cfg.cod_enabled,
          cod_fee: text(cfg.cod_fee),
          bank_transfer_enabled: cfg.bank_transfer_enabled,
          bank_details: cfg.bank_details,
        }}
        markets={markets}
        available={available}
        savedFreeThreshold={cfg.free_threshold}
      />
    </>
  );
}
