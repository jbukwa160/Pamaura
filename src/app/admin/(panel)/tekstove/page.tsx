import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { themeTextGroups } from "@/lib/admin/theme-texts";
import { PageHeader } from "@/components/admin/ui";
import { TextsEditor } from "./TextsEditor";

export const metadata: Metadata = { title: "Текстове в сайта" };
export const dynamic = "force-dynamic";

export default async function ThemeTextsPage() {
  await requireAdmin();
  const groups = themeTextGroups();
  return (
    <>
      <PageHeader
        title="Текстове в сайта"
        description="Заглавията, описанията и бутоните в секциите на сайта — на български и румънски. Дизайнът не се променя, сменя се само текстът."
      />
      <TextsEditor groups={groups} />
    </>
  );
}
