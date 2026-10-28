// Checkout page. The theme's cart sends the visitor here (/checkouts/<cart token>?locale=<market>).
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { quote } from "@/lib/checkout";
import { checkoutTexts } from "@/lib/checkout-i18n";
import { logoUrl, storeLinks } from "@/lib/checkout-page";
import { getCatalog } from "@/lib/catalog";
import { checkoutRequest, requestFromHeaders } from "@/lib/storefront/checkout-context";
import { shippingSettings } from "@/lib/shipping/rates";
import { convertAmount } from "@/lib/catalog";
import CheckoutForm, { type CheckoutProps } from "./CheckoutForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const locale = String(sp.locale || "").startsWith("ro") ? "ro" : "bg";
  return { title: `${checkoutTexts(locale).title} – ${getCatalog().shop.name}` };
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const h = await headers();
  const locale = typeof sp.locale === "string" ? sp.locale : null;
  const sr = checkoutRequest(requestFromHeaders(h, `/checkouts/${token}`), token, locale);
  if (!sr) notFound();
  const s = sr.state;
  const links = storeLinks(s.market);
  if (!s.cart.items.length) redirect(links.cart);

  const customer = s.customer;
  const q = quote(s, s.cart, { payment: "cod" });
  const cfg = shippingSettings();
  const props: CheckoutProps = {
    token,
    marketPath: s.market.path,
    locale: s.locale,
    moneyFormat: s.market.money_format,
    currency: s.market.currency,
    texts: checkoutTexts(s.locale),
    quote: q,
    freeThreshold: cfg.free_threshold === null ? null : convertAmount(cfg.free_threshold, s.market),
    prefill: {
      email: customer?.email || "",
      phone: customer?.phone || "",
      first_name: customer?.first_name || "",
      last_name: customer?.last_name || "",
      accepts_marketing: Boolean(customer?.accepts_marketing),
    },
    country: s.market.country,
    links,
    shopName: s.catalog.shop.name,
    logo: logoUrl(),
  };
  return <CheckoutForm {...props} />;
}
