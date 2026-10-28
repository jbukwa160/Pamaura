"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { cancelWaybill, changeStatus, createWaybill, setAdminNote, setPaid, setTracking, STATUS_TABS } from "@/lib/admin/orders";
import { addOrderEvent, orderById } from "@/lib/orders";
import { sendOrderEmails } from "@/lib/emails/order";
import { buildRequest } from "@/lib/storefront/context";
import { getCatalog } from "@/lib/catalog";

type Result = { ok?: boolean; error?: string; message?: string };

/** The site address for links in e-mails (SITE_URL, or the address the admin is using). */
async function origin(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const VALID = new Set<string>(STATUS_TABS.map((t) => t.key).filter((k) => k !== "all"));

export async function changeStatusAction(orderId: number, status: string, opts: { restock: boolean; notify: boolean; reason?: string }): Promise<Result> {
  const admin = await requireAdmin();
  if (!VALID.has(status)) return { error: "Невалиден статус." };
  const r = await changeStatus(orderId, status, { author: admin.username, restock: opts.restock, notify: opts.notify, reason: opts.reason?.slice(0, 300), origin: await origin() });
  revalidatePath(`/admin/poruchki/${orderId}`);
  return r.ok ? { ok: true, message: r.mail } : { error: r.error };
}

export async function setPaidAction(orderId: number, paid: boolean): Promise<Result> {
  const admin = await requireAdmin();
  setPaid(orderId, paid, admin.username);
  revalidatePath(`/admin/poruchki/${orderId}`);
  return { ok: true };
}

export async function saveNoteAction(orderId: number, note: string): Promise<Result> {
  await requireAdmin();
  setAdminNote(orderId, note.slice(0, 4000));
  return { ok: true };
}

export async function saveTrackingAction(orderId: number, number: string, company: string): Promise<Result> {
  const admin = await requireAdmin();
  setTracking(orderId, number, company, admin.username);
  revalidatePath(`/admin/poruchki/${orderId}`);
  return { ok: true };
}

export async function createWaybillAction(
  orderId: number,
  input: { weightKg: number; parcels: number; cod: boolean; declaredValue: number; contents: string; boxSize?: 1 | 2 | 3 },
): Promise<Result> {
  const admin = await requireAdmin();
  const weightKg = Math.min(50, Math.max(0.1, Number(input.weightKg) || 0.5));
  const parcels = Math.min(10, Math.max(1, Math.round(Number(input.parcels) || 1)));
  const declaredValue = Math.max(0, Number(input.declaredValue) || 0);
  const r = await createWaybill(orderId, { weightKg, parcels, cod: Boolean(input.cod), declaredValue, contents: String(input.contents || "").slice(0, 100), boxSize: input.boxSize }, admin.username);
  revalidatePath(`/admin/poruchki/${orderId}`);
  return r.ok ? { ok: true } : { error: r.error };
}

export async function cancelWaybillAction(orderId: number): Promise<Result> {
  const admin = await requireAdmin();
  const r = await cancelWaybill(orderId, admin.username);
  revalidatePath(`/admin/poruchki/${orderId}`);
  return r.ok ? { ok: true } : { error: r.error };
}

/** Sends the order confirmation to the customer again. */
export async function resendConfirmationAction(orderId: number): Promise<Result> {
  const admin = await requireAdmin();
  const order = orderById(orderId);
  if (!order) return { error: "Поръчката не съществува." };
  const o = await origin();
  const market = getCatalog().markets.find((m) => m.handle === order.market) || getCatalog().markets[0];
  const sr = buildRequest(new Request(`${o}/${market.path}`), { market, prefixed: true, rest: "/" });
  sr.state.origin = o;
  try {
    await sendOrderEmails(order, sr.state, { shop: false });
  } catch (e) {
    return { error: `Имейлът не беше изпратен: ${(e as Error).message}` };
  }
  addOrderEvent(orderId, "email", "Потвърждението е изпратено отново.", admin.username);
  revalidatePath(`/admin/poruchki/${orderId}`);
  return { ok: true, message: "Потвърждението е изпратено." };
}
