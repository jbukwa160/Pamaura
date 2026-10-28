"use client";
// БГ / RO tabs over an HTML textarea, with a "Преглед" switch that shows how the text looks. The preview is a
// sandboxed frame without scripts, so pasted HTML can never run code in the admin.
import { useId, useState } from "react";
import { Code2, Eye } from "lucide-react";
import { cx, type BgRo } from "../ui";

const LANGS = [
  { key: "bg", label: "БГ" },
  { key: "ro", label: "RO" },
] as const;

export function HtmlField({ value, onChange, label, rows = 10 }: { value: BgRo; onChange: (v: BgRo) => void; label: string; rows?: number }) {
  const [tab, setTab] = useState<"bg" | "ro">("bg");
  const [preview, setPreview] = useState(false);
  const id = useId();
  const missing = !!value.bg.trim() && !value.ro.trim();
  const shown = tab === "ro" && !value.ro.trim() ? value.bg : value[tab];
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label={`Език: ${label}`} className="inline-flex gap-1 rounded-full bg-canvas p-1">
          {LANGS.map((t, i) => (
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
                const next = LANGS[(i + 1) % LANGS.length].key;
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
        <div className="inline-flex gap-1 rounded-full bg-canvas p-1">
          <button
            type="button"
            aria-pressed={!preview}
            onClick={() => setPreview(false)}
            className={cx("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black transition", !preview ? "bg-white text-ink shadow" : "text-muted hover:text-ink")}
          >
            <Code2 className="h-3.5 w-3.5" /> Код
          </button>
          <button
            type="button"
            aria-pressed={preview}
            onClick={() => setPreview(true)}
            className={cx("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black transition", preview ? "bg-white text-ink shadow" : "text-muted hover:text-ink")}
          >
            <Eye className="h-3.5 w-3.5" /> Преглед
          </button>
        </div>
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`}>
        {preview ? (
          <HtmlPreview html={shown} />
        ) : (
          <textarea
            value={value[tab]}
            rows={rows}
            aria-label={`${label} (${tab === "bg" ? "БГ" : "RO"})`}
            placeholder={tab === "ro" ? "Празно = показва се българският текст" : "<p>Текст…</p>"}
            spellCheck={false}
            onChange={(e) => onChange({ ...value, [tab]: e.target.value })}
            className="field resize-y font-mono text-sm"
          />
        )}
      </div>
      {tab === "ro" ? (
        <p className="mt-1.5 text-sm text-muted">
          По желание — празно = на /ro-ro се показва българският текст.{preview && !value.ro.trim() ? " (Прегледът показва българския текст.)" : ""}
        </p>
      ) : null}
    </div>
  );
}

const PREVIEW_CSS =
  "body{margin:0;padding:14px 16px;font:15px/1.6 Nunito,system-ui,sans-serif;color:#57391f;overflow-wrap:anywhere}" +
  "p{margin:0 0 .75em}ul,ol{padding-left:1.4em;margin:0 0 .75em}h1,h2,h3,h4{font-weight:800;margin:.8em 0 .4em}" +
  "a{color:#2f9fe0}img,video,iframe{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #ebe7f1;padding:4px 8px}";

/** The HTML as the shop shows it (roughly), in a frame that cannot run scripts. */
export function HtmlPreview({ html }: { html: string }) {
  const [height, setHeight] = useState(160);
  if (!html.trim()) return <p className="rounded-[0.875rem] border-2 border-dashed border-line bg-canvas px-4 py-6 text-center text-sm text-muted">Няма текст.</p>;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${PREVIEW_CSS}</style></head><body>${html}</body></html>`;
  return (
    <iframe
      title="Преглед на текста"
      sandbox="allow-same-origin allow-popups"
      srcDoc={doc}
      onLoad={(e) => {
        const d = e.currentTarget.contentDocument;
        if (d) setHeight(Math.min(900, Math.max(80, d.documentElement.scrollHeight + 4)));
      }}
      style={{ height }}
      className="block w-full rounded-[0.875rem] border-2 border-line bg-white"
    />
  );
}
