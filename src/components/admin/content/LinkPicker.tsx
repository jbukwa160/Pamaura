"use client";
// Where a menu item leads: a collection, product, page, blog, blog post or any address. Links are stored the way
// the importer stored them (market-neutral paths such as "/collections/all", "/pages/<handle>"), so an
// unchanged item keeps exactly the same URL string.
import { useState } from "react";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { Select, TextInput, cx } from "../ui";
import { URL_MAX, buildUrl, parseLink, urlProblem, type LinkKind } from "./links";
import type { LinkTargets } from "./types";

const KINDS: { value: LinkKind; label: string }[] = [
  { value: "home", label: "Начална страница" },
  { value: "collection", label: "Колекция" },
  { value: "product", label: "Продукт" },
  { value: "page", label: "Страница" },
  { value: "blog", label: "Блог" },
  { value: "article", label: "Публикация в блога" },
  { value: "search", label: "Търсене" },
  { value: "custom", label: "Друг адрес" },
];

function optionsFor(kind: LinkKind, t: LinkTargets): { key: string; label: string }[] {
  switch (kind) {
    case "collection": {
      const list = t.collections.map((c) => ({ key: c.handle, label: c.title }));
      return list.some((c) => c.key === "all") ? list : [{ key: "all", label: "Всички продукти" }, ...list];
    }
    case "product":
      return t.products.map((p) => ({ key: p.handle, label: p.title }));
    case "page":
      return t.pages.map((p) => ({ key: p.handle, label: p.title }));
    case "blog":
      return t.blogs.map((b) => ({ key: b.handle, label: b.title }));
    case "article":
      return t.articles.map((a) => ({ key: `${a.blog}/${a.handle}`, label: a.title }));
    default:
      return [];
  }
}

export function LinkPicker({ value, onChange, targets, label, showErrors = false }: { value: string; onChange: (url: string) => void; targets: LinkTargets; label: string; showErrors?: boolean }) {
  const parsed = parseLink(value);
  // "Друг адрес" can also hold a path that looks like a page link; remember that choice while editing
  const [forceCustom, setForceCustom] = useState(false);
  const kind: LinkKind = forceCustom ? "custom" : parsed.kind;
  const options = optionsFor(kind, targets);
  const missing = !!parsed.key && kind !== "custom" && !options.some((o) => o.key === parsed.key);
  const problem = kind === "" || kind === "custom" ? urlProblem(value) : null;
  const showProblem = !!problem && (showErrors || (kind === "custom" && value.trim() !== ""));
  const internal = value.startsWith("/") && !value.startsWith("//");

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          aria-label={`${label}: вид връзка`}
          value={kind}
          onChange={(e) => {
            const k = e.target.value as LinkKind;
            setForceCustom(k === "custom");
            if (k === "custom") return; // keep the current address to edit it
            onChange(k === "" ? "" : buildUrl(k, optionsFor(k, targets)[0]?.key ?? ""));
          }}
          className={cx("sm:w-56 sm:shrink-0", showErrors && kind === "" && "!border-brand")}
        >
          {kind === "" ? <option value="">— изберете —</option> : null}
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
        {kind === "" ? null : kind === "custom" ? (
          <TextInput
            aria-label={`${label}: адрес`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://… или /pages/…"
            maxLength={URL_MAX}
            invalid={showProblem}
            className="font-mono text-sm"
          />
        ) : options.length || missing ? (
          <Select aria-label={label} value={parsed.key} onChange={(e) => onChange(buildUrl(kind, e.target.value))} className={cx("min-w-0", missing && "!border-brand")}>
            {missing ? <option value={parsed.key}>{parsed.key} (не съществува)</option> : null}
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : kind === "home" || kind === "search" ? null : (
          <p className="self-center text-sm text-muted">Няма какво да се избере.</p>
        )}
      </div>
      <p className={cx("mt-1 flex flex-wrap items-center gap-1.5 text-xs", missing || showProblem ? "font-bold text-brand" : "text-muted")}>
        {missing ? (
          <>
            <TriangleAlert className="h-3.5 w-3.5" /> Връзката води към нещо, което вече не съществува — изберете друго.
          </>
        ) : showProblem ? (
          problem
        ) : value ? (
          <>
            <span className="break-all font-mono">{value}</span>
            {internal ? (
              <a href={`/bg-bg${value === "/" ? "" : value}`} target="_blank" rel="noopener" className="inline-flex items-center text-sky hover:underline" title="Отвори в сайта">
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="sr-only">Отвори в сайта</span>
              </a>
            ) : null}
          </>
        ) : null}
      </p>
    </div>
  );
}
