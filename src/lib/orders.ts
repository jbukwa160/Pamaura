// Orders: records, queries and status changes. Creation lives in checkout.ts.
import { getDb, nowIso } from "./db";

export interface OrderRec {
  id: number;
  number: number;
  token: string;
  idempotency_key: string | null;
  customer_id: number | null;
  email: string;
  phone: string | null;
  market: string;
  locale: string;
  currency: string;
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  cod_fee: number;
  total: number;
  tax_included: number;
  tax_total: number;
  discount_code: string | null;
  payment_method: string;
  financial_status: string;
  fulfillment_status: string;
  status: string;
  shipping_method: string;
  shipping_title: string;
  shipping_address: string;
  billing_address: string | null;
  note: string | null;
  admin_note: string | null;
  attributes: string;
  tracking_number: string | null;
  tracking_company: string | null;
  tracking_url: string | null;
  waybill: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderLineRec {
  id: number;
  order_id: number;
  product_id: number | null;
  variant_id: number | null;
  title: string;
  variant_title: string | null;
  sku: string | null;
  image: string | null;
  handle: string | null;
  quantity: number;
  price: number;
  original_price: number;
  compare_at_price: number | null;
  discount_allocated: number;
  properties: string;
  requires_shipping: number;
  weight: number;
}

export const ORDER_STATUSES = ["new", "confirmed", "shipped", "delivered", "cancelled", "returned"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  new: "Нова",
  confirmed: "Потвърдена",
  shipped: "Изпратена",
  delivered: "Доставена",
  cancelled: "Отказана",
  returned: "Върната",
};

export function listCustomerOrders(customerId: number): OrderRec[] {
  return getDb().prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC").all(customerId) as OrderRec[];
}

export function orderByToken(token: string): OrderRec | null {
  return (getDb().prepare("SELECT * FROM orders WHERE token = ?").get(token) as OrderRec | undefined) || null;
}

export function orderById(id: number): OrderRec | null {
  return (getDb().prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRec | undefined) || null;
}

export function orderLines(orderId: number): OrderLineRec[] {
  return getDb().prepare("SELECT * FROM order_lines WHERE order_id = ? ORDER BY id").all(orderId) as OrderLineRec[];
}

export function orderEvents(orderId: number) {
  return getDb().prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY id DESC").all(orderId) as {
    id: number;
    kind: string;
    message: string;
    author: string | null;
    created_at: string;
  }[];
}

export function addOrderEvent(orderId: number, kind: string, message: string, author: string | null = null) {
  getDb().prepare("INSERT INTO order_events(order_id, kind, message, author, created_at) VALUES(?, ?, ?, ?, ?)").run(orderId, kind, message, author, nowIso());
}

export function nextOrderNumber(): number {
  const row = getDb().prepare("SELECT MAX(number) AS m FROM orders").get() as { m: number | null };
  const start = Number(process.env.ORDER_NUMBER_START || 1001);
  return Math.max(start, (row.m || 0) + 1);
}
