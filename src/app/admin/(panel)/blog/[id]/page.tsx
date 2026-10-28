import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { getTranslations } from "@/lib/admin/common";
import { articleRow, articleTags, blogsList, menusLinkingTo, parseTags, sofiaLocal, templateChoices } from "@/lib/admin/content";
import { fileUrl } from "@/lib/admin/uploads";
import { getCatalog } from "@/lib/catalog";
import { ArticleEditor } from "../ArticleEditor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = articleRow(Number((await params).id));
  return { title: a ? a.title : "Публикация" };
}

export default async function EditArticle({ params }: Props) {
  await requireAdmin();
  const id = Number((await params).id);
  const a = Number.isSafeInteger(id) ? articleRow(id) : null;
  if (!a) notFound();
  const ro = getTranslations("article", a.id);
  const blogs = blogsList();
  const blog = blogs.find((b) => b.id === a.blog_id);
  return (
    <>
      <Link href="/admin/blog" className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички публикации
      </Link>
      <ArticleEditor
        key={a.id}
        initial={{
          id: a.id,
          blogId: a.blog_id,
          title: { bg: a.title, ro: ro.title ?? "" },
          handle: a.handle,
          author: a.author,
          body: { bg: a.body_html, ro: ro.body_html ?? "" },
          excerpt: { bg: a.summary_html, ro: ro.summary_html ?? "" },
          image: a.image_file ?? "",
          imageAlt: a.image_alt ?? "",
          tags: parseTags(a.tags),
          template: a.template_suffix ?? "",
          published: !!a.published,
          publishedAt: sofiaLocal(a.published_at),
          seoTitle: { bg: a.seo_title ?? "", ro: ro.seo_title ?? "" },
          seoDescription: { bg: a.seo_description ?? "", ro: ro.seo_description ?? "" },
        }}
        blogs={blogs}
        templates={templateChoices("article", a.template_suffix)}
        domain={getCatalog().shop.domain}
        tagSuggestions={articleTags()}
        imageUrl={fileUrl(a.image_file, 600)}
        menuRefs={blog ? menusLinkingTo(`/blogs/${blog.handle}/${a.handle}`) : []}
        nowLocal={sofiaLocal(new Date().toISOString())}
      />
    </>
  );
}
