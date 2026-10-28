"use client";

import { useActionState, useState } from "react";
import { CircleAlert, Eye, EyeOff, LoaderCircle, LogIn } from "lucide-react";
import { loginAction } from "../_actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-extrabold">Потребителско име</span>
        <input name="username" autoComplete="username" required autoFocus={!state?.username} defaultValue={state?.username} className="field" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-extrabold">Парола</span>
        <span className="flex items-center rounded-[0.875rem] border-2 border-line bg-white focus-within:border-sky">
          <input
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            autoFocus={!!state?.username}
            required
            className="w-full bg-transparent px-3.5 py-2.5 outline-none focus-visible:outline-none"
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="px-3 text-muted hover:text-ink" aria-label={show ? "Скрий паролата" : "Покажи паролата"}>
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </span>
      </label>
      <label className="flex items-center gap-2.5 text-sm font-bold text-ink-soft">
        <input type="checkbox" name="remember" className="h-5 w-5 accent-brand" /> Запомни ме на този компютър (30 дни)
      </label>
      {state?.error ? (
        <p className="flex items-start gap-2 rounded-2xl bg-brand-soft p-3 text-sm font-bold text-brand-dark" role="alert">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary h-12 w-full text-lg">
        {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
        Вход
      </button>
    </form>
  );
}
