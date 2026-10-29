// Root layout of the order status page (/checkouts/order/<order token>).
import type { Metadata } from "next";
import "../../checkout.css";
import { brandFontCss, faviconUrl } from "@/lib/checkout-page";
import { orderByToken } from "@/lib/orders";

export function generateMetadata(): Metadata {
  const icon = faviconUrl();
  return { robots: { index: false, follow: false }, icons: icon ? { icon } : undefined };
}

export default async function OrderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = /^[a-f0-9]{32}$/.test(token) ? orderByToken(token) : null;
  // suppressHydrationWarning: browser extensions add classes to <html> / <body> before React starts
  return (
    <html lang={order?.locale || "bg"} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <style dangerouslySetInnerHTML={{ __html: brandFontCss() }} />
        {children}
      </body>
    </html>
  );
}
