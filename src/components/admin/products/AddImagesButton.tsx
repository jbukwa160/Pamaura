"use client";
// Uploads one or more pictures from the computer (one after another) and hands each stored file key back.
import { useRef, useState, useTransition } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { uploadImageAction } from "@/app/admin/_actions/uploads";

const MAX = 15 * 1024 * 1024;

export function AddImagesButton({ onAdded }: { onAdded: (key: string, url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const upload = (files: File[]) => {
    setErrors([]);
    start(async () => {
      const errs: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress(files.length > 1 ? `${i + 1} от ${files.length}` : "");
        if (f.size > MAX) {
          errs.push(`${f.name}: по-голяма от 15 MB.`);
          continue;
        }
        const fd = new FormData();
        fd.append("file", f);
        try {
          const r = await uploadImageAction(fd);
          if (r.key && r.url) onAdded(r.key, r.url);
          else errs.push(`${f.name}: ${r.error ?? "качването не успя."}`);
        } catch {
          errs.push(`${f.name}: няма връзка със сървъра.`);
        }
      }
      setProgress("");
      setErrors(errs);
    });
  };
  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={pending}
        className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-canvas p-3 text-center font-bold text-ink-soft transition hover:border-ink hover:text-ink disabled:cursor-wait"
      >
        {pending ? <LoaderCircle className="h-7 w-7 animate-spin" /> : <ImagePlus className="h-7 w-7" />}
        <span>{pending ? `Качване… ${progress}` : "Добави снимки"}</span>
        {!pending ? <span className="text-xs font-semibold text-muted">JPG, PNG, WebP · до 15 MB</span> : null}
      </button>
      {errors.length ? (
        <ul className="mt-2 space-y-1 text-sm font-bold text-brand">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).slice(0, 30);
          if (files.length) upload(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
