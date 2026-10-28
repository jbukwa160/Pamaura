"use client";
// Order page controls: status, payment, tracking, courier waybill, notes, resend confirmation.
import { useState, useTransition } from "react";
import { Check, CircleAlert, Download, LoaderCircle, Mail, PackagePlus, Save, Truck, X } from "lucide-react";
import {
  cancelWaybillAction,
  changeStatusAction,
  createWaybillAction,
  resendConfirmationAction,
  saveNoteAction,
  saveTrackingAction,
  setPaidAction,
} from "@/app/admin/_actions/orders";
import { ConfirmButton, Field, Select, TextArea, TextInput, Toggle, cx } from "@/components/admin/ui";

type Msg = { kind: "ok" | "error"; text: string } | null;

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p className={cx("mt-3 flex items-start gap-1.5 text-sm font-bold", msg.kind === "ok" ? "text-mint" : "text-brand")} role={msg.kind === "error" ? "alert" : "status"}>
      {msg.kind === "ok" ? <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={3} /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />} {msg.text}
    </p>
  );
}

const STATUSES = [
  { key: "new", label: "Нова" },
  { key: "confirmed", label: "Потвърдена" },
  { key: "shipped", label: "Изпратена" },
  { key: "delivered", label: "Доставена" },
  { key: "cancelled", label: "Отказана" },
  { key: "returned", label: "Върната" },
];
const STOCK_OUT = new Set(["new", "confirmed", "shipped", "delivered"]);

export function StatusForm({ orderId, status }: { orderId: number; status: string }) {
  const [next, setNext] = useState(status);
  const [notify, setNotify] = useState(true);
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const releasesStock = STOCK_OUT.has(status) && !STOCK_OUT.has(next);
  const mailable = next === "shipped" || next === "delivered" || next === "cancelled";
  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await changeStatusAction(orderId, next, { restock: releasesStock && restock, notify: mailable && notify, reason: next === "cancelled" ? reason : undefined });
      setMsg(r.ok ? { kind: "ok", text: r.message ? `Статусът е сменен. ${r.message}` : "Статусът е сменен." } : { kind: "error", text: r.error || "Грешка." });
    });
  return (
    <div className="space-y-4">
      <Field label="Нов статус">
        <Select value={next} onChange={(e) => setNext(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
              {s.key === status ? " (сегашен)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      {next === "cancelled" && next !== status ? (
        <Field label="Причина (по желание)" hint="Вижда се в имейла до клиента.">
          <TextInput value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </Field>
      ) : null}
      {releasesStock && next !== status ? <Toggle checked={restock} onChange={setRestock} label="Върни продуктите в наличност" /> : null}
      {mailable && next !== status ? (
        <Toggle checked={notify} onChange={setNotify} label="Уведоми клиента по имейл" description={next === "shipped" ? "С номера на пратката, ако има такъв." : undefined} />
      ) : null}
      <button type="button" onClick={save} disabled={pending || next === status} className="btn btn-primary h-11 w-full px-5">
        {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} Смени статуса
      </button>
      <Note msg={msg} />
    </div>
  );
}

export function PaymentToggle({ orderId, paid }: { orderId: number; paid: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => void (await setPaidAction(orderId, !paid)))} className={cx("btn h-10 w-full px-4 text-sm", paid ? "btn-ghost" : "btn-primary !shadow-none")}>
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      {paid ? "Отбележи като неплатена" : "Отбележи като платена"}
    </button>
  );
}

export function NoteForm({ orderId, note }: { orderId: number; note: string }) {
  const [value, setValue] = useState(note);
  const [saved, setSaved] = useState(note);
  const [pending, start] = useTransition();
  return (
    <Field label="Вътрешна бележка" hint="Вижда се само тук.">
      <TextArea rows={3} value={value} maxLength={4000} onChange={(e) => setValue(e.target.value)} />
      {value !== saved ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveNoteAction(orderId, value);
              if (r.ok) setSaved(value);
            })
          }
          className="btn btn-primary mt-2 h-10 px-4 text-sm !shadow-none"
        >
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Запази бележката
        </button>
      ) : null}
    </Field>
  );
}

export function TrackingForm({ orderId, number, company, url }: { orderId: number; number: string; company: string; url: string | null }) {
  const [n, setN] = useState(number);
  const [c, setC] = useState(company);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const dirty = n !== number || c !== company;
  return (
    <div>
      <p className="mb-2 text-sm font-extrabold">Номер на пратка</p>
      <div className="flex flex-wrap gap-2">
        <TextInput value={n} onChange={(e) => setN(e.target.value)} placeholder="напр. 1051234567890" className="min-w-0 flex-1" aria-label="Номер на пратка" maxLength={64} />
        <Select value={c} onChange={(e) => setC(e.target.value)} className="!w-auto" aria-label="Куриер">
          <option value="">Куриер…</option>
          <option value="econt">Еконт</option>
          <option value="speedy">Speedy</option>
          <option value="boxnow">BOX NOW</option>
          <option value="other">Друг</option>
        </Select>
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            start(async () => {
              const r = await saveTrackingAction(orderId, n, c);
              setMsg(r.ok ? { kind: "ok", text: "Запазено." } : { kind: "error", text: r.error || "Грешка." });
            })
          }
          className="btn btn-ghost h-12 px-5"
        >
          Запази
        </button>
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-bold text-sky hover:underline">
          Проследяване при куриера →
        </a>
      ) : null}
      <p className="mt-1.5 text-sm text-muted">Попълва се автоматично, когато създадете товарителница тук. Влиза в имейла „Изпратена поръчка“.</p>
      <Note msg={msg} />
    </div>
  );
}

export function WaybillPanel(props: {
  orderId: number;
  carrier: string | null;
  carrierName: string;
  configured: boolean;
  shipment: { trackingNumber: string; createdAt: string; weightKg: number; codAmount: number } | null;
  defaults: { weightKg: number; cod: boolean; total: string; boxnow: boolean };
  currencyOk: boolean;
}) {
  const [weight, setWeight] = useState(String(props.defaults.weightKg).replace(".", ","));
  const [parcels, setParcels] = useState("1");
  const [cod, setCod] = useState(props.defaults.cod);
  const [declared, setDeclared] = useState("");
  const [contents, setContents] = useState("Козметика");
  const [box, setBox] = useState<"1" | "2" | "3">("2");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  if (!props.carrier) {
    return <p className="text-sm text-muted">Товарителница от тук може да се създаде само за доставки с Еконт, Speedy или BOX NOW. Въведете номера на пратката ръчно по-долу.</p>;
  }
  if (props.shipment) {
    return (
      <div className="rounded-2xl border-2 border-mint-soft bg-mint-soft/40 p-4">
        <p className="flex items-center gap-2 font-extrabold">
          <Truck className="h-5 w-5 text-mint" /> Товарителница {props.carrierName}: {props.shipment.trackingNumber}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          Създадена {props.shipment.createdAt} · {String(props.shipment.weightKg).replace(".", ",")} кг{props.shipment.codAmount ? ` · наложен платеж ${props.shipment.codAmount.toFixed(2).replace(".", ",")} €` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`/admin/poruchki/${props.orderId}/etiket`} target="_blank" rel="noopener" className="btn btn-primary h-10 px-4 text-sm !shadow-none">
            <Download className="h-4 w-4" /> Етикет (PDF)
          </a>
          <ConfirmButton
            question="Да анулирам ли товарителницата при куриера?"
            disabled={pending}
            onConfirm={() =>
              start(async () => {
                const r = await cancelWaybillAction(props.orderId);
                setMsg(r.ok ? { kind: "ok", text: "Товарителницата е анулирана." } : { kind: "error", text: r.error || "Грешка." });
              })
            }
          >
            <X className="h-4 w-4" /> Анулирай
          </ConfirmButton>
        </div>
        <Note msg={msg} />
      </div>
    );
  }
  if (!props.configured) {
    return (
      <p className="rounded-2xl bg-sun-soft p-4 text-sm font-bold">
        {props.carrierName} не е свързан, затова товарителница не може да се създаде от тук. Данните за вход се попълват в .env.local (виж „Доставка и плащане“). Дотогава създайте пратката в профила си при куриера и въведете номера по-долу.
      </p>
    );
  }
  if (!props.currencyOk) {
    return <p className="text-sm text-muted">Поръчката е в друга валута; създайте пратката при куриера ръчно и въведете номера по-долу.</p>;
  }
  const create = () =>
    start(async () => {
      setMsg(null);
      const r = await createWaybillAction(props.orderId, {
        weightKg: Number(weight.replace(",", ".")),
        parcels: Number(parcels),
        cod,
        declaredValue: Number(declared.replace(",", ".")) || 0,
        contents,
        boxSize: props.defaults.boxnow ? (Number(box) as 1 | 2 | 3) : undefined,
      });
      setMsg(r.ok ? { kind: "ok", text: "Товарителницата е създадена." } : { kind: "error", text: r.error || "Грешка." });
    });
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="mb-3 flex items-center gap-2 font-extrabold">
        <PackagePlus className="h-5 w-5" /> Товарителница {props.carrierName}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Тегло (кг)">
          <TextInput value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Пакети">
          <TextInput value={parcels} onChange={(e) => setParcels(e.target.value)} inputMode="numeric" />
        </Field>
        {props.defaults.boxnow ? (
          <Field label="Размер на клетката">
            <Select value={box} onChange={(e) => setBox(e.target.value as "1" | "2" | "3")}>
              <option value="1">Малка</option>
              <option value="2">Средна</option>
              <option value="3">Голяма</option>
            </Select>
          </Field>
        ) : (
          <Field label="Обявена стойност (€)" hint="По желание.">
            <TextInput value={declared} onChange={(e) => setDeclared(e.target.value)} inputMode="decimal" />
          </Field>
        )}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Съдържание">
          <TextInput value={contents} maxLength={100} onChange={(e) => setContents(e.target.value)} />
        </Field>
        <div className="pt-7">
          <Toggle checked={cod} onChange={setCod} label={`Наложен платеж ${props.defaults.total}`} />
        </div>
      </div>
      <button type="button" onClick={create} disabled={pending} className="btn btn-primary mt-4 h-11 px-5">
        {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Truck className="h-5 w-5" />} Създай товарителница
      </button>
      <Note msg={msg} />
    </div>
  );
}

export function ResendButton({ orderId }: { orderId: number }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-2">
      <ConfirmButton
        className="btn btn-ghost h-10 px-4 text-sm"
        question="Да изпратя ли отново потвърждението на поръчката до клиента?"
        disabled={pending}
        onConfirm={() =>
          start(async () => {
            const r = await resendConfirmationAction(orderId);
            setMsg(r.ok ? { kind: "ok", text: r.message || "Изпратено." } : { kind: "error", text: r.error || "Грешка." });
          })
        }
      >
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Изпрати потвърждението пак
      </ConfirmButton>
      {msg ? <span className={cx("text-sm font-bold", msg.kind === "ok" ? "text-mint" : "text-brand")}>{msg.text}</span> : null}
    </span>
  );
}
