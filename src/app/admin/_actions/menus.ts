"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { catalogChanged } from "@/lib/admin/common";
import { InputError, MENU_ITEMS_MAX, errorResult, str } from "@/lib/admin/content";
import type { MenuItem } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { URL_MAX, urlProblem } from "@/components/admin/content/links";
import type { MenuItemForm, SaveResult } from "@/components/admin/content/types";

/** Deepest nesting the theme's menus can show (link → child → grandchild). */
const DEPTH_MAX = 3;
const TITLE_MAX = 120;

interface Placed {
  path: string;
  ro: string;
  orig: string | null;
}

/** Validates the submitted tree; returns the stored items and where each item ended up. */
function clean(input: unknown, prefix: string, depth: number, placed: Placed[]): MenuItem[] {
  if (!Array.isArray(input)) throw new InputError("Невалидно меню.");
  if (depth > DEPTH_MAX && input.length) throw new InputError(`Менюто може да има най-много ${DEPTH_MAX} нива.`);
  return input.map((raw, i) => {
    const it = (raw && typeof raw === "object" ? raw : {}) as Partial<MenuItemForm>;
    const path = `${prefix}${i}`;
    const title = str(it.title, TITLE_MAX, "Заглавие на връзка").trim();
    const ro = str(it.ro, TITLE_MAX, "Заглавие на връзка (RO)").trim();
    const url = str(it.url, URL_MAX, "Адрес на връзка").trim();
    const orig = typeof it.orig === "string" && /^\d{1,3}(\.\d{1,3}){0,4}$/.test(it.orig) ? it.orig : null;
    if (!title) throw new InputError("Всяка връзка трябва да има заглавие на български.");
    const problem = urlProblem(url);
    if (problem) throw new InputError(`„${title}“: ${problem}`);
    if (placed.length >= MENU_ITEMS_MAX) throw new InputError(`Менюто може да има най-много ${MENU_ITEMS_MAX} връзки.`);
    placed.push({ path, ro, orig });
    // same key order as the imported menus, so an unchanged menu is stored byte for byte the same
    return { title, url, items: clean(it.items ?? [], `${path}.`, depth + 1, placed) };
  });
}

/**
 * Saves a whole menu. Romanian titles are keyed by position ("0.title", "2.1.title"), so after items move the
 * translations are written again under their new positions (other languages follow their item too).
 */
export async function saveMenuAction(handle: string, items: MenuItemForm[]): Promise<SaveResult> {
  await requireAdmin();
  try {
    const h = str(handle, 100, "Меню");
    const db = getDb();
    if (!db.prepare("SELECT 1 FROM menus WHERE handle = ?").get(h)) return { error: "Менюто не е намерено." };
    const placed: Placed[] = [];
    const tree = clean(items, "", 1, placed);

    const ITEM_FIELD = /^\d+(\.\d+)*\.title$/;
    const old = (db.prepare("SELECT locale, field, value FROM translations WHERE owner_type = 'menu' AND owner_id = ?").all(h) as { locale: string; field: string; value: string }[]).filter((r) =>
      ITEM_FIELD.test(r.field),
    );
    db.transaction(() => {
      const del = db.prepare("DELETE FROM translations WHERE locale = ? AND owner_type = 'menu' AND owner_id = ? AND field = ?");
      for (const r of old) del.run(r.locale, h, r.field);
      const ins = db.prepare("INSERT OR REPLACE INTO translations(locale, owner_type, owner_id, field, value) VALUES(?, 'menu', ?, ?, ?)");
      for (const p of placed) {
        if (p.ro) ins.run("ro", h, `${p.path}.title`, p.ro);
        if (p.orig === null) continue;
        for (const r of old) if (r.locale !== "ro" && r.field === `${p.orig}.title`) ins.run(r.locale, h, `${p.path}.title`, r.value);
      }
      db.prepare("UPDATE menus SET items = ? WHERE handle = ?").run(JSON.stringify(tree), h);
    })();
    catalogChanged();
    revalidatePath("/admin/menyu");
    return { ok: true };
  } catch (e) {
    return errorResult(e);
  }
}
