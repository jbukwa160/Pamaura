"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { catalogChanged, setTranslation } from "@/lib/admin/common";
import { bgro, errorResult, moveLinks, sofiaLocal, sofiaLocalToIso, str, templateChoices } from "@/lib/admin/content";
import { getDb, nowIso } from "@/lib/db";
import { isValidHandle } from "@/components/admin/content/handles";
import { TAG_MAX, type ArticleForm, type SaveResult } from "@/components/admin/content/types";

const BODY_MAX = 500_000; // characters of HTML

function rowId(v: unknown): number | null {
  const id = Number(v);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function cleanTags(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > 30) return null;
  const out: string[] = [];
  for (const t of v) {
    if (typeof t !== "string") return null;
    const s = t.trim().replace(/\s+/g, " ");
    if (!s || s.length > TAG_MAX || s.includes(",")) return null;
    if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

/** Creates (id = null) or updates a blog post with its Romanian texts. */
export async function saveArticleAction(input: ArticleForm, opts: { redirect?: boolean } = {}): Promise<SaveResult> {
  await requireAdmin();
  try {
    const id = input?.id == null ? null : rowId(input.id);
    if (input?.id != null && id === null) return { error: "Невалидна публикация." };
    const blogId = rowId(input.blogId);
    const title = bgro(input.title, 255, "Заглавие");
    const body = bgro(input.body, BODY_MAX, "Текст", false);
    const excerpt = bgro(input.excerpt, 50_000, "Кратко описание", false);
    const seoTitle = bgro(input.seoTitle, 255, "Заглавие в Google");
    const seoDescription = bgro(input.seoDescription, 1000, "Описание в Google");
    const handle = str(input.handle, 200, "Адрес").trim();
    const author = str(input.author, 100, "Автор").trim();
    const image = str(input.image, 300, "Снимка").trim();
    const imageAlt = str(input.imageAlt, 512, "Описание на снимката").trim();
    const template = str(input.template, 100, "Шаблон");
    const publishedAtLocal = str(input.publishedAt, 20, "Дата").trim();
    const published = input.published === true;
    const tags = cleanTags(input.tags);
    if (!title.bg) return { error: "Попълнете заглавието." };
    if (!isValidHandle(handle)) return { error: "Адресът може да съдържа само малки букви, цифри и тирета." };
    if (!tags) return { error: `Етикетите трябва да са до 30, всеки до ${TAG_MAX} знака и без запетаи.` };

    const db = getDb();
    const blog = blogId === null ? undefined : (db.prepare("SELECT id, handle FROM blogs WHERE id = ?").get(blogId) as { id: number; handle: string } | undefined);
    if (!blog) return { error: "Изберете блог." };
    const current =
      id === null
        ? null
        : (db.prepare("SELECT a.handle, a.template_suffix, a.published_at, b.handle AS blog FROM articles a JOIN blogs b ON b.id = a.blog_id WHERE a.id = ?").get(id) as
            | { handle: string; template_suffix: string | null; published_at: string | null; blog: string }
            | undefined);
    if (id !== null && !current) return { error: "Публикацията вече не съществува (може да е изтрита)." };
    if (!templateChoices("article", current?.template_suffix ?? null).some((t) => t.value === template)) return { error: "Невалиден шаблон." };
    if (image && !db.prepare("SELECT 1 FROM files WHERE name = ?").get(image)) return { error: "Снимката не е намерена — качете я отново." };
    if (db.prepare("SELECT 1 FROM articles WHERE blog_id = ? AND handle = ? AND id != ?").get(blog.id, handle, id ?? 0)) {
      return { error: `Вече има публикация с адрес /blogs/${blog.handle}/${handle}. Изберете друг адрес.` };
    }

    const now = nowIso();
    let publishedAt: string | null;
    if (publishedAtLocal) {
      // an unchanged date keeps its stored value exactly
      publishedAt = current?.published_at && sofiaLocal(current.published_at) === publishedAtLocal ? current.published_at : sofiaLocalToIso(publishedAtLocal);
      if (!publishedAt) return { error: "Невалидна дата на публикуване." };
    } else publishedAt = published ? now : null;

    let savedId = id ?? 0;
    db.transaction(() => {
      const values = [
        blog.id,
        handle,
        title.bg,
        author,
        body.bg,
        excerpt.bg.trim() ? excerpt.bg : "",
        image || null,
        imageAlt || null,
        JSON.stringify(tags),
        template || null,
        published ? 1 : 0,
        publishedAt,
        now,
        seoTitle.bg || null,
        seoDescription.bg || null,
      ];
      if (id === null) {
        const r = db
          .prepare(
            `INSERT INTO articles(blog_id, handle, title, author, body_html, summary_html, image_file, image_alt, tags, template_suffix, published, published_at, updated_at, seo_title, seo_description, created_at)
             VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(...values, now);
        savedId = Number(r.lastInsertRowid);
      } else {
        db.prepare(
          `UPDATE articles SET blog_id = ?, handle = ?, title = ?, author = ?, body_html = ?, summary_html = ?, image_file = ?, image_alt = ?, tags = ?, template_suffix = ?,
           published = ?, published_at = ?, updated_at = ?, seo_title = ?, seo_description = ? WHERE id = ?`,
        ).run(...values, id);
        const oldPath = `/blogs/${current!.blog}/${current!.handle}`;
        const newPath = `/blogs/${blog.handle}/${handle}`;
        if (oldPath !== newPath) moveLinks(oldPath, newPath, opts.redirect !== false);
      }
      setTranslation("article", savedId, "title", title.ro);
      setTranslation("article", savedId, "body_html", body.ro.trim() ? body.ro : "");
      setTranslation("article", savedId, "summary_html", excerpt.ro.trim() ? excerpt.ro : "");
      setTranslation("article", savedId, "seo_title", seoTitle.ro);
      setTranslation("article", savedId, "seo_description", seoDescription.ro);
    })();
    catalogChanged();
    revalidatePath("/admin/blog");
    return { ok: true, id: savedId };
  } catch (e) {
    return errorResult(e);
  }
}

export async function deleteArticleAction(id: number): Promise<SaveResult> {
  await requireAdmin();
  const aid = rowId(id);
  if (aid === null) return { error: "Невалидна публикация." };
  const db = getDb();
  const a = db.prepare("SELECT a.handle, b.handle AS blog FROM articles a JOIN blogs b ON b.id = a.blog_id WHERE a.id = ?").get(aid) as { handle: string; blog: string } | undefined;
  if (!a) return { error: "Публикацията вече не съществува." };
  db.transaction(() => {
    // redirects to the deleted post would only lead to "not found"
    db.prepare("DELETE FROM redirects WHERE target = ?").run(`/blogs/${a.blog}/${a.handle}`);
    db.prepare("DELETE FROM articles WHERE id = ?").run(aid);
    db.prepare("DELETE FROM translations WHERE owner_type = 'article' AND owner_id = ?").run(String(aid));
    db.prepare("DELETE FROM metafields WHERE owner_type = 'article' AND owner_id = ?").run(aid);
  })();
  catalogChanged();
  revalidatePath("/admin/blog");
  return { ok: true };
}

/** The blog's own name (shown above its list of posts). */
export async function saveBlogTitleAction(blogId: number, title: { bg: string; ro: string }): Promise<SaveResult> {
  await requireAdmin();
  try {
    const id = rowId(blogId);
    const t = bgro(title, 255, "Име на блога");
    if (id === null || !getDb().prepare("SELECT 1 FROM blogs WHERE id = ?").get(id)) return { error: "Блогът не е намерен." };
    if (!t.bg) return { error: "Попълнете името на блога." };
    getDb().prepare("UPDATE blogs SET title = ?, updated_at = ? WHERE id = ?").run(t.bg, nowIso(), id);
    setTranslation("blog", id, "title", t.ro);
    catalogChanged();
    revalidatePath("/admin/blog");
    return { ok: true };
  } catch (e) {
    return errorResult(e);
  }
}
