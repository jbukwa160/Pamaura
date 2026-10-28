"use server";

import { requireAdmin } from "@/lib/admin/auth";
import { saveImageUpload } from "@/lib/admin/uploads";

/** Upload a picture from the admin; returns the stored file key (files table) and a preview URL. */
export async function uploadImageAction(fd: FormData): Promise<{ key?: string; url?: string; error?: string }> {
  await requireAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Изберете снимка." };
  try {
    const r = await saveImageUpload(file);
    return { key: r.key, url: r.url };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
