"use client";

import { useState, useTransition } from "react";
import { CircleAlert, LoaderCircle, ShieldAlert, Trash2 } from "lucide-react";
import { eraseCustomerAction, saveCustomerAction, type CustomerInput } from "@/app/admin/_actions/customers";
import { Card, Field, SaveBar, TextArea, TextInput, Toggle, useEditor } from "@/components/admin/ui";

export function CustomerEditor({ id, initial, orders, side }: { id: number; initial: CustomerInput; orders: React.ReactNode; side: React.ReactNode }) {
  const ed = useEditor(initial, (v) => saveCustomerAction(id, v));
  const v = ed.value;
  const set = <K extends keyof CustomerInput>(k: K, val: CustomerInput[K]) => ed.setValue((o) => ({ ...o, [k]: val }));

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card title="Данни на клиента" description="Имейлът не може да се променя — с него клиентът влиза и получава имейлите за поръчките.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Име">
                <TextInput value={v.first_name} maxLength={80} onChange={(e) => set("first_name", e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Фамилия">
                <TextInput value={v.last_name} maxLength={80} onChange={(e) => set("last_name", e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Телефон" className="sm:col-span-2">
                <TextInput value={v.phone} maxLength={30} inputMode="tel" onChange={(e) => set("phone", e.target.value)} placeholder="+359 888 123 456" autoComplete="off" />
              </Field>
              <Field label="Етикети" hint="Разделени със запетая, напр. „VIP, едро“. Виждат се само тук." className="sm:col-span-2">
                <TextInput value={v.tags} maxLength={900} onChange={(e) => set("tags", e.target.value)} />
              </Field>
              <Field label="Бележка" hint="Само за вас — клиентът не я вижда." className="sm:col-span-2">
                <TextArea rows={3} value={v.note} maxLength={2000} onChange={(e) => set("note", e.target.value)} />
              </Field>
            </div>
            <Toggle
              className="mt-5"
              checked={v.accepts_marketing}
              onChange={(x) => set("accepts_marketing", x)}
              label="Съгласен е да получава бюлетин"
              description="Включвайте само ако клиентът ви е дал съгласие. Промяната се отразява и в „Абонати“."
            />
          </Card>
          {orders}
        </div>
        <div className="space-y-6">{side}</div>
      </div>
      <SaveBar dirty={ed.dirty} pending={ed.pending} status={ed.status} onSave={ed.submit} onReset={ed.reset} />
    </>
  );
}

/** "Изтрий личните данни (GDPR)": the admin types the customer's e-mail to unlock the button. */
export function EraseCustomer({ id, email, orders }: { id: number; email: string; orders: number }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [newsletter, setNewsletter] = useState(true);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  const erase = () =>
    start(async () => {
      setError("");
      if (!window.confirm(`Последно потвърждение: изтриване на личните данни на ${email}? Това не може да се отмени.`)) return;
      const r = await eraseCustomerAction(id, typed, newsletter);
      // on success the action redirects to the customer list
      if (r?.error) setError(r.error);
    });

  return (
    <Card className="border-brand-soft" title="Изтриване на личните данни (GDPR)" description="Когато клиент поиска да бъде „забравен“.">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn btn-danger h-11 px-5">
          <ShieldAlert className="h-5 w-5" /> Изтрий личните данни (GDPR)
        </button>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-brand-soft p-4 text-[0.95rem] text-brand-dark">
            <p className="font-black">Това не може да се отмени. Изтриват се:</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 font-semibold">
              <li>клиентът (имена, имейл, телефон, бележка, етикети) и профилът му в сайта;</li>
              <li>запазените адреси;</li>
              <li>влизанията и връзките за смяна на парола.</li>
            </ul>
            <p className="mt-2 font-semibold">
              {orders
                ? `${orders} ${orders === 1 ? "поръчка остава" : "поръчки остават"} в „Поръчки“ (нужни са за счетоводството), но вече няма да са свързани с клиента.`
                : "Клиентът няма поръчки."}
            </p>
          </div>
          <label className="flex items-start gap-2.5 text-[0.95rem] font-bold">
            <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
            Изтрий имейла и от списъка с абонати за бюлетина
          </label>
          <Field label={<>За потвърждение въведете имейла на клиента: <span className="break-all font-black">{email}</span></>}>
            <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} placeholder={email} invalid={!!typed && !matches} />
          </Field>
          {error ? (
            <p className="flex items-center gap-1.5 text-sm font-bold text-brand" role="alert">
              <CircleAlert className="h-4 w-4" /> {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={erase} disabled={!matches || pending} className="btn btn-primary h-11 px-5">
              {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />} Изтрий завинаги
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError("");
              }}
              className="btn btn-ghost h-11 px-5"
              disabled={pending}
            >
              Отказ
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
