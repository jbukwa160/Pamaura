"use client";
// The web address of a page / blog post. Changing the address of an existing one warns that old links break and
// offers to redirect the old address to the new one (menu links follow automatically).
import { useId } from "react";
import { TriangleAlert } from "lucide-react";
import { cx } from "../ui";
import { handleTyping, toHandle } from "./handles";

export function HandleField({
  value,
  onChange,
  prefix,
  original,
  originalPrefix,
  redirect,
  onRedirectChange,
  domain,
  error,
  kindLabel = "страницата",
}: {
  value: string;
  onChange: (v: string) => void;
  /** path before the handle, e.g. "/pages/" */
  prefix: string;
  /** saved handle (null for a new page) */
  original: string | null;
  /** saved path before the handle, when it can change too (a post moved to another blog) */
  originalPrefix?: string;
  redirect: boolean;
  onRedirectChange: (v: boolean) => void;
  domain: string;
  error?: string;
  kindLabel?: string;
}) {
  const id = useId();
  const oldPrefix = originalPrefix ?? prefix;
  const changed = original !== null && (value !== original || oldPrefix !== prefix);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-extrabold text-ink">
        Адрес в сайта
      </label>
      <div className={cx("flex items-center overflow-hidden rounded-[0.875rem] border-2 bg-white focus-within:border-sky", error ? "border-brand" : "border-line")}>
        <span className="shrink-0 border-r border-line bg-canvas px-3 py-2.5 font-mono text-sm text-muted">{prefix}</span>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(handleTyping(e.target.value))}
          onBlur={() => {
            const clean = toHandle(value);
            if (clean !== value) onChange(clean);
          }}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!!error}
          className="w-full min-w-0 bg-transparent px-3 py-2.5 font-mono text-sm outline-none focus-visible:outline-none"
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-sm font-bold text-brand">{error}</p>
      ) : (
        <p className="mt-1.5 break-all text-sm text-muted">
          {domain}/bg-bg{prefix}
          {value || "…"} · само малки букви, цифри и тирета
        </p>
      )}
      {changed ? (
        <div className="mt-3 rounded-2xl bg-sun-soft p-4 text-sm">
          <p className="flex items-start gap-2 font-bold">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Сменяте адреса на {kindLabel}. Връзките към стария адрес {oldPrefix}
            {original} — в Google, в социалните мрежи, в имейли и в текстове — ще спрат да работят.
          </p>
          <label className="mt-2 flex cursor-pointer items-start gap-2 pl-6">
            <input type="checkbox" checked={redirect} onChange={(e) => onRedirectChange(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--color-mint)]" />
            <span>
              <span className="font-bold">Пренасочвай стария адрес към новия</span> (препоръчително) — посетителите на стария адрес ще отиват на новия.
            </span>
          </label>
          <p className="mt-1 pl-6 text-ink-soft">Връзките в менютата на сайта се обновяват автоматично.</p>
        </div>
      ) : null}
    </div>
  );
}
