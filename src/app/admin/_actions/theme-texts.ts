"use server";

import { requireAdmin } from "@/lib/admin/auth";
import { saveThemeTexts, type TextChange } from "@/lib/admin/theme-texts";

export async function saveThemeTextsAction(changes: TextChange[]): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  if (!Array.isArray(changes) || changes.length > 2000) return { error: "Невалидни данни." };
  const clean: TextChange[] = [];
  for (const c of changes) {
    if (!c || typeof c.scope !== "string" || c.scope.length > 300) return { error: "Невалидни данни." };
    const v = (x: unknown) => (x === null ? null : typeof x === "string" ? x : undefined);
    clean.push({ scope: c.scope, bg: v(c.bg), ro: v(c.ro) });
  }
  saveThemeTexts(clean);
  return { ok: true };
}
