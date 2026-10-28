"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgePercent,
  ExternalLink,
  FileText,
  Languages,
  LayoutDashboard,
  Layers,
  ListTree,
  LogOut,
  Mail,
  Menu,
  MessageSquareQuote,
  Newspaper,
  Package,
  Settings,
  ShoppingBag,
  Truck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { logoutAction } from "@/app/admin/_actions/auth";
import { cx } from "./ui";

const NAV = [
  { href: "/admin", label: "Табло", icon: LayoutDashboard, exact: true },
  { href: "/admin/poruchki", label: "Поръчки", icon: ShoppingBag, badge: "orders" as const },
  { href: "/admin/klienti", label: "Клиенти", icon: Users },
  { href: "/admin/produkti", label: "Продукти", icon: Package },
  { href: "/admin/kolektsii", label: "Колекции", icon: Layers },
  { href: "/admin/otstapki", label: "Отстъпки", icon: BadgePercent },
  { href: "/admin/otzivi", label: "Отзиви", icon: MessageSquareQuote, badge: "reviews" as const },
  { href: "/admin/stranitsi", label: "Страници", icon: FileText },
  { href: "/admin/blog", label: "Блог", icon: Newspaper },
  { href: "/admin/menyu", label: "Меню", icon: ListTree },
  { href: "/admin/tekstove", label: "Текстове в сайта", icon: Languages },
  { href: "/admin/abonati", label: "Абонати", icon: Mail },
  { href: "/admin/dostavka", label: "Доставка и плащане", icon: Truck },
  { href: "/admin/nastroyki", label: "Настройки", icon: Settings },
  { href: "/admin/profil", label: "Профил и парола", icon: UserRound },
];

export function AdminShell({
  username,
  storeName,
  newOrders,
  pendingReviews,
  children,
}: {
  username: string;
  storeName: string;
  newOrders: number;
  pendingReviews: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Escape closes the phone menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const counts = { orders: newOrders, reviews: pendingReviews };
  const nav = (
    <nav className="flex h-full flex-col" aria-label="Админ меню">
      <Link href="/admin" className="flex items-center gap-2.5 px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cdn/shop/files/pamaura-logo-white.svg" alt="" className="h-7 w-auto" />
        <span className="sr-only">{storeName}</span>
        <span className="ml-1 text-xs font-bold text-white/60">Админ панел</span>
      </Link>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map(({ href, label, icon: Icon, exact, badge }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          const n = badge ? counts[badge] : 0;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-3 rounded-xl px-3 py-2 font-bold transition",
                  active ? "bg-white text-ink" : "text-white/80 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1">{label}</span>
                {n ? (
                  <span className="grid h-6 min-w-6 place-items-center rounded-full bg-sun px-1.5 text-xs font-black text-ink" aria-label={`${n} нови`}>
                    {n}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="space-y-1 border-t border-white/10 p-3">
        <a href="/" target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl px-3 py-2 font-bold text-white/80 hover:bg-white/10 hover:text-white">
          <ExternalLink className="h-5 w-5" /> Виж сайта
        </a>
        <form action={logoutAction}>
          <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2 font-bold text-white/80 hover:bg-white/10 hover:text-white">
            <LogOut className="h-5 w-5" /> Изход <span className="ml-auto truncate text-xs font-semibold text-white/50">{username}</span>
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <div className="lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-ink lg:block">{nav}</aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white px-4 lg:hidden">
        <button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-canvas" aria-label="Меню" aria-expanded={open}>
          <Menu className="h-6 w-6" />
        </button>
        <span className="font-black">{storeName} · Админ</span>
        {newOrders ? (
          <Link href="/admin/poruchki" className="ml-auto flex items-center gap-1.5 rounded-full bg-sun px-3 py-1.5 text-sm font-extrabold text-ink" aria-label={`Поръчки: ${newOrders} нови`}>
            <ShoppingBag className="h-4 w-4" /> {newOrders}
          </Link>
        ) : null}
      </header>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Меню">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-full text-white hover:bg-white/10" aria-label="Затвори">
              <X className="h-5 w-5" />
            </button>
            {nav}
          </aside>
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
