"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { saveCollection } from "@/lib/admin/collections";
import { FormError } from "@/lib/admin/products";
import type { CollectionForm, SaveResult } from "@/components/admin/products/types";

/** Saves a collection; returns the fresh editor state. */
export async function saveCollectionAction(id: number, form: CollectionForm): Promise<SaveResult<CollectionForm>> {
  await requireAdmin();
  const cid = Number(id);
  if (!Number.isSafeInteger(cid) || cid <= 0) return { error: "Невалидна колекция." };
  try {
    const value = saveCollection(cid, form);
    revalidatePath("/admin/kolektsii");
    return { ok: true, value };
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    console.error("[admin collections]", e);
    return { error: "Запазването не успя. Опитайте отново." };
  }
}
