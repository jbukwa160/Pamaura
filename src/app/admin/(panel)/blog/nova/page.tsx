import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { articleTags, blogsList, sofiaLocal, templateChoices } from "@/lib/admin/content";
import { getCatalog } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { ArticleEditor } from "../ArticleEditor";

export const metadata: Metadata = { title: "Нова публикация" };
export const dynamic = "force-dynamic";

export default async function NewArticle({ searchParams }: { searchParams: Promise<{ blog?: string }> }) {
  const admin = await requireAdmin();
  const blogs = blogsList();
  if (!blogs.length) redirect("/admin/blog");
  const wanted = (await searchParams).blog;
  const blogId = blogs.find((b) => String(b.id) === wanted)?.id ?? blogs[0].id;
  // the author of the latest post is most likely the one writing the next
  const last = getDb().prepare("SELECT author FROM articles WHERE author != '' ORDER BY created_at DESC, id DESC LIMIT 1").get() as { author: string } | undefined;
  const empty = { bg: "", ro: "" };
  return (
    <>
      <Link href="/admin/blog" className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички публикации
      </Link>
      <ArticleEditor
        initial={{
          id: null,
          blogId,
          title: empty,
          handle: "",
          author: last?.author ?? admin.username,
          body: empty,
          excerpt: empty,
          image: "",
          imageAlt: "",
          tags: [],
          template: "",
          published: true,
          publishedAt: "",
          seoTitle: empty,
          seoDescription: empty,
        }}
        blogs={blogs}
        templates={templateChoices("article")}
        domain={getCatalog().shop.domain}
        tagSuggestions={articleTags()}
        imageUrl=""
        menuRefs={[]}
        nowLocal={sofiaLocal(new Date().toISOString())}
      />
    </>
  );
}
