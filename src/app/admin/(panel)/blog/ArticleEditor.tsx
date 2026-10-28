"use client";
// Editor of a blog post: texts in Bulgarian and Romanian, picture, tags, publishing date, address and SEO.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash } from "lucide-react";
import { deleteArticleAction, saveArticleAction } from "@/app/admin/_actions/blog";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { BgRoInput, Card, ConfirmButton, Field, SaveBar, Select, TextInput, Toggle, useEditor } from "@/components/admin/ui";
import { HandleField } from "@/components/admin/content/HandleField";
import { BgRoHtml } from "@/components/admin/content/HtmlEditor";
import { SeoFields } from "@/components/admin/content/SeoFields";
import { TagsInput } from "@/components/admin/content/TagsInput";
import { isValidHandle, toHandle } from "@/components/admin/content/handles";
import type { ArticleForm, TemplateChoice } from "@/components/admin/content/types";

export function ArticleEditor({
  initial,
  blogs,
  templates,
  domain,
  tagSuggestions,
  imageUrl,
  menuRefs,
  nowLocal,
}: {
  initial: ArticleForm;
  blogs: { id: number; handle: string; title: string }[];
  templates: TemplateChoice[];
  domain: string;
  tagSuggestions: string[];
  imageUrl: string;
  menuRefs: string[];
  /** "YYYY-MM-DDTHH:mm" in Sofia, to tell a future (scheduled) date */
  nowLocal: string;
}) {
  const router = useRouter();
  const isNew = initial.id === null;
  const [redirect, setRedirect] = useState(true);
  const [autoHandle, setAutoHandle] = useState(isNew);
  const [showErrors, setShowErrors] = useState(false);
  const [preview, setPreview] = useState(imageUrl);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const ed = useEditor<ArticleForm>(initial, async (v) => {
    if (!v.title.bg.trim() || !isValidHandle(v.handle)) {
      setShowErrors(true);
      return { error: "Поправете отбелязаните полета." };
    }
    const r = await saveArticleAction(v, { redirect });
    if (r.ok && isNew && r.id) router.replace(`/admin/blog/${r.id}`);
    else if (r.ok) router.refresh();
    return r;
  });
  const v = ed.value;
  const set = (patch: Partial<ArticleForm>) => ed.setValue((cur) => ({ ...cur, ...patch }));
  const blog = blogs.find((b) => b.id === v.blogId) ?? blogs[0];
  const savedBlog = blogs.find((b) => b.id === initial.blogId) ?? blogs[0];
  const titleError = showErrors && !v.title.bg.trim() ? "Попълнете заглавието." : undefined;
  const handleError = showErrors && !isValidHandle(v.handle) ? "Попълнете адрес — малки букви, цифри и тирета." : undefined;
  const scheduled = v.published && !!v.publishedAt && v.publishedAt > nowLocal;
  const live = !isNew && initial.published && !(initial.publishedAt && initial.publishedAt > nowLocal);
  const articlePath = `/blogs/${encodeURIComponent(savedBlog?.handle ?? "")}/${encodeURIComponent(initial.handle)}`;
  // what Google gets without its own description: the excerpt, else the text (as the shop does)
  const fallbackHtml = { bg: v.excerpt.bg.trim() || v.body.bg, ro: v.excerpt.ro.trim() || v.excerpt.bg.trim() || v.body.ro.trim() || v.body.bg };

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    const r = await deleteArticleAction(initial.id!);
    if (r.ok) router.push("/admin/blog");
    else {
      setDeleteError(r.error ?? "Публикацията не беше изтрита.");
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-3xl font-black tracking-tight">{isNew ? "Нова публикация" : initial.title.bg || "Публикация"}</h1>
        {live ? (
          <span className="ml-auto flex flex-wrap gap-2">
            <a href={`/bg-bg${articlePath}`} target="_blank" rel="noopener" className="btn btn-ghost h-10 px-4 text-sm">
              <ExternalLink className="h-4 w-4" /> Виж в сайта
            </a>
            <a href={`/ro-ro${articlePath}`} target="_blank" rel="noopener" className="btn btn-ghost h-10 px-4 text-sm">
              <ExternalLink className="h-4 w-4" /> RO
            </a>
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <div className="space-y-5">
              <Field label="Заглавие" error={titleError} group>
                <BgRoInput
                  label="Заглавие"
                  value={v.title}
                  maxLength={255}
                  invalid={!!titleError}
                  onChange={(title) => set(autoHandle ? { title, handle: toHandle(title.bg) } : { title })}
                />
              </Field>
              <Field label="Текст" group>
                <BgRoHtml label="Текст" value={v.body} onChange={(body) => set({ body })} rows={18} />
              </Field>
              <Field label="Кратко описание" group>
                <p className="-mt-1 mb-2 text-sm text-muted">Показва се в списъка с публикации, под заглавието. Празно = началото на текста.</p>
                <BgRoHtml label="Кратко описание" value={v.excerpt} onChange={(excerpt) => set({ excerpt })} rows={4} />
              </Field>
            </div>
          </Card>
          <Card title="Снимка" description="Показва се в списъка с публикации и най-горе в самата публикация.">
            <ImageUpload
              value={v.image}
              previewUrl={preview}
              onChange={(image, url) => {
                setPreview(url);
                set({ image });
              }}
              hint="JPG, PNG или WebP, най-добре хоризонтална, поне 1200 px широка."
            />
            {v.image ? (
              <Field label="Описание на снимката" hint="За незрящи посетители и за Google. Празно = заглавието на публикацията." className="mt-4">
                <TextInput value={v.imageAlt} onChange={(e) => set({ imageAlt: e.target.value })} maxLength={512} />
              </Field>
            ) : null}
          </Card>
          <Card title="Google (SEO)" description="По желание. Как публикацията се показва в резултатите от търсене.">
            <SeoFields
              title={v.seoTitle}
              description={v.seoDescription}
              onChange={({ title, description }) => set({ seoTitle: title, seoDescription: description })}
              fallbackTitle={v.title}
              fallbackHtml={fallbackHtml}
              domain={domain}
              path={`blogs/${blog?.handle ?? ""}/${v.handle || "…"}`}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Видимост">
            <Toggle
              checked={v.published}
              onChange={(published) => set({ published })}
              label={!v.published ? "Чернова (скрита)" : scheduled ? "Насрочена" : "Публикувана"}
              description={!v.published ? "Вижда се само тук, в админ панела." : scheduled ? "Ще се появи в сайта на избраната дата." : "Вижда се в блога на сайта."}
            />
            <Field label="Дата на публикуване" hint="Празно = сега. Бъдеща дата = публикацията се появява тогава." className="mt-5">
              <TextInput type="datetime-local" value={v.publishedAt} onChange={(e) => set({ publishedAt: e.target.value })} />
            </Field>
          </Card>
          <Card title="Автор и етикети">
            <div className="space-y-5">
              <Field label="Автор">
                <TextInput value={v.author} onChange={(e) => set({ author: e.target.value })} maxLength={100} />
              </Field>
              <Field label="Етикети" hint="По тях посетителите филтрират блога." group>
                <TagsInput value={v.tags} onChange={(tags) => set({ tags })} suggestions={tagSuggestions} />
              </Field>
            </div>
          </Card>
          <Card title="Адрес">
            <div className="space-y-5">
              {blogs.length > 1 ? (
                <Field label="Блог">
                  <Select value={v.blogId} onChange={(e) => set({ blogId: Number(e.target.value) })}>
                    {blogs.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <HandleField
                value={v.handle}
                onChange={(handle) => {
                  setAutoHandle(false);
                  set({ handle });
                }}
                prefix={`/blogs/${blog?.handle ?? ""}/`}
                original={isNew ? null : initial.handle}
                originalPrefix={`/blogs/${savedBlog?.handle ?? ""}/`}
                redirect={redirect}
                onRedirectChange={setRedirect}
                domain={domain}
                error={handleError}
                kindLabel="публикацията"
              />
            </div>
          </Card>
          {templates.length > 1 ? (
            <Card title="Шаблон">
              <Select value={v.template} onChange={(e) => set({ template: e.target.value })} aria-label="Шаблон">
                {templates.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Card>
          ) : null}
          {!isNew ? (
            <Card title="Изтриване">
              <p className="mb-3 text-sm text-ink-soft">Публикацията се изтрива завинаги, заедно с румънския превод.</p>
              {menuRefs.length ? <p className="mb-3 rounded-2xl bg-sun-soft p-3 text-sm font-bold">Публикацията е в менюто ({menuRefs.join(", ")}). След изтриване махнете връзката от „Меню“.</p> : null}
              <ConfirmButton onConfirm={remove} disabled={deleting} question={`Да изтрия ли публикацията „${initial.title.bg}“? Това не може да се отмени.`}>
                <Trash className="h-4 w-4" /> {deleting ? "Изтриване…" : "Изтрий публикацията"}
              </ConfirmButton>
              {deleteError ? <p className="mt-2 text-sm font-bold text-brand">{deleteError}</p> : null}
            </Card>
          ) : null}
        </div>
      </div>

      <SaveBar dirty={ed.dirty || isNew} pending={ed.pending} status={ed.status} onSave={ed.submit} onReset={isNew ? undefined : ed.reset} saveLabel={isNew ? "Създай публикацията" : undefined} />
    </>
  );
}
