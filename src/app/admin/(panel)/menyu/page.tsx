import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { linkTargets, menusForEdit } from "@/lib/admin/content";
import { PageHeader } from "@/components/admin/ui";
import { MenuEditor } from "./MenuEditor";

export const metadata: Metadata = { title: "Меню" };
export const dynamic = "force-dynamic";

export default async function MenusPage({ searchParams }: { searchParams: Promise<{ menu?: string }> }) {
  await requireAdmin();
  const menu = String((await searchParams).menu || "").slice(0, 100);
  return (
    <>
      <PageHeader
        title="Меню"
        description="Връзките в горната част на сайта и в колоните най-долу. Подредете ги със стрелките; румънското заглавие е по желание (празно = българското)."
      />
      <MenuEditor menus={menusForEdit()} targets={linkTargets()} initial={menu} />
    </>
  );
}
