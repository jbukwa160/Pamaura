"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { FormError, createProduct, deleteProduct, saveProduct } from "@/lib/admin/products";
import type { ProductForm, SaveResult } from "@/components/admin/products/types";

function validId(id: unknown): number | null {
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function failure(e: unknown, what: string): { error: string } {
  if (e instanceof FormError) return { error: e.message };
  console.error("[admin products]", e);
  return { error: `${what} не успя. Опитайте отново.` };
}

/** Saves the whole product editor; returns the fresh editor state. */
export async function saveProductAction(id: number, form: ProductForm): Promise<SaveResult<ProductForm>> {
  await requireAdmin();
  const pid = validId(id);
  if (!pid) return { error: "Невалиден продукт." };
  try {
    const value = saveProduct(pid, form);
    revalidatePath("/admin/produkti");
    return { ok: true, value };
  } catch (e) {
    return failure(e, "Запазването");
  }
}

/** Creates a draft product with one variant. */
export async function createProductAction(input: { title: string; price: string; sku: string; qty: string }): Promise<{ id?: number; error?: string }> {
  await requireAdmin();
  if (!input || typeof input !== "object") return { error: "Невалидни данни." };
  try {
    const id = createProduct({ title: input.title, price: input.price, sku: input.sku, qty: input.qty });
    revalidatePath("/admin/produkti");
    return { id };
  } catch (e) {
    return failure(e, "Създаването");
  }
}

export async function deleteProductAction(id: number): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const pid = validId(id);
  if (!pid) return { error: "Невалиден продукт." };
  try {
    deleteProduct(pid);
    revalidatePath("/admin/produkti");
    return { ok: true };
  } catch (e) {
    return failure(e, "Изтриването");
  }
}
