import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { PageHeader } from "@/components/admin/ui";
import { DiscountEditor } from "../DiscountEditor";
import { pickers } from "../pickers";

export const metadata: Metadata = { title: "Нов код за отстъпка" };
export const dynamic = "force-dynamic";

export default async function NewDiscountPage() {
  await requireAdmin();
  const { products, collections } = pickers();
  return (
    <>
      <Link href="/admin/otstapki" className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички отстъпки
      </Link>
      <PageHeader title="Нов код за отстъпка" description="Попълнете кода и отстъпката. Кодът работи веднага след създаването, ако е включен." />
      <DiscountEditor
        id={null}
        initial={{
          code: "",
          kind: "percentage",
          percent: "10",
          amount: "",
          min: "",
          applies: "all",
          productIds: [],
          collectionIds: [],
          starts_at: "",
          ends_at: "",
          limit: "",
          once: false,
          enabled: true,
          note: "",
        }}
        products={products}
        collections={collections}
      />
    </>
  );
}
