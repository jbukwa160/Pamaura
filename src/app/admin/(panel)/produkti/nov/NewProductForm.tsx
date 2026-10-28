"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, Plus } from "lucide-react";
import { createProductAction } from "@/app/admin/_actions/products";
import { Card, Field, MoneyInput, TextInput } from "@/components/admin/ui";
import { parseCents, parseWhole } from "@/components/admin/products/types";

export function NewProductForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("0");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const cents = parseCents(price);
  const count = parseWhole(qty);
  const problems = {
    title: !title.trim() ? "Въведете заглавие." : "",
    price: cents === null ? "Въведете цена." : Number.isNaN(cents) ? "Напр. 12,99" : "",
    qty: Number.isNaN(count) ? "Цяло число бройки." : "",
  };
  const invalid = Object.values(problems).some(Boolean);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (invalid) return;
    setError("");
    start(async () => {
      const r = await createProductAction({ title, price, sku, qty });
      if (r.id) router.push(`/admin/produkti/${r.id}`);
      else setError(r.error ?? "Създаването не успя.");
    });
  };

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl">
      <Card>
        <div className="space-y-5">
          <Field label="Заглавие" error={tried ? problems.title : undefined} hint="Например „Pamaura Cocoa Glow“. Преводът на румънски се добавя след създаването.">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} autoFocus invalid={tried && !!problems.title} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Цена" error={tried ? problems.price : undefined} hint="В евро, с ДДС">
              <MoneyInput value={price} onChange={setPrice} invalid={tried && !!problems.price} placeholder="0,00" />
            </Field>
            <Field label="Наличност (бройки)" error={tried ? problems.qty : undefined}>
              <TextInput inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} invalid={tried && !!problems.qty} />
            </Field>
          </div>
          <Field label="Код на продукта (SKU)" hint="По желание">
            <TextInput value={sku} onChange={(e) => setSku(e.target.value)} maxLength={255} />
          </Field>
          <p className="rounded-2xl bg-sun-soft p-4 text-sm font-bold">Продуктът се създава като чернова: няма да се вижда в магазина, докато не смените статуса му на „Активен“.</p>
          {error ? (
            <p className="flex items-center gap-1.5 text-sm font-bold text-brand" role="alert">
              <CircleAlert className="h-4 w-4" /> {error}
            </p>
          ) : null}
          <button type="submit" disabled={pending} className="btn btn-primary h-12 px-7">
            {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            {pending ? "Създаване…" : "Създай продукта"}
          </button>
        </div>
      </Card>
    </form>
  );
}
