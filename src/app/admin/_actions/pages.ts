"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { catalogChanged, setTranslation } from "@/lib/admin/common";
import { bgro, errorResult, moveLinks, str, templateChoices } from "@/lib/admin/content";
import { getDb, nowIso } from "@/lib/db";
import { isValidHandle } from "@/components/admin/content/handles";
import type { PageForm, SaveResult } from "@/components/admin/content/types";

const BODY_MAX = 500_000;

function pageId(v: unknown): number | null {
  const id = Number(v);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Creates (id = null) or updates a page with its Romanian texts. */
export async function savePageAction(input: PageForm, opts: { redirect?: boolean } = {}): Promise<SaveResult> {
  await requireAdmin();
  try {
    const id = input?.id == null ? null : pageId(input.id);
    if (input?.id != null && id === null) return { error: "Невалидна страница." };
    const title = bgro(input.title, 255, "Заглавие");
    const body = bgro(input.body, BODY_MAX, "Текст", false);
    const seoTitle = bgro(input.seoTitle, 255, "Заглавие в Google");
    const seoDescription = bgro(input.seoDescription, 1000, "Описание в Google");
    const handle = str(input.handle, 200, "Адрес").trim();
    const template = str(input.template, 100, "Шаблон");
    const published = input.published === true;
    if (!title.bg) return { error: "Попълнете заглавието." };
    if (!isValidHandle(handle)) return { error: "Адресът може да съдържа само малки букви, цифри и тирета." };

    const db = getDb();
    const current = id === null ? null : (db.prepare("SELECT handle, template_suffix, published_at FROM pages WHERE id = ?").get(id) as { handle: string; template_suffix: string | null; published_at: string | null } | undefined);
    if (id !== null && !current) return { error: "Страницата вече не съществува (може да е изтрита)." };
    if (!templateChoices("page", current?.template_suffix ?? null).some((t) => t.value === template)) return { error: "Невалиден шаблон." };
    if (db.prepare("SELECT 1 FROM pages WHERE handle = ? AND id != ?").get(handle, id ?? 0)) return { error: `Вече има страница с адрес /pages/${handle}. Изберете друг адрес.` };

    const now = nowIso();
    let savedId = id ?? 0;
    db.transaction(() => {
      if (id === null) {
        const r = db
          .prepare(
            "INSERT INTO pages(handle, title, body_html, template_suffix, published, created_at, updated_at, published_at, seo_title, seo_description) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(handle, title.bg, body.bg, template || null, published ? 1 : 0, now, now, published ? now : null, seoTitle.bg || null, seoDescription.bg || null);
        savedId = Number(r.lastInsertRowid);
      } else {
        db.prepare("UPDATE pages SET handle = ?, title = ?, body_html = ?, template_suffix = ?, published = ?, published_at = ?, updated_at = ?, seo_title = ?, seo_description = ? WHERE id = ?").run(
          handle,
          title.bg,
          body.bg,
          template || null,
          published ? 1 : 0,
          current!.published_at ?? (published ? now : null),
          now,
          seoTitle.bg || null,
          seoDescription.bg || null,
          id,
        );
        if (current!.handle !== handle) moveLinks(`/pages/${current!.handle}`, `/pages/${handle}`, opts.redirect !== false);
      }
      setTranslation("page", savedId, "title", title.ro);
      setTranslation("page", savedId, "body_html", body.ro.trim() ? body.ro : "");
      setTranslation("page", savedId, "seo_title", seoTitle.ro);
      setTranslation("page", savedId, "seo_description", seoDescription.ro);
    })();
    catalogChanged();
    revalidatePath("/admin/stranitsi");
    return { ok: true, id: savedId };
  } catch (e) {
    return errorResult(e);
  }
}

export async function deletePageAction(id: number): Promise<SaveResult> {
  await requireAdmin();
  const pid = pageId(id);
  if (pid === null) return { error: "Невалидна страница." };
  const db = getDb();
  const page = db.prepare("SELECT handle FROM pages WHERE id = ?").get(pid) as { handle: string } | undefined;
  if (!page) return { error: "Страницата вече не съществува." };
  db.transaction(() => {
    // redirects to the deleted page would only lead to "not found"
    db.prepare("DELETE FROM redirects WHERE target = ?").run(`/pages/${page.handle}`);
    db.prepare("DELETE FROM pages WHERE id = ?").run(pid);
    db.prepare("DELETE FROM translations WHERE owner_type = 'page' AND owner_id = ?").run(String(pid));
    db.prepare("DELETE FROM metafields WHERE owner_type = 'page' AND owner_id = ?").run(pid);
  })();
  catalogChanged();
  revalidatePath("/admin/stranitsi");
  return { ok: true };
}
