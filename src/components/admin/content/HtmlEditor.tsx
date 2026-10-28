"use client";
// HTML text of a page / blog post in Bulgarian and Romanian: a code box with a small formatting toolbar and a
// preview. The texts were imported from Shopify as HTML, so they are edited as HTML (nothing is rewritten).
import { useId, useRef, useState } from "react";
import { Bold, Code, Eye, Heading2, Heading3, Italic, Link2, List, ListOrdered, Pilcrow } from "lucide-react";
import { cx, type BgRo } from "../ui";

const LANG_TABS = [
  { key: "bg", label: "БГ" },
  { key: "ro", label: "RO" },
] as const;

// Close to how the shop prints text (brown ink, readable line height).
const PREVIEW_CSS = `
html,body{margin:0;background:#fff}
body{padding:18px 22px;font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#57391f;overflow-wrap:anywhere}
img,video,iframe{max-width:100%;height:auto}
a{color:#a77a53}
h1,h2,h3,h4{line-height:1.25;margin:1em 0 .45em;color:#3d2814}
p{margin:0 0 .8em}
ul,ol{padding-left:1.4em;margin:0 0 .8em}
table{border-collapse:collapse;max-width:100%}
td,th{border:1px solid #e8dccd;padding:4px 8px}
blockquote{margin:0 0 .8em;padding-left:1em;border-left:3px solid #e8dccd}
.empty{color:#9b8b7b;font-style:italic}
`;

type ToolKey = "p" | "h2" | "h3" | "strong" | "em" | "ul" | "ol" | "a";

const TOOLS: { key: ToolKey; icon: typeof Bold; title: string }[] = [
  { key: "p", icon: Pilcrow, title: "Абзац" },
  { key: "h2", icon: Heading2, title: "Заглавие" },
  { key: "h3", icon: Heading3, title: "Подзаглавие" },
  { key: "strong", icon: Bold, title: "Удебелен (Ctrl+B)" },
  { key: "em", icon: Italic, title: "Наклонен (Ctrl+I)" },
  { key: "ul", icon: List, title: "Списък с точки (всеки ред е точка)" },
  { key: "ol", icon: ListOrdered, title: "Номериран списък" },
  { key: "a", icon: Link2, title: "Връзка" },
];

/** Tag, closing tag and the text inserted when nothing is selected. */
const WRAPS: Record<Exclude<ToolKey, "ul" | "ol" | "a">, [string, string, string]> = {
  p: ["<p>", "</p>", "Текст"],
  h2: ["<h2>", "</h2>", "Заглавие"],
  h3: ["<h3>", "</h3>", "Подзаглавие"],
  strong: ["<strong>", "</strong>", "текст"],
  em: ["<em>", "</em>", "текст"],
};

function Preview({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${PREVIEW_CSS}</style></head><body>${
    html.trim() ? html : '<p class="empty">Няма текст.</p>'
  }</body></html>`;
  return (
    // no scripts run inside (sandbox without allow-scripts); same origin only so the height can be measured
    <iframe
      ref={frame}
      title="Преглед на текста"
      sandbox="allow-same-origin"
      srcDoc={doc}
      onLoad={() => {
        const d = frame.current?.contentDocument;
        if (d) setHeight(Math.min(900, Math.max(160, d.documentElement.scrollHeight + 2)));
      }}
      style={{ height }}
      className="block w-full rounded-[0.875rem] border-2 border-line bg-white"
    />
  );
}

export function BgRoHtml({
  value,
  onChange,
  label,
  rows = 14,
  roHint = "По желание — празно = на /ro-ro се показва българският текст.",
}: {
  value: BgRo;
  onChange: (v: BgRo) => void;
  label: string;
  rows?: number;
  roHint?: string;
}) {
  const [tab, setTab] = useState<"bg" | "ro">("bg");
  const [preview, setPreview] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const text = value[tab];
  const missing = !!value.bg.trim() && !value.ro.trim();
  const set = (t: string) => onChange({ ...value, [tab]: t });

  /** Replaces the selection with fn(selection) and selects [from, to] of the inserted text. */
  const apply = (fn: (sel: string) => { text: string; select?: [number, number] }) => {
    const el = area.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const r = fn(text.slice(s, e));
    set(text.slice(0, s) + r.text + text.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + (r.select?.[0] ?? r.text.length), s + (r.select?.[1] ?? r.text.length));
    });
  };
  const wrap = (open: string, close: string, placeholder: string) =>
    apply((sel) => {
      const inner = sel || placeholder;
      return { text: open + inner + close, select: [open.length, open.length + inner.length] };
    });
  const list = (tag: "ul" | "ol") =>
    apply((sel) => {
      const lines = (sel || "Първи ред\nВтори ред")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      return { text: `<${tag}>\n${lines.map((l) => `  <li>${l}</li>`).join("\n")}\n</${tag}>` };
    });
  const link = () => {
    const url = window.prompt("Адрес на връзката (например /pages/contact или https://…)", "https://")?.trim();
    if (!url || url === "https://" || /^\s*(javascript|data|vbscript):/i.test(url)) return;
    const ext = /^https?:\/\//i.test(url) && !/pamaura\.com/i.test(url);
    wrap(`<a href="${url.replace(/"/g, "&quot;")}"${ext ? ' target="_blank" rel="noopener"' : ""}>`, "</a>", "текст на връзката");
  };

  const runTool = (key: ToolKey) => {
    if (key === "ul" || key === "ol") list(key);
    else if (key === "a") link();
    else {
      const [open, close, placeholder] = WRAPS[key];
      wrap(open, close, placeholder);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={`Език: ${label}`} className="inline-flex gap-1 rounded-full bg-canvas p-1">
          {LANG_TABS.map((t, i) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`${id}-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`${id}-panel`}
              tabIndex={tab === t.key ? 0 : -1}
              onClick={() => setTab(t.key)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const next = LANG_TABS[(i + 1) % LANG_TABS.length].key;
                setTab(next);
                document.getElementById(`${id}-tab-${next}`)?.focus();
              }}
              className={cx("relative rounded-full px-3 py-1 text-xs font-black transition", tab === t.key ? "bg-ink text-white" : "text-muted hover:text-ink")}
            >
              {t.label}
              {t.key === "ro" && missing ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-sun" title="Липсва превод" aria-label="липсва превод" /> : null}
            </button>
          ))}
        </div>
        <div className="ml-auto inline-flex gap-1 rounded-full bg-canvas p-1" role="group" aria-label="Изглед">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)} className={cx("flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black transition", !preview ? "bg-ink text-white" : "text-muted hover:text-ink")}>
            <Code className="h-3.5 w-3.5" /> HTML код
          </button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)} className={cx("flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black transition", preview ? "bg-ink text-white" : "text-muted hover:text-ink")}>
            <Eye className="h-3.5 w-3.5" /> Преглед
          </button>
        </div>
      </div>

      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`}>
        {preview ? (
          <Preview html={tab === "ro" && !value.ro.trim() ? value.bg : text} />
        ) : (
          <div className="rounded-[0.875rem] border-2 border-line bg-white focus-within:border-sky">
            <div className="flex flex-wrap gap-0.5 border-b border-line px-1.5 py-1" role="toolbar" aria-label="Форматиране">
              {TOOLS.map(({ key, icon: Icon, title }) => (
                <button key={key} type="button" title={title} aria-label={title} onClick={() => runTool(key)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-canvas hover:text-ink">
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            <textarea
              ref={area}
              value={text}
              rows={rows}
              spellCheck={false}
              aria-label={`${label} (${tab === "bg" ? "БГ" : "RO"})`}
              placeholder={tab === "ro" ? "Празно — ще се показва българският текст." : "<p>Текст…</p>"}
              onChange={(e) => set(e.target.value)}
              onKeyDown={(e) => {
                if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
                const k = e.key.toLowerCase();
                if (k === "b") {
                  e.preventDefault();
                  wrap("<strong>", "</strong>", "текст");
                } else if (k === "i") {
                  e.preventDefault();
                  wrap("<em>", "</em>", "текст");
                }
              }}
              className="block w-full resize-y rounded-b-[0.75rem] bg-transparent px-3.5 py-2.5 font-mono text-sm leading-relaxed outline-none focus-visible:outline-none"
            />
          </div>
        )}
      </div>
      <p className="mt-1.5 text-sm text-muted">
        {tab === "ro" ? roHint : preview ? "Така изглежда текстът (шрифтът и отстъпите в сайта може леко да се различават)." : "Маркирайте текст и натиснете бутон отгоре, за да го форматирате."}
      </p>
    </div>
  );
}
