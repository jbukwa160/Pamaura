"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { KINDS, codeTaken, discountById, saveDiscount, sofiaLocalToIso, type DiscountInput } from "@/lib/admin/discounts";
import { getCatalog } from "@/lib/catalog";
import { getDb } from "@/lib/db";

type Result = { ok?: boolean; error?: string; id?: number };

const MAX_CENTS = 100_000_00; // €100 000

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

export async function saveDiscountAction(id: number | null, input: DiscountInput): Promise<Result> {
  await requireAdmin();
  if (id !== null && !validId(id)) return { error: "Невалиден код." };
  if (id !== null && !discountById(id)) return { error: "Този код вече не съществува (може да е изтрит в друг прозорец)." };
  if (!input || typeof input !== "object") return { error: "Невалидни данни." };

  const code = String(input.code ?? "").trim().toUpperCase();
  if (!code) return { error: "Въведете код." };
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) return { error: "Кодът трябва да е от 2 до 40 латински букви, цифри, тире или долна черта (без интервали и кирилица)." };
  if (codeTaken(code, id)) return { error: `Вече има код „${code}“. Изберете друг.` };

  const kind = KINDS.includes(input.kind) ? input.kind : null;
  if (!kind) return { error: "Изберете вид на отстъпката." };
  let value = 0;
  if (kind === "percentage") {
    value = Number(input.value);
    if (!Number.isInteger(value) || value < 1 || value > 100) return { error: "Процентът трябва да е цяло число от 1 до 100." };
  } else if (kind === "fixed_amount") {
    value = Number(input.value);
    if (!Number.isInteger(value) || value < 1 || value > MAX_CENTS) return { error: "Въведете сумата на отстъпката (например 5,00)." };
  }
  const min = Number(input.min_subtotal ?? 0);
  if (!Number.isInteger(min) || min < 0 || min > MAX_CENTS) return { error: "Невалидна минимална сума на поръчката." };

  let appliesTo: { type: "all" } | { type: "products" | "collections"; ids: number[] } = { type: "all" };
  if (input.applies === "products" || input.applies === "collections") {
    const cat = getCatalog();
    const known = input.applies === "products" ? cat.productById : cat.collectionById;
    const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map(Number))].filter((x) => Number.isSafeInteger(x) && known.has(x)).slice(0, 500);
    if (!ids.length) return { error: input.applies === "products" ? "Изберете поне един продукт." : "Изберете поне една колекция." };
    appliesTo = { type: input.applies, ids };
  } else if (input.applies !== "all") return { error: "Изберете за какво важи кодът." };

  const starts = sofiaLocalToIso(String(input.starts_at ?? ""));
  const ends = sofiaLocalToIso(String(input.ends_at ?? ""));
  if (starts === undefined) return { error: "Невалидна начална дата." };
  if (ends === undefined) return { error: "Невалидна крайна дата." };
  if (starts && ends && ends <= starts) return { error: "Крайната дата трябва да е след началната." };

  let limit: number | null = null;
  if (input.usage_limit !== null && input.usage_limit !== undefined) {
    limit = Number(input.usage_limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000_000) return { error: "Ограничението трябва да е цяло число (поне 1) или празно." };
  }
  const note = String(input.note ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 500);

  try {
    const newId = saveDiscount(id, {
      code,
      kind,
      value,
      min_subtotal: min,
      applies_to: JSON.stringify(appliesTo),
      starts_at: starts,
      ends_at: ends,
      usage_limit: limit,
      once_per_customer: input.once_per_customer ? 1 : 0,
      enabled: input.enabled ? 1 : 0,
      note: note || null,
    });
    revalidatePath("/admin/otstapki", "layout");
    return { ok: true, id: newId };
  } catch (e) {
    if (String((e as Error).message).includes("UNIQUE")) return { error: `Вече има код „${code}“. Изберете друг.` };
    throw e;
  }
}

export async function setDiscountEnabledAction(id: number, enabled: boolean): Promise<Result> {
  await requireAdmin();
  if (!validId(id)) return { error: "Невалиден код." };
  const r = getDb().prepare("UPDATE discounts SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  if (!r.changes) return { error: "Този код вече не съществува." };
  revalidatePath("/admin/otstapki", "layout");
  return { ok: true };
}

export async function deleteDiscountAction(id: number): Promise<Result> {
  await requireAdmin();
  if (!validId(id)) return { error: "Невалиден код." };
  const r = getDb().prepare("DELETE FROM discounts WHERE id = ?").run(id);
  if (!r.changes) return { error: "Този код вече не съществува." };
  revalidatePath("/admin/otstapki", "layout");
  return { ok: true };
}
