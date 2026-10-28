import { courierErrorMessage, searchCities } from "@/lib/shipping/offices";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const carrier = u.searchParams.get("carrier") || "econt";
  const q = (u.searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ cities: [] });
  try {
    const cities = await searchCities(carrier, q);
    return Response.json({ cities: cities.slice(0, 15) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ cities: [], error: courierErrorMessage(e) }, { status: 502 });
  }
}
