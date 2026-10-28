"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { catalogChanged } from "@/lib/admin/common";
import { getCatalog } from "@/lib/catalog";
import { setSetting } from "@/lib/db";
import { courierErrorMessage, getCarrier, isCarrier } from "@/lib/shipping/couriers";
import { courierStatuses } from "@/lib/admin/env-status";
import { knownShippingMethods } from "@/lib/admin/shipping";
import type { ShippingMethod, ShippingSettings } from "@/lib/shipping/rates";

type Result = { ok?: boolean; error?: string; message?: string };

export interface MethodInput {
  code: string;
  enabled: boolean;
  price: number;
  title: { bg: string; ro: string };
  description: { bg: string; ro: string };
  markets: string[];
}

export interface ShippingInput {
  methods: MethodInput[];
  free_threshold: number | null;
  free_methods: "all" | "office_locker";
  cod_enabled: boolean;
  cod_fee: number;
  bank_transfer_enabled: boolean;
  bank_details: string;
}

const MAX_PRICE = 1000_00; // €1000

const text = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const cents = (v: unknown, max: number): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

export async function saveShippingAction(input: ShippingInput): Promise<Result> {
  await requireAdmin();
  if (!input || typeof input !== "object" || !Array.isArray(input.methods)) return { error: "Невалидни данни." };
  const marketHandles = new Set(getCatalog().markets.map((m) => m.handle));

  const methods: ShippingMethod[] = [];
  for (const m of knownShippingMethods()) {
    const inp = input.methods.find((x) => x && x.code === m.code);
    if (!inp) {
      methods.push(m);
      continue;
    }
    const price = cents(inp.price, MAX_PRICE);
    const titleBg = text(inp.title?.bg, 80);
    if (price === null) return { error: `Невалидна цена за „${m.title.bg}“ (най-много 1000 €).` };
    if (!titleBg) return { error: `Въведете име на български за „${m.title.bg || m.code}“.` };
    const markets = [...new Set((Array.isArray(inp.markets) ? inp.markets : []).map(String))].filter((h) => marketHandles.has(h));
    methods.push({
      code: m.code,
      carrier: m.carrier,
      kind: m.kind,
      enabled: Boolean(inp.enabled),
      markets,
      price,
      title: { bg: titleBg, ro: text(inp.title?.ro, 80) },
      description: { bg: text(inp.description?.bg, 160), ro: text(inp.description?.ro, 160) },
    });
  }

  let threshold: number | null = null;
  if (input.free_threshold !== null && input.free_threshold !== undefined) {
    threshold = cents(input.free_threshold, 100_000_00);
    if (threshold === null) return { error: "Невалидна сума за безплатна доставка." };
  }
  const codFee = cents(input.cod_fee ?? 0, 100_00);
  if (codFee === null) return { error: "Таксата за наложен платеж трябва да е между 0 и 100 €." };
  const codEnabled = Boolean(input.cod_enabled);
  const bankEnabled = Boolean(input.bank_transfer_enabled);
  if (!codEnabled && !bankEnabled) return { error: "Включете поне един начин на плащане — иначе никой не може да поръча." };
  const bankDetails = String(input.bank_details ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, 1000);
  if (bankEnabled && !bankDetails) return { error: "Попълнете банковите данни (IBAN, получател), за да включите банковия превод." };

  const next: ShippingSettings = {
    methods,
    free_threshold: threshold,
    free_methods: input.free_methods === "office_locker" ? "office_locker" : "all",
    cod_enabled: codEnabled,
    cod_fee: codFee,
    bank_transfer_enabled: bankEnabled,
    bank_details: bankDetails,
  };
  setSetting("shipping", next);
  catalogChanged();
  revalidatePath("/admin/dostavka");
  return { ok: true };
}

/** Read-only check of a courier's logins (adapter.test()). Messages never contain the logins themselves. */
export async function testCourierAction(id: string): Promise<Result> {
  await requireAdmin();
  if (!isCarrier(id)) return { error: "Непознат куриер." };
  const status = courierStatuses().find((c) => c.id === id)!;
  if (!status.connected) {
    const missing = status.login.filter((v) => !v.set).map((v) => v.name);
    return { error: `${status.name} не е свързан: липсват ${missing.join(", ")} в .env.local.` };
  }
  try {
    const n = await Promise.race([
      getCarrier(id).test(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("куриерът не отговори за 45 секунди")), 45_000)),
    ]);
    const what = id === "boxnow" ? "автомата" : "офиса";
    return { ok: true, message: `Връзката работи. ${status.name} върна ${n} ${what}${id === "boxnow" ? "" : " в София"}.` };
  } catch (e) {
    return { error: courierErrorMessage(e) };
  }
}
