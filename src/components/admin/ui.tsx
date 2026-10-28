"use client";
// Building blocks of the admin panel (same look as the reference admin: rounded cards, pill buttons, ink / brand).
import { useEffect, useId, useState, useTransition } from "react";
import { Check, CircleAlert, LoaderCircle, Save } from "lucide-react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-3xl border border-line bg-white p-5 md:p-7", className)}>
      {title || actions ? (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-xl font-black">{title}</h2> : null}
            {description ? <p className="mt-1 text-[0.95rem] text-ink-soft">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A labelled form row. `group` for controls that hold several inputs (language tabs, lists). */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  group = false,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
  group?: boolean;
}) {
  const id = useId();
  const Wrapper = group ? "div" : "label";
  return (
    <Wrapper className={cx("block", className)} {...(group ? { role: "group", "aria-labelledby": id } : {})}>
      <span id={id} className="mb-1.5 block text-sm font-extrabold text-ink">
        {label}
      </span>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm font-bold text-brand">
          <CircleAlert className="h-4 w-4 shrink-0" /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-muted">{hint}</p>
      ) : null}
    </Wrapper>
  );
}

export function TextInput({ className, invalid, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...rest} className={cx("field", invalid && "!border-brand", className)} />;
}

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx("field resize-y", className)} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx("field cursor-pointer", className)}>
      {children}
    </select>
  );
}

/** Amount in a currency ("12,99"); the value is the text as typed, parse it with parseMoney on save. */
export function MoneyInput({
  value,
  onChange,
  invalid,
  currency = "€",
  ...rest
}: { value: string; onChange: (v: string) => void; invalid?: boolean; currency?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className={cx("flex items-center rounded-[0.875rem] border-2 bg-white focus-within:border-sky", invalid ? "border-brand" : "border-line")}>
      <input
        {...rest}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent px-3.5 py-2.5 text-base outline-none focus-visible:outline-none"
      />
      <span className="pr-3.5 font-bold text-muted">{currency}</span>
    </div>
  );
}

/** "12,99" / "12.99" / "12" → 1299 cents; "" → null; invalid → NaN. */
export function parseMoney(text: string): number | null {
  const t = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}

/** 1299 → "12,99" */
export function moneyText(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx("flex cursor-pointer items-start gap-3", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-mint" : "bg-line")}
      >
        <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-6" : "left-1")} />
      </button>
      <span>
        <span className="block font-bold">{label}</span>
        {description ? <span className="block text-sm text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-ink-soft">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

const BADGE = {
  ink: "bg-ink text-white",
  brand: "bg-brand-soft text-brand-dark",
  sun: "bg-sun-soft text-ink",
  sky: "bg-sky-soft text-ink",
  mint: "bg-mint-soft text-mint",
  grape: "bg-grape-soft text-grape",
  muted: "bg-canvas text-muted border border-line",
} as const;
export type BadgeTone = keyof typeof BADGE;

export function Badge({ tone = "muted", children, className }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold", BADGE[tone], className)}>{children}</span>;
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-line bg-white px-6 py-12 text-center">
      {icon ? <div className="text-muted">{icon}</div> : null}
      <p className="text-lg font-black">{title}</p>
      {children ? <div className="max-w-md text-ink-soft">{children}</div> : null}
    </div>
  );
}

/** Warn before leaving the page with unsaved changes. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

export type SaveStatus = { kind: "idle" } | { kind: "saved" } | { kind: "error"; message: string };
export type ActionResult = { ok?: boolean; error?: string };

export function SaveBar({
  dirty,
  pending,
  status,
  onSave,
  onReset,
  saveLabel = "Запази промените",
  extra,
}: {
  dirty: boolean;
  pending: boolean;
  status: SaveStatus;
  onSave: () => void;
  onReset?: () => void;
  saveLabel?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onSave} disabled={pending || !dirty} className="btn btn-primary h-12 px-7">
          {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          {pending ? "Запазване…" : saveLabel}
        </button>
        {onReset && dirty && !pending ? (
          <button type="button" onClick={onReset} className="btn btn-ghost h-12 px-5">
            Отказ
          </button>
        ) : null}
        <span className="text-sm font-bold" aria-live="polite">
          {status.kind === "error" ? (
            <span className="flex items-center gap-1.5 text-brand">
              <CircleAlert className="h-4 w-4" /> {status.message}
            </span>
          ) : status.kind === "saved" && !dirty ? (
            <span className="flex items-center gap-1.5 text-mint">
              <Check className="h-4 w-4" strokeWidth={3} /> Запазено! Промените вече са в сайта.
            </span>
          ) : dirty ? (
            <span className="text-muted">Имате незапазени промени</span>
          ) : null}
        </span>
        <span className="ml-auto">{extra}</span>
      </div>
    </div>
  );
}

/** State + save helper for the editors: tracks "dirty", pending and the last result. */
export function useEditor<T>(initial: T, save: (value: T) => Promise<ActionResult>) {
  const [value, setValue] = useState<T>(initial);
  const [saved, setSaved] = useState<T>(initial);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  useUnsavedWarning(dirty);
  const submit = () =>
    start(async () => {
      const r = await save(value);
      if (r.ok) {
        setSaved(value);
        setStatus({ kind: "saved" });
      } else setStatus({ kind: "error", message: r.error ?? "Възникна грешка." });
    });
  const update = (next: T | ((v: T) => T)) => {
    setStatus({ kind: "idle" });
    setValue(next);
  };
  return { value, setValue: update, dirty, pending, status, submit, reset: () => update(saved) };
}

/** Texts the shop shows in Bulgarian and Romanian. */
export type BgRo = { bg: string; ro: string };

const LANG_TABS = [
  { key: "bg", label: "БГ" },
  { key: "ro", label: "RO" },
] as const;

/**
 * БГ / RO tabs over one input (or textarea with `multiline`). Romanian is optional — empty means the Bulgarian
 * text is shown on /ro-ro. The RO tab gets a dot while the translation is missing.
 */
export function BgRoInput({
  value,
  onChange,
  label,
  multiline = false,
  rows = 3,
  placeholder,
  maxLength,
  invalid,
  mono = false,
}: {
  value: BgRo;
  onChange: (v: BgRo) => void;
  label: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
  invalid?: boolean;
  mono?: boolean;
}) {
  const [tab, setTab] = useState<"bg" | "ro">("bg");
  const id = useId();
  const missing = !!value.bg.trim() && !value.ro.trim();
  const common = {
    id: `${id}-${tab}`,
    value: value[tab],
    maxLength,
    "aria-label": `${label} (${tab === "bg" ? "БГ" : "RO"})`,
    placeholder: tab === "ro" ? value.bg || placeholder : placeholder,
    className: cx("field", multiline && "resize-y", mono && "font-mono text-sm", invalid && tab === "bg" && "!border-brand"),
  };
  const set = (text: string) => onChange({ ...value, [tab]: text });
  return (
    <div>
      <div role="tablist" aria-label={`Език: ${label}`} className="mb-1.5 inline-flex gap-1 rounded-full bg-canvas p-1">
        {LANG_TABS.map((t, i) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`${id}-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`${id}-${t.key}`}
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
      <div role="tabpanel" aria-labelledby={`${id}-tab-${tab}`}>
        {multiline ? <textarea {...common} rows={rows} onChange={(e) => set(e.target.value)} /> : <input {...common} onChange={(e) => set(e.target.value)} />}
      </div>
      {tab === "ro" ? <p className="mt-1.5 text-sm text-muted">По желание — празно = на /ro-ro се показва българският текст.</p> : null}
    </div>
  );
}

/** A button that asks before doing something irreversible. */
export function ConfirmButton({
  onConfirm,
  question,
  children,
  className = "btn btn-danger h-10 px-4 text-sm",
  disabled,
}: {
  onConfirm: () => void;
  question: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={className}
      onClick={() => {
        if (window.confirm(question)) onConfirm();
      }}
    >
      {children}
    </button>
  );
}
