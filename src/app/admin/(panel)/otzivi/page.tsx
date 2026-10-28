import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, MessageSquareQuote, Plus, Search } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { sofiaDay } from "@/lib/admin/common";
import { REVIEW_STATUSES, isReviewStatus, listReviews, reviewProducts, reviewStatusCounts, shopReviewCount, type ReviewFilter } from "@/lib/admin/reviews";
import { Empty, PageHeader } from "@/components/admin/ui";
import { AddReviewForm } from "./AddReviewForm";
import { FilterSelect } from "./FilterSelect";
import { ReviewCard } from "./ReviewCard";

export const metadata: Metadata = { title: "Отзиви" };
export const dynamic = "force-dynamic";

type SP = Promise<{ status?: string; product?: string; rating?: string; q?: string; page?: string; add?: string; added?: string }>;

export default async function ReviewsPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const filter: ReviewFilter = {
    status: isReviewStatus(sp.status) ? sp.status : "all",
    product: sp.product === "shop" || /^\d{1,20}$/.test(sp.product || "") ? sp.product! : "",
    rating: /^[1-5]$/.test(sp.rating || "") ? Number(sp.rating) : null,
    q: String(sp.q || "").slice(0, 100),
    page: Math.max(1, Number(sp.page) || 1),
  };
  const { rows, total, pages, page } = listReviews(filter);
  const counts = reviewStatusCounts();
  const products = reviewProducts();
  const shopReviews = shopReviewCount();
  const adding = sp.add === "1";
  const filtered = !!(filter.product || filter.rating || filter.q);

  const href = (o: Partial<ReviewFilter>) => {
    const f = { ...filter, page: 1, ...o };
    const p = new URLSearchParams();
    if (f.status !== "all") p.set("status", f.status);
    if (f.product) p.set("product", f.product);
    if (f.rating) p.set("rating", String(f.rating));
    if (f.q) p.set("q", f.q);
    if (f.page > 1) p.set("page", String(f.page));
    const s = p.toString();
    return `/admin/otzivi${s ? `?${s}` : ""}`;
  };
  const tabs = [{ key: "all", label: "Всички" }, ...REVIEW_STATUSES.map((s) => ({ key: s.key, label: s.label }))] as const;

  return (
    <>
      <PageHeader
        title="Отзиви"
        description="Мненията на клиентите за продуктите. В сайта се виждат само публикуваните; новите чакат одобрение тук."
        actions={
          adding ? null : (
            <Link href="/admin/otzivi?add=1" className="btn btn-primary h-12 px-6">
              <Plus className="h-5 w-5" /> Добави отзив
            </Link>
          )
        }
      />

      {adding ? (
        <div className="mb-6">
          <AddReviewForm products={products.map(({ id, title, status }) => ({ id, title, status }))} today={sofiaDay(new Date())} />
        </div>
      ) : null}
      {sp.added === "1" && !adding ? (
        <p className="mb-4 flex items-center gap-2 rounded-2xl bg-mint-soft p-4 font-bold text-mint" role="status">
          <CircleCheck className="h-5 w-5" /> Отзивът е добавен.
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2" role="navigation" aria-label="Статус">
        {tabs.map((t) => (
          <Link key={t.key} href={href({ status: t.key })} className="chip" aria-current={filter.status === t.key ? "page" : undefined}>
            {t.label}
            <span className="text-xs opacity-70">{counts[t.key] ?? 0}</span>
          </Link>
        ))}
      </div>
      <form className="mb-5 flex flex-wrap gap-2" action="/admin/otzivi">
        {filter.status !== "all" ? <input type="hidden" name="status" value={filter.status} /> : null}
        <FilterSelect name="product" defaultValue={filter.product} aria-label="Продукт" className="w-auto min-w-0 flex-1 basis-56">
          <option value="">Всички продукти</option>
          {shopReviews ? <option value="shop">Отзиви за магазина ({shopReviews})</option> : null}
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} ({p.reviews})
            </option>
          ))}
        </FilterSelect>
        <FilterSelect name="rating" defaultValue={filter.rating ? String(filter.rating) : ""} aria-label="Оценка" className="w-auto basis-40">
          <option value="">Всички оценки</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {"★".repeat(n)}
              {"☆".repeat(5 - n)} ({n})
            </option>
          ))}
        </FilterSelect>
        <label className="flex min-w-0 flex-1 basis-56 items-center rounded-[0.875rem] border-2 border-line bg-white focus-within:border-sky">
          <Search className="ml-3 h-5 w-5 shrink-0 text-muted" />
          <input name="q" defaultValue={filter.q} placeholder="Име, текст или имейл" className="w-full min-w-0 bg-transparent px-3 py-2.5 outline-none focus-visible:outline-none" aria-label="Търсене" />
        </label>
        <button className="btn btn-ghost h-12 px-5">Филтрирай</button>
        {filtered ? (
          <Link href={href({ product: "", rating: null, q: "" })} className="btn btn-ghost h-12 px-5">
            Изчисти
          </Link>
        ) : null}
      </form>

      {rows.length ? (
        <div className="space-y-4">
          {rows.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      ) : (
        <Empty icon={<MessageSquareQuote className="h-8 w-8" />} title={filter.status === "pending" && !filtered ? "Няма отзиви за одобрение" : "Няма намерени отзиви"}>
          {filter.status === "pending" && !filtered ? "Всички нови отзиви са прегледани." : filtered ? "Опитайте с други филтри." : "Отзивите от клиентите ще се появят тук."}
        </Empty>
      )}

      {pages > 1 || rows.length ? (
        <nav className="mt-5 flex flex-wrap items-center justify-between gap-3" aria-label="Страници">
          <span className="text-sm font-bold text-muted">
            {total} отзива{pages > 1 ? ` · страница ${page} от ${pages}` : ""}
          </span>
          {pages > 1 ? (
            <span className="flex gap-2">
              {page > 1 ? (
                <Link href={href({ page: page - 1 })} className="btn btn-ghost h-10 px-4 text-sm">
                  ← Предишна
                </Link>
              ) : null}
              {page < pages ? (
                <Link href={href({ page: page + 1 })} className="btn btn-ghost h-10 px-4 text-sm">
                  Следваща →
                </Link>
              ) : null}
            </span>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
