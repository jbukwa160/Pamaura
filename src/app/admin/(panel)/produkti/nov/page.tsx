import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { PageHeader } from "@/components/admin/ui";
import { NewProductForm } from "./NewProductForm";

export const metadata: Metadata = { title: "Нов продукт" };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireAdmin();
  return (
    <>
      <Link href="/admin/produkti" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Продукти
      </Link>
      <PageHeader title="Нов продукт" description="Започнете с най-важното. След създаването ще можете да добавите описание, снимки, варианти и преводи." />
      <NewProductForm />
    </>
  );
}
