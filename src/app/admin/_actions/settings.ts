"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { catalogChanged } from "@/lib/admin/common";
import { HEAD_LIMITS, cleanHeadToken, ratePreview, type RatePreview } from "@/lib/admin/settings";
import { getCatalog, type Market, type ShopInfo } from "@/lib/catalog";
import { getSetting, setSetting } from "@/lib/db";
import { DEFAULT_HEAD, type HeadSettings } from "@/lib/liquid/head";
import { failedMailCount, retryFailedMail } from "@/lib/mail";

type Result = { ok?: boolean; error?: string; message?: string };

export interface ShopInput {
  name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  zip: string;
  company: string;
}

export interface MarketInput {
  handle: string;
  rate: number;
  enabled: boolean;
}

export interface HeadInput {
  google_site_verification: string;
  facebook_domain_verification: string;
  klaviyo_company_id: string;
  extra_head_html: string;
}

/** Only the sections the admin changed are sent (and saved). */
export interface SettingsInput {
  shop?: ShopInput;
  markets?: MarketInput[];
  tax?: Record<string, number>;
  head?: HeadInput;
}

const line = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export async function saveSettingsAction(input: SettingsInput): Promise<Result> {
  await requireAdmin();
  if (!input || typeof input !== "object") return { error: "Невалидни данни." };
  const cat = getCatalog();
  const writes: [string, unknown][] = [];

  if (input.shop) {
    const s = input.shop;
    const name = line(s.name, 80);
    if (!name) return { error: "Въведете име на магазина." };
    const email = line(s.email, 254);
    if (!EMAIL.test(email)) return { error: "Въведете валиден имейл на магазина." };
    const phone = line(s.phone, 30);
    if (phone && !/^[+\d\s()./-]+$/.test(phone)) return { error: "Телефонът може да съдържа само цифри, интервали и + ( ) - ." };
    const saved = getSetting<Partial<ShopInfo>>("shop", {});
    const address = { ...cat.shop.address, street: line(s.street, 120), city: line(s.city, 80), zip: line(s.zip, 12), company: line(s.company, 120) };
    writes.push(["shop", { ...saved, name, email, phone, address }]);
  }

  if (input.markets) {
    if (!Array.isArray(input.markets)) return { error: "Невалидни данни за пазарите." };
    const next: Market[] = [];
    for (const m of cat.markets) {
      const inp = input.markets.find((x) => x && x.handle === m.handle);
      if (!inp || m.primary) {
        // the main market (Bulgaria, euro) always stays on, with rate 1
        next.push({ ...m });
        continue;
      }
      const rate = Number(inp.rate);
      if (!Number.isFinite(rate) || rate < 0.0001 || rate > 100000) return { error: `Невалиден курс за ${m.currency}.` };
      next.push({ ...m, rate: Math.round(rate * 1e7) / 1e7, enabled: Boolean(inp.enabled) });
    }
    if (!next.some((m) => m.enabled)) return { error: "Поне един пазар трябва да е включен." };
    writes.push(["markets", next]);
  }

  if (input.tax) {
    if (typeof input.tax !== "object") return { error: "Невалидни ставки на ДДС." };
    const countries = new Set(cat.markets.map((m) => m.country));
    const rates = { ...getSetting<Record<string, number>>("tax_rates", { BG: 20, RO: 21 }) };
    for (const [country, raw] of Object.entries(input.tax)) {
      if (!countries.has(country)) continue;
      const r = Number(raw);
      if (!Number.isFinite(r) || r < 0 || r > 50) return { error: `ДДС за ${country} трябва да е между 0 и 50%.` };
      rates[country] = Math.round(r * 100) / 100;
    }
    writes.push(["tax_rates", rates]);
  }

  if (input.head) {
    const h = input.head;
    const google = cleanHeadToken(h.google_site_verification, "google");
    const facebook = cleanHeadToken(h.facebook_domain_verification, "facebook");
    const klaviyo = cleanHeadToken(h.klaviyo_company_id, "klaviyo");
    if (google === null) return { error: "Кодът за Google може да съдържа само латински букви, цифри, - и _." };
    if (facebook === null) return { error: "Кодът за Facebook може да съдържа само латински букви и цифри." };
    if (klaviyo === null) return { error: "Klaviyo ID е от латински букви и цифри (обикновено 6 знака)." };
    const extra = String(h.extra_head_html ?? "").replace(/\r\n/g, "\n").trim();
    if (extra.length > HEAD_LIMITS.extra) return { error: `Допълнителният код е твърде дълъг (най-много ${HEAD_LIMITS.extra} знака).` };
    const saved = getSetting<Partial<HeadSettings>>("head", {});
    const next: HeadSettings = { ...DEFAULT_HEAD, ...saved, google_site_verification: google, facebook_domain_verification: facebook, klaviyo_company_id: klaviyo, extra_head_html: extra };
    writes.push(["head", next]);
  }

  if (!writes.length) return { ok: true };
  for (const [key, value] of writes) setSetting(key, value);
  catalogChanged();
  // the shop name is also in the admin header
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Prices in the market's currency for a rate that is not saved yet (the same conversion the shop uses). */
export async function previewRateAction(handle: string, rate: number): Promise<{ ok?: boolean; error?: string; preview?: RatePreview }> {
  await requireAdmin();
  const r = Number(rate);
  if (!Number.isFinite(r) || r < 0.0001 || r > 100000) return { error: "Невалиден курс." };
  const preview = ratePreview(String(handle ?? "").slice(0, 10), r);
  return preview ? { ok: true, preview } : { error: "Непознат пазар." };
}

/** Sends the e-mails the mail server refused earlier (outbox/failed). */
export async function retryMailAction(): Promise<Result> {
  await requireAdmin();
  if (!process.env.SMTP_HOST) return { error: "Пощата не е настроена (липсва SMTP_HOST в .env.local) — няма как да се изпратят." };
  const before = failedMailCount();
  if (!before) return { ok: true, message: "Няма чакащи имейли." };
  try {
    await retryFailedMail();
  } catch (e) {
    return { error: `Грешка при изпращането: ${(e as Error).message}` };
  }
  const after = failedMailCount();
  revalidatePath("/admin/nastroyki");
  const sent = Math.max(0, before - after);
  if (!after) return { ok: true, message: `Изпратени: ${sent}. Няма повече чакащи имейли.` };
  return {
    ok: true,
    message: `Изпратени: ${sent}. Още ${after} чакат — пощенският сървър не ги прие или следващият опит още не е дошъл. Системата опитва отново автоматично.`,
  };
}
