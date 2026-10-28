import { requireAdmin } from "@/lib/admin/auth";
import { getCatalog } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

// Pages check the session themselves too (layouts don't re-run on every navigation).
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const db = getDb();
  const newOrders = (db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'new'").get() as { n: number }).n;
  const pendingReviews = (db.prepare("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'").get() as { n: number }).n;
  return (
    <AdminShell username={admin.username} storeName={getCatalog().shop.name} newOrders={newOrders} pendingReviews={pendingReviews}>
      {children}
    </AdminShell>
  );
}
