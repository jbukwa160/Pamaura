"use client";

import { useActionState, useState } from "react";
import { Check, CircleAlert, Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { changePasswordAction } from "@/app/admin/_actions/auth";

function PasswordField({ name, label, autoComplete, show, hint }: { name: string; label: string; autoComplete: string; show: boolean; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-extrabold">{label}</span>
      <input name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required maxLength={200} className="field" />
      {hint ? <span className="mt-1.5 block text-sm text-muted">{hint}</span> : null}
    </label>
  );
}

export function PasswordForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="max-w-md space-y-4">
      {/* lets the browser's password manager save the new password for the right account */}
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <PasswordField name="current" label="Сегашна парола" autoComplete="current-password" show={show} />
      <PasswordField name="next" label="Нова парола" autoComplete="new-password" show={show} hint="Поне 10 знака, с поне една буква и една цифра." />
      <PasswordField name="repeat" label="Новата парола отново" autoComplete="new-password" show={show} />
      <label className="flex items-center gap-2.5 text-sm font-bold text-ink-soft">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-5 w-5 accent-brand" />
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} Покажи паролите
      </label>
      {state?.error ? (
        <p className="flex items-start gap-2 rounded-2xl bg-brand-soft p-3 text-sm font-bold text-brand-dark" role="alert">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </p>
      ) : state?.ok ? (
        <p className="flex items-start gap-2 rounded-2xl bg-mint-soft p-3 text-sm font-bold text-mint" role="status">
          <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={3} /> Паролата е сменена. Входовете от други устройства са прекратени — там трябва да влезете отново с новата парола.
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary h-12 px-7">
        {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
        {pending ? "Смяна…" : "Смени паролата"}
      </button>
    </form>
  );
}
