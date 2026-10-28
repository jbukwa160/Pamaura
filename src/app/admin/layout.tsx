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
  return (
    <html lang="bg" className={nunito.variable}>
      <body className="min-h-screen bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
