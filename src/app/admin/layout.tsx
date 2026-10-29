// Root layout of the admin panel (the storefront is the theme, rendered by app/[[...path]]). Bulgarian, never indexed.
import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./admin.css";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin", "cyrillic"], weight: ["400", "600", "700", "800", "900"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Админ панел", template: "%s · Админ панел" },
  robots: { index: false, follow: false },
  icons: { icon: "/cdn/shop/files/favicon.png?width=48" },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning: browser extensions add classes to <html> / <body> before React starts;
  // data-scroll-behavior: admin.css scrolls smoothly, Next turns it off during route changes
  return (
    <html lang="bg" className={nunito.variable} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="min-h-screen bg-canvas text-ink antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
