// Root layout of the checkout (/checkouts/<cart token>): outside the theme, in the store's style.
import type { Metadata } from "next";
import "../checkout.css";
import { getCatalog } from "@/lib/catalog";
import { loadCart } from "@/lib/cart";
import { brandFontCss, faviconUrl } from "@/lib/checkout-page";

export function generateMetadata(): Metadata {
  const icon = faviconUrl();
  return { robots: { index: false, follow: false }, icons: icon ? { icon } : undefined };
}

export default async function CheckoutLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const markets = getCatalog().markets.filter((m) => m.enabled);
  const cart = /^[a-f0-9]{16,64}$/.test(token) ? loadCart(token, markets[0].handle) : null;
  const lang = markets.find((m) => m.handle === cart?.market)?.language || markets[0].language;
  // suppressHydrationWarning: browser extensions add classes to <html> / <body> before React starts
  return (
    <html lang={lang} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <style dangerouslySetInnerHTML={{ __html: brandFontCss() }} />
        {children}
      </body>
    </html>
  );
}
