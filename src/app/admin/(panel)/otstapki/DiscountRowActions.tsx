"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { deleteDiscountAction, setDiscountEnabledAction } from "@/app/admin/_actions/discounts";

/** Switch on / off and delete, right in the list. */
export function DiscountRowActions({ id, code, enabled }: { id: number; code: string; enabled: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError("");
      const r = await fn();
      if (r.error) setError(r.error);
    });
  return (
    <span className="flex items-center justify-end gap-2">
      {error ? (
        <span className="text-xs font-bold text-brand" role="alert">
          {error}
        </span>
      ) : null}
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin text-muted" aria-label="Изчакайте" /> : null}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? `Изключи ${code}` : `Включи ${code}`}
        title={enabled ? "Изключи кода" : "Включи кода"}
        disabled={pending}
        onClick={() => run(() => setDiscountEnabledAction(id, !enabled))}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? "bg-mint" : "bg-line"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-6" : "left-1"}`} />
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Да изтрием ли кода ${code}? Клиентите вече няма да могат да го използват. Това не може да се отмени.`)) run(() => deleteDiscountAction(id));
        }}
        className="btn btn-danger h-9 px-3 text-sm"
        aria-label={`Изтрий ${code}`}
        title="Изтрий кода"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </span>
  );
}
