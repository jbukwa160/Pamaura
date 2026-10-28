// Orders in the admin: lists, status changes (with stock), payments, courier waybills.
import "server-only";
import { getDb, nowIso } from "../db";
import { STATUS_LABELS, addOrderEvent, orderById, orderLines, type OrderRec } from "../orders";
import { sendStatusEmail } from "../emails/order";
import { getCarrier, isCarrier, trackingUrl, type CarrierId, type Shipment, type ShipmentInput } from "../shipping/couriers";
import { catalogChanged, likeTerm } from "./common";

export const STATUS_TABS = [
  { key: "all", label: "Всички" },
  { key: "new", label: "Нови" },
  { key: "confirmed", label: "Потвърдени" },
  { key: "shipped", label: "Изпратени" },
  { key: "delivered", label: "Доставени" },
  { key: "cancelled", label: "Отказани" },
  { key: "returned", label: "Върнати" },
] as const;

export const STATUS_TONE: Record<string, "sun" | "sky" | "grape" | "mint" | "brand" | "muted"> = {
  new: "sun",
  confirmed: "sky",
  shipped: "grape",
  delivered: "mint",
  cancelled: "brand",
  returned: "muted",
};

export const PAYMENT_LABELS: Record<string, string> = { cod: "Наложен платеж", bank_transfer: "Банков превод" };
export const FINANCIAL_LABELS: Record<string, string> = { pending: "Очаква плащане", paid: "Платена", refunded: "Възстановена", voided: "Анулирана" };

export interface ShipTo {
  first_name?: string;
  last_name?: string;
  name?: string;
  phone?: string;
  email?: string;
  kind?: "office" | "locker" | "address";
  carrier?: string;
  office_id?: string | null;
  office_name?: string | null;
  office_address?: string | null;
  city?: string;
  city_id?: string | null;
  zip?: string;
  address1?: string;
  address2?: string;
  country?: string;
  country_code?: string;
}

export function shipTo(o: OrderRec): ShipTo {
  try {
    return JSON.parse(o.shipping_address || "{}") as ShipTo;
  } catch {
    return {};
  }
}

export function listOrders(opts: { status?: string; q?: string; page?: number; perPage?: number; customerId?: number }) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.status && opts.status !== "all") {
    where.push("status = ?");
    args.push(opts.status);
  }
  if (opts.customerId) {
    where.push("customer_id = ?");
    args.push(opts.customerId);
  }
  const q = (opts.q || "").trim();
  if (q) {
    const num = q.replace(/^#/, "");
    if (/^\d+$/.test(num)) {
      where.push("(number = ? OR phone LIKE ? ESCAPE '\\')");
      args.push(Number(num), likeTerm(num));
    } else {
      where.push("(email LIKE ? ESCAPE '\\' OR shipping_address LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR tracking_number LIKE ? ESCAPE '\\')");
      args.push(likeTerm(q), likeTerm(q), likeTerm(q), likeTerm(q));
    }
  }
  const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM orders ${sql}`).get(...args) as { n: number }).n;
  const perPage = opts.perPage ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  const rows = db.prepare(`SELECT * FROM orders ${sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...args, perPage, (page - 1) * perPage) as OrderRec[];
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export function statusCounts(): Record<string, number> {
  const rows = getDb().prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all() as { status: string; n: number }[];
  const out: Record<string, number> = { all: 0 };
  for (const r of rows) {
    out[r.status] = r.n;
    out.all += r.n;
  }
  return out;
}

/** Puts the ordered quantities back into stock (cancel / return) or takes them out again (re-open). */
function moveStock(orderId: number, direction: 1 | -1) {
  const db = getDb();
  const upd = db.prepare("UPDATE variants SET inventory_quantity = inventory_quantity + ?, updated_at = ? WHERE id = ? AND inventory_management IS NOT NULL");
  for (const l of orderLines(orderId)) if (l.variant_id) upd.run(direction * l.quantity, nowIso(), l.variant_id);
}

const STOCK_OUT = new Set(["new", "confirmed", "shipped", "delivered"]);

export async function changeStatus(
  orderId: number,
  status: string,
  opts: { author: string; restock: boolean; notify: boolean; reason?: string; origin: string },
): Promise<{ ok: boolean; error?: string; mail?: string }> {
  const order = orderById(orderId);
  if (!order) return { ok: false, error: "Поръчката не съществува." };
  if (order.status === status) return { ok: true };
  const db = getDb();
  const now = nowIso();
  let stockNote = "";
  db.transaction(() => {
    const wasOut = STOCK_OUT.has(order.status);
    const isOut = STOCK_OUT.has(status);
    if (opts.restock && wasOut && !isOut) {
      moveStock(orderId, 1);
      stockNote = " Наличностите са върнати.";
    } else if (!wasOut && isOut && order.attributes && JSON.parse(order.attributes || "{}").__restocked) {
      moveStock(orderId, -1);
      stockNote = " Наличностите са извадени отново.";
    }
    const attrs = JSON.parse(order.attributes || "{}");
    if (stockNote.includes("върнати")) attrs.__restocked = true;
    else if (stockNote.includes("отново")) delete attrs.__restocked;
    db.prepare(
      `UPDATE orders SET status = ?, attributes = ?, updated_at = ?,
        cancelled_at = CASE WHEN ? = 'cancelled' THEN ? ELSE cancelled_at END,
        cancel_reason = CASE WHEN ? = 'cancelled' THEN ? ELSE cancel_reason END,
        fulfillment_status = CASE WHEN ? IN ('shipped','delivered') THEN 'fulfilled' WHEN ? = 'returned' THEN 'returned' ELSE fulfillment_status END,
        financial_status = CASE WHEN ? = 'delivered' AND payment_method = 'cod' THEN 'paid' ELSE financial_status END
       WHERE id = ?`,
    ).run(status, JSON.stringify(attrs), now, status, now, status, opts.reason || null, status, status, status, orderId);
    addOrderEvent(orderId, "status", `Статус: ${STATUS_LABELS[order.status] ?? order.status} → ${STATUS_LABELS[status] ?? status}.${stockNote}`, opts.author);
  })();
  if (stockNote) catalogChanged();
  let mail: string | undefined;
  if (opts.notify && (status === "shipped" || status === "delivered" || status === "cancelled")) {
    try {
      const r = await sendStatusEmail(orderById(orderId)!, status, opts.origin);
      mail = r === "sent" ? "Имейлът до клиента е изпратен." : "Имейлът е в опашката (пощата не е настроена или не отговаря).";
      addOrderEvent(orderId, "email", `Имейл до клиента: ${status === "shipped" ? "изпратена" : status === "delivered" ? "доставена" : "отказана"} поръчка.`, opts.author);
    } catch (e) {
      mail = `Имейлът не беше изпратен: ${(e as Error).message}`;
    }
  }
  return { ok: true, mail };
}

export function setPaid(orderId: number, paid: boolean, author: string) {
  getDb().prepare("UPDATE orders SET financial_status = ?, updated_at = ? WHERE id = ?").run(paid ? "paid" : "pending", nowIso(), orderId);
  addOrderEvent(orderId, "payment", paid ? "Отбелязана като платена." : "Отбелязана като неплатена.", author);
}

export function setAdminNote(orderId: number, note: string) {
  getDb().prepare("UPDATE orders SET admin_note = ?, updated_at = ? WHERE id = ?").run(note.trim() || null, nowIso(), orderId);
}

export function setTracking(orderId: number, number: string, company: string, author: string) {
  const n = number.trim().slice(0, 64);
  const c = company.trim().slice(0, 40);
  const url = n && isCarrier(c) ? trackingUrl(c, n) : null;
  getDb().prepare("UPDATE orders SET tracking_number = ?, tracking_company = ?, tracking_url = ?, updated_at = ? WHERE id = ?").run(n || null, c || null, url, nowIso(), orderId);
  addOrderEvent(orderId, "tracking", n ? `Номер на пратка: ${n}${c ? ` (${c})` : ""}.` : "Номерът на пратката е премахнат.", author);
}

// ---- courier waybills

export function orderShipment(o: OrderRec): Shipment | null {
  if (!o.waybill) return null;
  try {
    return JSON.parse(o.waybill) as Shipment;
  } catch {
    return null;
  }
}

export function orderCarrier(o: OrderRec): CarrierId | null {
  const c = shipTo(o).carrier;
  return isCarrier(c) ? c : null;
}

/** Parcel weight from the products (kg); 0.5 kg when nothing is set. */
export function orderWeight(orderId: number): number {
  const lines = orderLines(orderId);
  const kg = lines.reduce((n, l) => n + (l.weight > 50 ? l.weight / 1000 : l.weight) * l.quantity, 0);
  return Math.max(0.1, Math.round((kg || 0.5) * 100) / 100);
}

export async function createWaybill(
  orderId: number,
  input: { weightKg: number; parcels: number; cod: boolean; declaredValue: number; contents: string; boxSize?: 1 | 2 | 3 },
  author: string,
): Promise<{ ok: boolean; error?: string }> {
  const order = orderById(orderId);
  if (!order) return { ok: false, error: "Поръчката не съществува." };
  if (orderShipment(order)) return { ok: false, error: "Тази поръчка вече има товарителница." };
  const carrier = orderCarrier(order);
  if (!carrier) return { ok: false, error: "Доставката на тази поръчка не е с Еконт, Speedy или BOX NOW." };
  const adapter = getCarrier(carrier);
  if (!adapter.isConfigured()) return { ok: false, error: "Куриерът не е свързан — липсват данните за вход в .env.local (виж Доставка и плащане)." };
  const to = shipTo(order);
  // amounts in euro for the courier; RON orders are not shipped with Bulgarian couriers
  const eur = (cents: number) => Math.round(cents) / 100;
  const shipment: ShipmentInput = {
    orderNumber: order.number,
    recipient: { name: to.name || `${to.first_name ?? ""} ${to.last_name ?? ""}`.trim(), phone: order.phone || to.phone || "", email: order.email },
    delivery: {
      kind: to.kind || "address",
      officeId: to.office_id || undefined,
      city: to.city || "",
      cityId: to.city_id || undefined,
      postcode: to.zip || undefined,
      address1: to.kind === "address" ? to.address1 : undefined,
      address2: to.kind === "address" ? to.address2 : undefined,
    },
    codAmount: input.cod ? eur(order.total) : 0,
    declaredValue: input.declaredValue,
    weightKg: input.weightKg,
    parcels: input.parcels,
    contents: input.contents,
    boxSize: input.boxSize,
  };
  try {
    const r = await adapter.createShipment(shipment);
    const stored: Shipment = { ...r, carrier, createdAt: nowIso(), weightKg: input.weightKg, parcels: input.parcels, codAmount: shipment.codAmount, declaredValue: input.declaredValue };
    getDb()
      .prepare("UPDATE orders SET waybill = ?, tracking_number = ?, tracking_company = ?, tracking_url = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(stored), r.trackingNumber, carrier, trackingUrl(carrier, r.trackingNumber), nowIso(), orderId);
    addOrderEvent(orderId, "waybill", `Създадена товарителница ${r.trackingNumber} (${carrier}).`, author);
    return { ok: true };
  } catch (e) {
    const { courierErrorMessage } = await import("../shipping/couriers");
    return { ok: false, error: courierErrorMessage(e) };
  }
}

export async function cancelWaybill(orderId: number, author: string): Promise<{ ok: boolean; error?: string }> {
  const order = orderById(orderId);
  const sh = order ? orderShipment(order) : null;
  if (!order || !sh) return { ok: false, error: "Няма товарителница." };
  try {
    await getCarrier(sh.carrier).cancelShipment(sh);
  } catch (e) {
    const { courierErrorMessage } = await import("../shipping/couriers");
    return { ok: false, error: courierErrorMessage(e) };
  }
  getDb().prepare("UPDATE orders SET waybill = NULL, tracking_number = NULL, tracking_url = NULL, updated_at = ? WHERE id = ?").run(nowIso(), orderId);
  addOrderEvent(orderId, "waybill", `Товарителница ${sh.trackingNumber} е анулирана.`, author);
  return { ok: true };
}
