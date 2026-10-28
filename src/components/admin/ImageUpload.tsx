"use client";
// Picture picker for the admin: upload from the computer (stored like Shopify "Files"), preview, remove.
import { useRef, useState, useTransition } from "react";
import { ImageOff, LoaderCircle, Upload, X } from "lucide-react";
import { uploadImageAction } from "@/app/admin/_actions/uploads";
import { cx } from "./ui";

export function ImageUpload({
  value,
  previewUrl,
  onChange,
  compact = false,
  hint,
}: {
  /** stored file key ("" = none) */
  value: string;
  /** URL to show for the current value */
  previewUrl: string;
  onChange: (key: string, url: string) => void;
  compact?: boolean;
  hint?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const upload = (file: File) => {
    setError(null);
    if (file.size > 15 * 1024 * 1024) {
      setError("Снимката е по-голяма от 15 MB. Намалете я и опитайте пак.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    start(async () => {
      const r = await uploadImageAction(fd);
      if (r.key && r.url) onChange(r.key, r.url);
      else setError(r.error ?? "Качването не успя.");
    });
  };
  return (
    <div>
      <div className={cx("flex gap-4", compact ? "items-center" : "flex-col sm:flex-row sm:items-center")}>
        <div className={cx("grid shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-canvas", compact ? "h-20 w-20" : "h-32 w-48")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value && previewUrl ? <img src={previewUrl} alt="" className="h-full w-full object-contain" /> : <ImageOff className="h-7 w-7 text-muted" />}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => input.current?.click()} disabled={pending} className="btn btn-primary h-10 px-4 text-sm !shadow-none">
              {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {pending ? "Качване…" : value ? "Смени снимката" : "Качи снимка"}
            </button>
            {value ? (
              <button type="button" onClick={() => onChange("", "")} className="btn btn-ghost h-10 px-4 text-sm">
                <X className="h-4 w-4" /> Премахни
              </button>
            ) : null}
          </div>
          {hint ? <p className="text-xs text-muted">{hint}</p> : null}
        </div>
      </div>
      {error ? <p className="mt-2 text-sm font-bold text-brand">{error}</p> : null}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
