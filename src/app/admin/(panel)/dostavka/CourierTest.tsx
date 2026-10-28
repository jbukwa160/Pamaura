"use client";

import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, PlugZap } from "lucide-react";
import { testCourierAction } from "@/app/admin/_actions/shipping";

/** "Провери връзката": asks the courier for its office list with the logins from .env.local. */
export function CourierTest({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(null);
            const r = await testCourierAction(id);
            setResult(r.ok ? { ok: true, text: r.message ?? "Връзката работи." } : { ok: false, text: r.error ?? "Връзката не работи." });
          })
        }
        className="btn btn-ghost h-10 px-4 text-sm"
      >
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
        {pending ? "Проверка…" : "Провери връзката"}
      </button>
      <div aria-live="polite">
        {result ? (
          <p className={`mt-2 flex items-start gap-1.5 text-sm font-bold ${result.ok ? "text-mint" : "text-brand"}`}>
            {result.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
            <span className="min-w-0 break-words">{result.text}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
