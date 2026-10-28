"use client";
// Title and description for Google, Bulgarian and Romanian, with a preview of the search result.
import { BgRoInput, Field, type BgRo } from "../ui";

function plain(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function Snippet({ lang, domain, path, title, description }: { lang: string; domain: string; path: string; title: string; description: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white p-4">
      <p className="mb-1 text-xs font-black text-muted">{lang}</p>
      <p className="truncate text-sm text-ink-soft">
        {domain} › {path.split("/").filter(Boolean).join(" › ")}
      </p>
      <p className="mt-0.5 truncate text-lg font-semibold text-[#1a0dab]">{cut(title || "Без заглавие", 70)}</p>
      <p className="mt-0.5 text-sm text-ink-soft">{description ? cut(description, 160) : <span className="italic text-muted">Няма описание.</span>}</p>
    </div>
  );
}

export function SeoFields({
  title,
  description,
  onChange,
  fallbackTitle,
  fallbackHtml,
  domain,
  path,
}: {
  title: BgRo;
  description: BgRo;
  onChange: (v: { title: BgRo; description: BgRo }) => void;
  /** shown when the SEO title is empty (the page title) */
  fallbackTitle: BgRo;
  /** the text Google gets when the description is empty (start of the body / excerpt) */
  fallbackHtml: BgRo;
  domain: string;
  /** e.g. "pages/contact" */
  path: string;
}) {
  // as the shop does it: a missing Romanian field falls back to the Bulgarian one, then to the page's own texts
  const tr = (v: BgRo, lang: "bg" | "ro") => (lang === "ro" ? v.ro.trim() || v.bg.trim() : v.bg.trim());
  const titleOf = (lang: "bg" | "ro") => tr(title, lang) || tr(fallbackTitle, lang);
  const descOf = (lang: "bg" | "ro") => cut(plain(tr(description, lang)) || plain(tr(fallbackHtml, lang)), 320);
  return (
    <div className="space-y-5">
      <Field label="Заглавие в Google" hint="Препоръчително до 60–70 знака. Празно = заглавието на страницата." group>
        <BgRoInput label="Заглавие в Google" value={title} onChange={(v) => onChange({ title: v, description })} maxLength={255} placeholder={fallbackTitle.bg} />
      </Field>
      <Field label="Описание в Google" hint="1–2 изречения, до 160 знака. Празно = началото на текста." group>
        <BgRoInput label="Описание в Google" value={description} onChange={(v) => onChange({ title, description: v })} multiline rows={3} maxLength={1000} />
      </Field>
      <div>
        <p className="mb-1.5 text-sm font-extrabold">Как ще изглежда в Google</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Snippet lang="БГ" domain={domain} path={`bg-bg/${path}`} title={titleOf("bg")} description={descOf("bg")} />
          <Snippet lang="RO" domain={domain} path={`ro-ro/${path}`} title={titleOf("ro")} description={descOf("ro")} />
        </div>
      </div>
    </div>
  );
}
