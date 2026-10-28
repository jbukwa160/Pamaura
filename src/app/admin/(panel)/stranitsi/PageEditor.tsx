"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Info, Trash } from "lucide-react";
import { deletePageAction, savePageAction } from "@/app/admin/_actions/pages";
import { BgRoInput, Card, ConfirmButton, Field, SaveBar, Select, Toggle, useEditor } from "@/components/admin/ui";
import { HandleField } from "@/components/admin/content/HandleField";
import { BgRoHtml } from "@/components/admin/content/HtmlEditor";
import { SeoFields } from "@/components/admin/content/SeoFields";
import { isValidHandle, toHandle } from "@/components/admin/content/handles";
import type { PageForm, TemplateChoice } from "@/components/admin/content/types";

export function PageEditor({ initial, templates, domain, menuRefs }: { initial: PageForm; templates: TemplateChoice[]; domain: string; menuRefs: string[] }) {
  const router = useRouter();
  const isNew = initial.id === null;
  const [redirect, setRedirect] = useState(true);
  // a new page's address follows its title until the address is edited by hand
  const [autoHandle, setAutoHandle] = useState(isNew);
  const [showErrors, setShowErrors] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const ed = useEditor<PageForm>(initial, async (v) => {
    if (!v.title.bg.trim() || !isValidHandle(v.handle)) {
      setShowErrors(true);
      return { error: "Поправете отбелязаните полета." };
    }
    const r = await savePageAction(v, { redirect });
    if (r.ok && isNew && r.id) router.replace(`/admin/stranitsi/${r.id}`);
    else if (r.ok) router.refresh();
    return r;
  });
  const v = ed.value;
  const set = (patch: Partial<PageForm>) => ed.setValue((cur) => ({ ...cur, ...patch }));
  const template = templates.find((t) => t.value === v.template) ?? templates[0];
  const titleError = showErrors && !v.title.bg.trim() ? "Попълнете заглавието." : undefined;
  const handleError = showErrors && !isValidHandle(v.handle) ? "Попълнете адрес — малки букви, цифри и тирета." : undefined;
  const live = !isNew && initial.published;

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    const r = await deletePageAction(initial.id!);
    if (r.ok) router.push("/admin/stranitsi");
    else {
      setDeleteError(r.error ?? "Страницата не беше изтрита.");
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-3xl font-black tracking-tight">{isNew ? "Нова страница" : initial.title.bg || "Страница"}</h1>
        {live ? (
          <span className="ml-auto flex flex-wrap gap-2">
            <a href={`/bg-bg/pages/${encodeURIComponent(initial.handle)}`} target="_blank" rel="noopener" className="btn btn-ghost h-10 px-4 text-sm">
              <ExternalLink className="h-4 w-4" /> Виж в сайта
            </a>
            <a href={`/ro-ro/pages/${encodeURIComponent(initial.handle)}`} target="_blank" rel="noopener" className="btn btn-ghost h-10 px-4 text-sm">
              <ExternalLink className="h-4 w-4" /> RO
            </a>
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
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
              <Field label="Текст на страницата" group>
                {!template.showsText ? (
                  <p className="mb-2 flex items-start gap-2 rounded-2xl bg-sky-soft p-3 text-sm font-bold">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    Шаблонът „{template.label}“ не показва този текст — съдържанието на страницата идва от секциите на темата.
                  </p>
                ) : null}
                <BgRoHtml label="Текст на страницата" value={v.body} onChange={(body) => set({ body })} rows={16} />
              </Field>
            </div>
          </Card>
          <Card title="Google (SEO)" description="По желание. Как страницата се показва в резултатите от търсене.">
            <SeoFields
              title={v.seoTitle}
              description={v.seoDescription}
              onChange={({ title, description }) => set({ seoTitle: title, seoDescription: description })}
              fallbackTitle={v.title}
              fallbackHtml={v.body}
              domain={domain}
              path={`pages/${v.handle || "…"}`}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Видимост">
            <Toggle
              checked={v.published}
              onChange={(published) => set({ published })}
              label={v.published ? "Видима в сайта" : "Скрита"}
              description={v.published ? "Всеки може да я отвори." : "Никой не може да я отвори (дава „страницата не е намерена“)."}
            />
          </Card>
          <Card title="Адрес">
            <HandleField
              value={v.handle}
              onChange={(handle) => {
                setAutoHandle(false);
                set({ handle });
              }}
              prefix="/pages/"
              original={isNew ? null : initial.handle}
              redirect={redirect}
              onRedirectChange={setRedirect}
              domain={domain}
              error={handleError}
            />
          </Card>
          <Card title="Шаблон" description="Как изглежда страницата (задава се от темата).">
            <Select value={v.template} onChange={(e) => set({ template: e.target.value })} aria-label="Шаблон">
              {templates.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Card>
          {!isNew ? (
            <Card title="Изтриване">
              <p className="mb-3 text-sm text-ink-soft">Страницата се изтрива завинаги, заедно с румънския превод.</p>
              {menuRefs.length ? <p className="mb-3 rounded-2xl bg-sun-soft p-3 text-sm font-bold">Страницата е в менюто ({menuRefs.join(", ")}). След изтриване махнете връзката от „Меню“.</p> : null}
              <ConfirmButton
                onConfirm={remove}
                disabled={deleting}
                question={`Да изтрия ли страницата „${initial.title.bg}“? Това не може да се отмени.${menuRefs.length ? `\n\nВнимание: тя е в менюто (${menuRefs.join(", ")}) и връзката там ще води към несъществуваща страница.` : ""}`}
              >
                <Trash className="h-4 w-4" /> {deleting ? "Изтриване…" : "Изтрий страницата"}
              </ConfirmButton>
              {deleteError ? <p className="mt-2 text-sm font-bold text-brand">{deleteError}</p> : null}
            </Card>
          ) : null}
        </div>
      </div>

      <SaveBar dirty={ed.dirty || isNew} pending={ed.pending} status={ed.status} onSave={ed.submit} onReset={isNew ? undefined : ed.reset} saveLabel={isNew ? "Създай страницата" : undefined} />
    </>
  );
}
