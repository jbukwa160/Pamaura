import { courierErrorMessage, listOffices } from "@/lib/shipping/offices";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const carrier = u.searchParams.get("carrier") || "";
  const q = (u.searchParams.get("q") || "").trim().slice(0, 80);
  const kind = u.searchParams.get("kind");
  try {
    const all = await listOffices(carrier, { query: q, kind: kind === "locker" || kind === "office" ? kind : undefined });
    return Response.json({ offices: all.slice(0, 40) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ offices: [], error: courierErrorMessage(e) }, { status: 502 });
  }
}
