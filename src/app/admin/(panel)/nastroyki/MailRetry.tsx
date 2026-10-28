"use client";

import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, Send } from "lucide-react";
import { retryMailAction } from "@/app/admin/_actions/settings";

export function MailRetry({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            setResult(null);
            const r = await retryMailAction();
            setResult(r.ok ? { ok: true, text: r.message ?? "Готово." } : { ok: false, text: r.error ?? "Възникна грешка." });
          })
        }
        className="btn btn-ghost h-11 px-5"
      >
        {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        {pending ? "Изпращане…" : "Изпрати отново чакащите имейли"}
      </button>
      <div aria-live="polite">
        {result ? (
          <p className={`mt-2 flex items-start gap-1.5 text-sm font-bold ${result.ok ? "text-mint" : "text-brand"}`}>
            {result.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />} {result.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
