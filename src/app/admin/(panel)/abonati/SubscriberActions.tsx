"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Trash2, UserMinus } from "lucide-react";
import { deleteSubscriberAction, unsubscribeAction } from "@/app/admin/_actions/subscribers";

export function SubscriberActions({ email, subscribed }: { email: string; subscribed: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const run = (question: string, action: (email: string) => Promise<{ error?: string }>) => {
    if (!window.confirm(question)) return;
    start(async () => {
      setError("");
      const r = await action(email);
      if (r.error) setError(r.error);
    });
  };
  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin text-muted" aria-label="Изчакайте" /> : null}
      {error ? (
        <span className="text-xs font-bold text-brand" role="alert">
          {error}
        </span>
      ) : null}
      {subscribed ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(`Да отпишем ли ${email} от бюлетина?`, unsubscribeAction)}
          className="btn btn-ghost h-9 px-3 text-sm"
          title="Отписване от бюлетина"
        >
          <UserMinus className="h-4 w-4" /> Отпиши
        </button>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => run(`Да изтрием ли ${email} от списъка? Това не може да се отмени.`, deleteSubscriberAction)}
        className="btn btn-danger h-9 px-3 text-sm"
        aria-label={`Изтрий ${email}`}
        title="Изтрий от списъка"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </span>
  );
}
