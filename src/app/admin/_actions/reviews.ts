"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { catalogChanged, sofiaDay } from "@/lib/admin/common";
import { errorResult, sofiaLocalToIso, str } from "@/lib/admin/content";
import { REVIEW_PICTURES_MAX, isReviewStatus, textToHtml } from "@/lib/admin/reviews";
import { getDb, nowIso } from "@/lib/db";
import type { SaveResult } from "@/components/admin/content/types";

function reviewId(v: unknown): number | null {
  const id = Number(v);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** The list, the sidebar badge (pending count) and the dashboard all change after a review action. */
function changed(catalog: boolean) {
  // the catalog keeps each product's average rating (reviews.rating metafields)
  if (catalog) catalogChanged();
  revalidatePath("/admin", "layout");
}

export async function setReviewStatusAction(id: number, status: string): Promise<SaveResult> {
  await requireAdmin();
  const rid = reviewId(id);
  if (rid === null || !isReviewStatus(status)) return { error: "Невалидна заявка." };
  const r = getDb().prepare("UPDATE reviews SET status = ? WHERE id = ?").run(status, rid);
  if (!r.changes) return { error: "Отзивът вече не съществува." };
  changed(true);
  return { ok: true };
}

export async function setReviewVerifiedAction(id: number, verified: boolean): Promise<SaveResult> {
  await requireAdmin();
  const rid = reviewId(id);
  if (rid === null) return { error: "Невалидна заявка." };
  const r = getDb().prepare("UPDATE reviews SET verified = ? WHERE id = ?").run(verified === true ? 1 : 0, rid);
  if (!r.changes) return { error: "Отзивът вече не съществува." };
  changed(false);
  return { ok: true };
}

/** The shop's public answer under a review ("" removes it). */
export async function saveReviewReplyAction(id: number, text: string): Promise<SaveResult> {
  await requireAdmin();
  try {
    const rid = reviewId(id);
    if (rid === null) return { error: "Невалидна заявка." };
    const html = textToHtml(str(text, 5000, "Отговор"));
    const r = getDb().prepare("UPDATE reviews SET reply = ? WHERE id = ?").run(html || null, rid);
    if (!r.changes) return { error: "Отзивът вече не съществува." };
    changed(false);
    return { ok: true };
  } catch (e) {
    return errorResult(e);
  }
}

export async function deleteReviewAction(id: number): Promise<SaveResult> {
  await requireAdmin();
  const rid = reviewId(id);
  if (rid === null) return { error: "Невалидна заявка." };
  getDb().prepare("DELETE FROM reviews WHERE id = ?").run(rid);
  changed(true);
  return { ok: true };
}

export interface NewReview {
  /** null = a review of the shop itself */
  productId: number | null;
  rating: number;
  author: string;
  email: string;
  title: string;
  body: string;
  /** "YYYY-MM-DD" */
  date: string;
  verified: boolean;
  publish: boolean;
  /** files-table keys of uploaded pictures */
  pictures: string[];
}

/** A review entered by hand (received by phone, e-mail, in person…). */
export async function createReviewAction(input: NewReview): Promise<SaveResult> {
  await requireAdmin();
  try {
    const db = getDb();
    const productId = input?.productId == null ? null : reviewId(input.productId);
    if (input?.productId != null && (productId === null || !db.prepare("SELECT 1 FROM products WHERE id = ?").get(productId))) return { error: "Изберете продукт." };
    const rating = Number(input.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Изберете оценка от 1 до 5 звезди." };
    const author = str(input.author, 100, "Име").trim();
    const email = str(input.email, 200, "Имейл").trim();
    const title = str(input.title, 200, "Заглавие").trim();
    const body = str(input.body, 5000, "Текст").trim();
    const date = str(input.date, 10, "Дата").trim();
    if (!author) return { error: "Попълнете името на клиента." };
    if (!body) return { error: "Попълнете текста на отзива." };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Имейлът не е валиден." };
    const today = sofiaDay(new Date());
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today)) return { error: "Невалидна дата (не може да е в бъдещето)." };
    const pictures = Array.isArray(input.pictures) ? input.pictures.map((p) => str(p, 300, "Снимка")) : [];
    if (pictures.length > REVIEW_PICTURES_MAX) return { error: `Най-много ${REVIEW_PICTURES_MAX} снимки.` };
    for (const p of pictures) if (!db.prepare("SELECT 1 FROM files WHERE name = ?").get(p)) return { error: "Снимка не е намерена — качете я отново." };
    // today: the current time; an earlier day: midday in Sofia
    const createdAt = !date || date === today ? nowIso() : new Date(sofiaLocalToIso(`${date}T12:00`)!).toISOString();
    const r = db
      .prepare("INSERT INTO reviews(external_id, product_id, rating, title, body, author, email, verified, pictures, reply, status, created_at) VALUES(NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)")
      .run(productId, rating, title, textToHtml(body), author, email || null, input.verified === true ? 1 : 0, JSON.stringify(pictures), input.publish === true ? "published" : "pending", createdAt);
    changed(true);
    return { ok: true, id: Number(r.lastInsertRowid) };
  } catch (e) {
    return errorResult(e);
  }
}
