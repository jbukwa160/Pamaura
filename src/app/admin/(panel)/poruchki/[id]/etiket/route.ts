// The courier's label (PDF) for an order's waybill.
import { getAdmin } from "@/lib/admin/auth";
import { orderShipment } from "@/lib/admin/orders";
import { orderById } from "@/lib/orders";
import { courierErrorMessage, getCarrier } from "@/lib/shipping/couriers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return new Response("Нужен е вход.", { status: 401 });
  const order = orderById(Number((await ctx.params).id));
  const shipment = order ? orderShipment(order) : null;
  if (!order || !shipment) return new Response("Няма товарителница.", { status: 404 });
  try {
    const pdf = await getCarrier(shipment.carrier).getLabelPdf(shipment);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="etiket-${order.number}-${shipment.trackingNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return new Response(`Етикетът не може да се вземе от куриера: ${courierErrorMessage(e)}`, { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
