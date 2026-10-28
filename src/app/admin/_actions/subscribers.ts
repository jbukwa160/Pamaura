"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { deleteSubscriber } from "@/lib/admin/subscribers";
import { getDb } from "@/lib/db";
import { unsubscribe } from "@/lib/newsletter";

type Result = { ok?: boolean; error?: string };

function validEmail(v: unknown): string | null {
  const e = String(v ?? "").trim();
  return e.length > 0 && e.length <= 254 && !/[\s<>]/.test(e) && e.includes("@") ? e : null;
}

export async function unsubscribeAction(email: string): Promise<Result> {
  await requireAdmin();
  const e = validEmail(email);
  if (!e) return { error: "Невалиден имейл." };
  if (!getDb().prepare("SELECT 1 FROM subscribers WHERE email = ?").get(e)) return { error: "Този абонат вече не съществува." };
  unsubscribe(e);
  revalidatePath("/admin/abonati");
  return { ok: true };
}

export async function deleteSubscriberAction(email: string): Promise<Result> {
  await requireAdmin();
  const e = validEmail(email);
  if (!e) return { error: "Невалиден имейл." };
  if (!deleteSubscriber(e)) return { error: "Този абонат вече не съществува." };
  revalidatePath("/admin/abonati");
  return { ok: true };
}
