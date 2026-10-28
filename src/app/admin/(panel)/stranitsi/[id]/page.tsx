import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { getTranslations } from "@/lib/admin/common";
import { menusLinkingTo, pageRow, templateChoices } from "@/lib/admin/content";
import { getCatalog } from "@/lib/catalog";
import { PageEditor } from "../PageEditor";

export const dynamic = "force-dynamic";
// Editor of one page; the editor is keyed by id so switching pages starts with fresh state.

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = pageRow(Number((await params).id));
  return { title: p ? p.title : "Страница" };
}

export default async function EditPage({ params }: Props) {
  await requireAdmin();
  const id = Number((await params).id);
  const p = Number.isSafeInteger(id) ? pageRow(id) : null;
  if (!p) notFound();
  const ro = getTranslations("page", p.id);
  return (
    <>
      <Link href="/admin/stranitsi" className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички страници
      </Link>
      <PageEditor
        key={p.id}
        initial={{
          id: p.id,
          title: { bg: p.title, ro: ro.title ?? "" },
          handle: p.handle,
          body: { bg: p.body_html, ro: ro.body_html ?? "" },
          template: p.template_suffix ?? "",
          published: !!p.published,
          seoTitle: { bg: p.seo_title ?? "", ro: ro.seo_title ?? "" },
          seoDescription: { bg: p.seo_description ?? "", ro: ro.seo_description ?? "" },
        }}
        templates={templateChoices("page", p.template_suffix)}
        domain={getCatalog().shop.domain}
        menuRefs={menusLinkingTo(`/pages/${p.handle}`)}
      />
    </>
  );
}
