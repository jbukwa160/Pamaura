import type { Metadata } from "next";
import Link from "next/link";
import { BadgePercent, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fmtDateTime, money } from "@/lib/admin/common";
import { STATE_LABELS, appliesText, discountState, parseAppliesTo } from "@/lib/admin/discounts";
import { listDiscounts, type DiscountRec } from "@/lib/discounts";
import { Badge, Empty, PageHeader } from "@/components/admin/ui";
import { DiscountRowActions } from "./DiscountRowActions";
import { AutoDiscountsEditor } from "./AutoDiscountsEditor";
import { automaticDiscounts } from "@/lib/auto-discounts";
import { getDb } from "@/lib/db";
import { Card } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Отстъпки" };
export const dynamic = "force-dynamic";

function valueText(d: DiscountRec) {
  if (d.kind === "percentage") return `−${d.value}%`;
  if (d.kind === "fixed_amount") return `−${money(d.value)}`;
  return "Безплатна доставка";
}

function datesText(d: DiscountRec) {
  if (d.starts_at && d.ends_at) return `${fmtDateTime(d.starts_at)} – ${fmtDateTime(d.ends_at)}`;
  if (d.starts_at) return `от ${fmtDateTime(d.starts_at)}`;
  if (d.ends_at) return `до ${fmtDateTime(d.ends_at)}`;
  return "без срок";
}

export default async function DiscountsPage() {
  await requireAdmin();
  const rows = listDiscounts();
  const usedBy = getDb().prepare("SELECT discount_title AS t, COUNT(*) AS n FROM orders WHERE discount_title IS NOT NULL GROUP BY discount_title").all() as { t: string; n: number }[];
  const auto = automaticDiscounts().map((d) => ({ ...d, used: usedBy.find((u) => u.t === d.title)?.n ?? 0 }));

  return (
    <>
      <PageHeader
        title="Отстъпки"
        description="Кодове за отстъпка, които клиентите въвеждат при поръчка. Сумите са в евро — в румънския сайт се превръщат в леи по курса."
        actions={
          <Link href="/admin/otstapki/nov" className="btn btn-primary h-12 px-6">
            <Plus className="h-5 w-5" /> Нов код
          </Link>
        }
      />
      <Card
        className="mb-6"
        title="Автоматични отстъпки (без код)"
        description="Прилагат се сами в количката и при поръчка — като „Bundle & Save“ в сайта досега: 15% от 3 продукта нагоре (бройките се събират; вариант „2 БРОЯ“ е един продукт). Не се комбинират с код за отстъпка — клиентът получава по-голямата."
      >
        <AutoDiscountsEditor rows={auto} />
      </Card>
      <h2 className="mb-3 text-xl font-black">Кодове за отстъпка</h2>
      {rows.length ? (
        <div className="relative overflow-x-auto rounded-3xl border border-line bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Код</th>
                <th>Отстъпка</th>
                <th>Условия</th>
                <th>Валидност</th>
                <th className="text-right">Използван</th>
                <th>Статус</th>
                <th>
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const st = STATE_LABELS[discountState(d)];
                return (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/admin/otstapki/${d.id}`} className="font-mono text-[1.05rem] font-black tracking-wide hover:text-brand">
                        {d.code}
                      </Link>
                      {d.note ? <span className="block max-w-56 truncate text-xs text-muted">{d.note}</span> : null}
                    </td>
                    <td className="whitespace-nowrap font-extrabold">{valueText(d)}</td>
                    <td className="text-sm">
                      <span className="block">{appliesText(parseAppliesTo(d.applies_to))}</span>
                      {d.min_subtotal ? <span className="block text-muted">поръчка над {money(d.min_subtotal)}</span> : null}
                      {d.once_per_customer ? <span className="block text-muted">веднъж на клиент</span> : null}
                    </td>
                    <td className="text-sm text-ink-soft">{datesText(d)}</td>
                    <td className="whitespace-nowrap text-right font-bold">
                      {d.times_used}
                      {d.usage_limit !== null ? <span className="font-normal text-muted"> / {d.usage_limit}</span> : null}
                    </td>
                    <td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                    <td className="text-right">
                      <DiscountRowActions id={d.id} code={d.code} enabled={Boolean(d.enabled)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={<BadgePercent className="h-8 w-8" />} title="Няма кодове за отстъпка">
          Създайте първия код с бутона „Нов код“.
        </Empty>
      )}
      <p className="mt-4 text-sm text-muted">„Използван“ брои направените поръчки с кода (включително по-късно отказаните).</p>
    </>
  );
}
