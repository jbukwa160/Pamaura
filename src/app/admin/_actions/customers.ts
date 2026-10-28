"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { erasePersonalData, updateCustomer } from "@/lib/admin/customers";
import { customerById } from "@/lib/customers";
import { subscribe, unsubscribe } from "@/lib/newsletter";

type Result = { ok?: boolean; error?: string };

export interface CustomerInput {
  first_name: string;
  last_name: string;
  phone: string;
  accepts_marketing: boolean;
  note: string;
  tags: string;
}

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);

/** "VIP, едро, VIP" → ["VIP", "едро"] (at most 20 tags of 40 characters). */
function tagList(text: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text ?? "").split(",")) {
    const t = clean(raw.replace(/[<>"]/g, ""), 40);
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
    if (out.length >= 20) break;
  }
  return out;
}

export async function saveCustomerAction(id: number, input: CustomerInput): Promise<Result> {
  await requireAdmin();
  if (!Number.isSafeInteger(id)) return { error: "Невалиден клиент." };
  const c = customerById(id);
  if (!c) return { error: "Клиентът вече не съществува." };
  const first = clean(input?.first_name, 80);
  const last = clean(input?.last_name, 80);
  const phone = clean(input?.phone, 30);
  if (phone && !/^[+\d\s()./-]+$/.test(phone)) return { error: "Телефонът може да съдържа само цифри, интервали и + ( ) - ." };
  if (phone && phone.replace(/\D/g, "").length < 6) return { error: "Телефонът е твърде кратък." };
  const note = clean(input?.note, 2000).replace(/\r\n/g, "\n");
  const marketing = Boolean(input?.accepts_marketing);
  updateCustomer(id, { first_name: first, last_name: last, phone: phone || null, accepts_marketing: marketing, note: note || null, tags: tagList(input?.tags) });
  // keep the newsletter list in step with the "accepts marketing" box
  if (marketing && !c.accepts_marketing) subscribe(c.email, "admin", c.locale === "ro" ? "ro" : "bg");
  else if (!marketing && c.accepts_marketing) unsubscribe(c.email);
  revalidatePath("/admin/klienti", "layout");
  return { ok: true };
}

/** GDPR: the admin must type the customer's e-mail address to confirm. */
export async function eraseCustomerAction(id: number, confirmEmail: string, alsoNewsletter: boolean): Promise<Result> {
  await requireAdmin();
  if (!Number.isSafeInteger(id)) return { error: "Невалиден клиент." };
  const c = customerById(id);
  if (!c) return { error: "Клиентът вече не съществува." };
  if (String(confirmEmail ?? "").trim().toLowerCase() !== c.email.trim().toLowerCase()) return { error: "Имейлът не съвпада. Въведете точно имейла на клиента." };
  const r = erasePersonalData(c, { newsletter: Boolean(alsoNewsletter) });
  console.info(`[admin] customer ${c.id} personal data erased (${r.orders} orders detached)`);
  revalidatePath("/admin/klienti", "layout");
  redirect(`/admin/klienti?erased=${r.orders}`);
}
