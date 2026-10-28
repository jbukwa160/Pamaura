"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { endOtherSessions, login, logout, passwordProblem, requireAdmin, setAdminPassword } from "@/lib/admin/auth";

export async function loginAction(_prev: { error?: string; username?: string } | null, fd: FormData): Promise<{ error?: string; username?: string }> {
  const username = String(fd.get("username") ?? "").trim().slice(0, 60);
  const password = String(fd.get("password") ?? "").slice(0, 200);
  if (!username || !password) return { error: "Въведете потребителско име и парола.", username };
  const result = await login(username, password, fd.get("remember") === "on");
  // echo the username back: React resets the form after an action
  if (!result.ok) return { error: result.error, username };
  const next = String(fd.get("next") ?? "");
  redirect(next.startsWith("/admin") && !next.startsWith("//") && !next.includes("\\") ? next : "/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

export async function changePasswordAction(_prev: { ok?: boolean; error?: string } | null, fd: FormData): Promise<{ ok?: boolean; error?: string }> {
  const admin = await requireAdmin();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const repeat = String(fd.get("repeat") ?? "");
  const row = getDb().prepare("SELECT password_hash FROM admin_users WHERE id = ?").get(admin.id) as { password_hash: string } | undefined;
  if (!row || !(await verifyPassword(current, row.password_hash))) return { error: "Сегашната парола е грешна." };
  if (next !== repeat) return { error: "Новата парола и повторението не съвпадат." };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  await setAdminPassword(admin.id, next);
  await endOtherSessions(admin.id);
  return { ok: true };
}
