import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { mailStatus } from "@/lib/admin/env-status";
import { ROUNDING_LABELS, ratePreview, type RatePreview } from "@/lib/admin/settings";
import { getCatalog } from "@/lib/catalog";
import { getSetting } from "@/lib/db";
import { DEFAULT_HEAD, type HeadSettings } from "@/lib/liquid/head";
import { Badge, Card, PageHeader } from "@/components/admin/ui";
import { EnvNames, Notice } from "@/components/admin/settings/ListTools";
import { MailRetry } from "./MailRetry";
import { SettingsEditor } from "./SettingsEditor";

export const metadata: Metadata = { title: "Настройки" };
export const dynamic = "force-dynamic";

const MARKET_LABELS: Record<string, string> = { bg: "България", ro: "Румъния" };
const COUNTRY_LABELS: Record<string, string> = { BG: "България", RO: "Румъния" };

export default async function SettingsPage() {
  await requireAdmin();
  const cat = getCatalog();
  const shop = cat.shop;
  const head = { ...DEFAULT_HEAD, ...getSetting<Partial<HeadSettings>>("head", {}) };
  const tax = getSetting<Record<string, number>>("tax_rates", { BG: 20, RO: 21 });
  const countries = [...new Set(cat.markets.map((m) => m.country))];
  const previews: Record<string, RatePreview> = {};
  for (const m of cat.markets) {
    if (m.primary) continue;
    const p = ratePreview(m.handle, m.rate);
    if (p) previews[m.handle] = p;
  }
  const mail = mailStatus();

  const mailCard = (
    <Card title="Имейли" description="Потвържденията за поръчки до клиентите и известията за нови поръчки до вас.">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3 text-[0.95rem]">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-bold">Поща (SMTP):</span>
            <Badge tone={mail.configured ? "mint" : "sun"}>{mail.configured ? "настроена" : "не е настроена"}</Badge>
          </p>
          <div>
            <p className="mb-1.5 text-sm font-bold">Настройки в .env.local:</p>
            <EnvNames vars={mail.smtp} />
            <p className="mt-1.5 text-xs text-muted">Попълват се от програмиста на сървъра. Паролата не се показва никъде.</p>
          </div>
          <p>
            <span className="font-bold">Изпращач:</span> <span className="break-all">{mail.from}</span>
          </p>
          <p>
            <span className="font-bold">Известия за нови поръчки и съобщения отиват на:</span> <span className="break-all">{mail.notifyTo}</span>
            {!mail.notifyFromEnv ? <span className="block text-sm text-muted">(адресът по подразбиране — сменя се със SHOP_NOTIFY_EMAIL в .env.local)</span> : null}
          </p>
        </div>
        <div className="space-y-3">
          {!mail.configured ? (
            <Notice tone="warn">
              Пощата не е настроена: имейлите не стигат до клиентите, а се записват като файлове в папката outbox на сървъра
              {mail.outbox ? ` (там има ${mail.outbox} ${mail.outbox === 1 ? "имейл" : "имейла"})` : ""}. Те няма да бъдат изпратени автоматично и по-късно.
            </Notice>
          ) : mail.outbox ? (
            <Notice tone="info">
              В папката outbox има {mail.outbox} {mail.outbox === 1 ? "имейл, записан" : "имейла, записани"}, докато пощата не беше настроена. Те не се изпращат автоматично.
            </Notice>
          ) : null}
          {mail.failed ? (
            <Notice tone="danger">
              {mail.failed} {mail.failed === 1 ? "имейл чака" : "имейла чакат"} повторно изпращане — пощенският сървър не ги прие. Системата опитва отново автоматично (до 8 пъти), но може и
              да опитате сега.
            </Notice>
          ) : mail.configured ? (
            <Notice tone="ok">Няма чакащи имейли.</Notice>
          ) : null}
          <MailRetry disabled={!mail.configured || !mail.failed} />
        </div>
      </div>
    </Card>
  );

  return (
    <>
      <PageHeader title="Настройки" description="Данните на магазина, валутите, ДДС, кодовете за Google / Facebook / Klaviyo и пощата." />
      <SettingsEditor
        initial={{
          shop: {
            name: shop.name,
            email: shop.email,
            phone: shop.phone,
            street: shop.address.street,
            city: shop.address.city,
            zip: shop.address.zip,
            company: shop.address.company,
          },
          markets: cat.markets.map((m) => ({
            handle: m.handle,
            path: m.path,
            label: MARKET_LABELS[m.handle] ?? m.name,
            currency: m.currency,
            symbol: m.currency === "RON" ? "lei" : m.currency_symbol,
            primary: m.primary,
            rounding: ROUNDING_LABELS[m.rounding] ?? m.rounding,
            rate: String(m.rate).replace(".", ","),
            enabled: m.enabled,
          })),
          tax: countries.map((c) => ({ country: c, label: COUNTRY_LABELS[c] ?? c, rate: String(tax[c] ?? 20).replace(".", ",") })),
          head: {
            google_site_verification: head.google_site_verification,
            facebook_domain_verification: head.facebook_domain_verification,
            klaviyo_company_id: head.klaviyo_company_id,
            extra_head_html: head.extra_head_html,
          },
        }}
        previews={previews}
        after={mailCard}
      />
    </>
  );
}
