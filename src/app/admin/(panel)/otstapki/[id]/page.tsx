import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fmtDateTime } from "@/lib/admin/common";
import { STATE_LABELS, discountById, discountState, isoToSofiaLocal, parseAppliesTo } from "@/lib/admin/discounts";
import { Badge } from "@/components/admin/ui";
import { Notice } from "@/components/admin/settings/ListTools";
import { DiscountEditor } from "../DiscountEditor";
import { pickers } from "../pickers";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ nov?: string }> };

function load(raw: string) {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? discountById(id) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireAdmin();
  const d = load((await params).id);
  return { title: d ? `Отстъпка ${d.code}` : "Отстъпка" };
}

export default async function DiscountPage({ params, searchParams }: Props) {
  await requireAdmin();
  const d = load((await params).id);
  if (!d) notFound();
  const created = (await searchParams).nov === "1";
  const { products, collections } = pickers();
  const applies = parseAppliesTo(d.applies_to);
  const state = STATE_LABELS[discountState(d)];
  const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");

  return (
    <>
      <Link href="/admin/otstapki" className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички отстъпки
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-3xl font-black tracking-wide">{d.code}</h1>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      {created ? (
        <Notice tone="ok" className="mb-6">
          Кодът {d.code} е създаден{d.enabled ? " и вече работи в сайта" : " (изключен е — включете го, когато искате да работи)"}.
        </Notice>
      ) : null}
      <DiscountEditor
        key={d.id}
        id={d.id}
        initial={{
          code: d.code,
          kind: d.kind,
          percent: d.kind === "percentage" ? String(d.value) : "10",
          amount: d.kind === "fixed_amount" ? money(d.value) : "",
          min: d.min_subtotal ? money(d.min_subtotal) : "",
          applies: applies.type,
          productIds: applies.type === "products" ? (applies.ids ?? []) : [],
          collectionIds: applies.type === "collections" ? (applies.ids ?? []) : [],
          starts_at: isoToSofiaLocal(d.starts_at),
          ends_at: isoToSofiaLocal(d.ends_at),
          limit: d.usage_limit === null ? "" : String(d.usage_limit),
          once: Boolean(d.once_per_customer),
          enabled: Boolean(d.enabled),
          note: d.note ?? "",
        }}
        products={products}
        collections={collections}
        stats={{ times_used: d.times_used, created: fmtDateTime(d.created_at), state }}
      />
    </>
  );
}
