/* eslint-disable @next/next/no-img-element -- thumbnails come resized from /cdn */
import type { Metadata } from "next";
import Link from "next/link";
import { ImageOff, Newspaper, Plus, Search } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fmtDate, fmtDateTime, getTranslation } from "@/lib/admin/common";
import { blogsList, listArticles } from "@/lib/admin/content";
import { fileUrl } from "@/lib/admin/uploads";
import { Badge, Card, Empty, PageHeader } from "@/components/admin/ui";
import { BlogTitleForm } from "./BlogTitleForm";

export const metadata: Metadata = { title: "Блог" };
export const dynamic = "force-dynamic";

type SP = Promise<{ q?: string; blog?: string }>;

export default async function BlogList({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = String(sp.q || "").slice(0, 100);
  const blogs = blogsList();
  const blogId = blogs.find((b) => String(b.id) === sp.blog)?.id ?? null;
  const rows = listArticles(q, blogId);
  const href = (b: number | null) => {
    const p = new URLSearchParams();
    if (b) p.set("blog", String(b));
    if (q) p.set("q", q);
    const s = p.toString();
    return `/admin/blog${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Блог"
        description="Статии и новини в сайта. Публикациите с бъдеща дата се появяват автоматично на тази дата."
        actions={
          <Link href={`/admin/blog/nova${blogId ? `?blog=${blogId}` : ""}`} className="btn btn-primary h-12 px-6">
            <Plus className="h-5 w-5" /> Нова публикация
          </Link>
        }
      />
      {blogs.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2" role="navigation" aria-label="Блог">
          <Link href={href(null)} className="chip" aria-current={blogId === null ? "page" : undefined}>
            Всички блогове
          </Link>
          {blogs.map((b) => (
            <Link key={b.id} href={href(b.id)} className="chip" aria-current={blogId === b.id ? "page" : undefined}>
              {b.title}
            </Link>
          ))}
        </div>
      ) : null}
      <form className="mb-5 flex gap-2" action="/admin/blog">
        {blogId ? <input type="hidden" name="blog" value={blogId} /> : null}
        <label className="flex flex-1 items-center rounded-[0.875rem] border-2 border-line bg-white focus-within:border-sky">
          <Search className="ml-3 h-5 w-5 text-muted" />
          <input name="q" defaultValue={q} placeholder="Заглавие, автор или етикет" className="w-full bg-transparent px-3 py-2.5 outline-none focus-visible:outline-none" aria-label="Търсене" />
        </label>
        <button className="btn btn-ghost h-12 px-5">Търси</button>
      </form>

      {rows.length ? (
        <div className="overflow-x-auto rounded-3xl border border-line bg-white">
          <table className="table">
            <thead>
              <tr>
                <th className="w-20">
                  <span className="sr-only">Снимка</span>
                </th>
                <th>Публикация</th>
                <th>Статус</th>
                <th>Дата</th>
                <th>Автор</th>
                <th>Етикети</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const thumb = fileUrl(a.image, 160);
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="grid h-12 w-16 place-items-center overflow-hidden rounded-xl bg-canvas">
                        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-5 w-5 text-muted" />}
                      </div>
                    </td>
                    <td className="min-w-64">
                      <Link href={`/admin/blog/${a.id}`} className="font-black hover:text-brand">
                        {a.title}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {blogs.length > 1 ? <span>{a.blog} ·</span> : null}
                        {a.roTitle ? <span>RO: {a.roTitle}</span> : null}
                        {a.roMissing ? <Badge tone="sun">няма пълен RO превод</Badge> : null}
                      </span>
                    </td>
                    <td>
                      {a.state === "published" ? <Badge tone="mint">Публикувана</Badge> : a.state === "scheduled" ? <Badge tone="sky">Насрочена</Badge> : <Badge tone="muted">Чернова</Badge>}
                    </td>
                    <td className="whitespace-nowrap text-sm text-ink-soft" title={fmtDateTime(a.publishedAt)}>
                      {fmtDate(a.publishedAt) || "—"}
                    </td>
                    <td className="text-sm">{a.author || "—"}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {a.tags.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={<Newspaper className="h-8 w-8" />} title={q ? "Няма намерени публикации" : "Все още няма публикации"}>
          {q ? "Опитайте с друго търсене." : "Напишете първата с бутона „Нова публикация“."}
        </Empty>
      )}

      <div className="mt-8 space-y-6">
        {blogs.map((b) => (
          <Card key={b.id} title={blogs.length > 1 ? `Блог „${b.title}“` : "Името на блога"} description={`Заглавието над списъка с публикации на /blogs/${b.handle}.`}>
            <BlogTitleForm blogId={b.id} initial={{ bg: b.title, ro: getTranslation("blog", b.id, "title") }} />
          </Card>
        ))}
      </div>
    </>
  );
}
