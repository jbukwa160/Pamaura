import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { templateChoices } from "@/lib/admin/content";
import { getCatalog } from "@/lib/catalog";
import { PageEditor } from "../PageEditor";

export const metadata: Metadata = { title: "Нова страница" };
export const dynamic = "force-dynamic";

export default async function NewPage() {
  await requireAdmin();
  const empty = { bg: "", ro: "" };
  return (
    <>
      <Link href="/admin/stranitsi" className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички страници
      </Link>
      <PageEditor
        initial={{ id: null, title: empty, handle: "", body: empty, template: "", published: true, seoTitle: empty, seoDescription: empty }}
        templates={templateChoices("page")}
        domain={getCatalog().shop.domain}
        menuRefs={[]}
      />
    </>
  );
}
