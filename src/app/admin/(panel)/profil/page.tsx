import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { fmtDateTime } from "@/lib/admin/common";
import { getDb } from "@/lib/db";
import { Card, PageHeader } from "@/components/admin/ui";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "Профил и парола" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const admin = await requireAdmin();
  const row = getDb().prepare("SELECT password_changed_at, created_at FROM admin_users WHERE id = ?").get(admin.id) as { password_changed_at: string; created_at: string } | undefined;
  return (
    <>
      <PageHeader title="Профил и парола" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card title="Вашият профил">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-sky-soft">
              <UserRound className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm text-muted">Потребителско име</p>
              <p className="text-xl font-black">{admin.username}</p>
            </div>
          </div>
          {row ? (
            <dl className="mt-5 space-y-2 text-[0.95rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Паролата е сменена на</dt>
                <dd className="font-bold">{fmtDateTime(row.password_changed_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Профилът е създаден на</dt>
                <dd className="font-bold">{fmtDateTime(row.created_at)}</dd>
              </div>
            </dl>
          ) : null}
          <p className="mt-5 text-sm text-muted">Потребителското име не може да се сменя оттук. Нов админ профил се създава от програмиста.</p>
        </Card>
        <Card title="Смяна на паролата" description="След смяната всички други входове в админ панела (от други устройства) се прекратяват.">
          <PasswordForm username={admin.username} />
        </Card>
      </div>
    </>
  );
}
