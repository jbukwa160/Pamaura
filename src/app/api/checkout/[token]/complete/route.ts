import { placeOrder, checkoutError, type CheckoutInput } from "@/lib/checkout";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { checkoutRequest } from "@/lib/storefront/checkout-context";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const sr = checkoutRequest(req, token, url.searchParams.get("locale"));
  if (!sr) return Response.json({ ok: false, errors: { form: "not_found" } }, { status: 404 });
  const ip = clientIp(req);
  if (rateLimited(`checkout:${ip}`, 20, 10 * 60_000)) {
    return Response.json({ ok: false, errors: { form: sr.state.locale === "ro" ? "Prea multe încercări. Încercați din nou peste câteva minute." : "Твърде много опити. Опитайте отново след няколко минути." } }, { status: 429 });
  }
  let body: CheckoutInput;
  try {
    body = (await req.json()) as CheckoutInput;
  } catch {
    return Response.json({ ok: false, errors: { form: checkoutError(sr.state.locale, "empty") } }, { status: 400 });
  }
  const res = await placeOrder(sr.state, sr.state.cart, body, { ip, userAgent: req.headers.get("user-agent") });
  if (!res.ok) return Response.json({ ok: false, errors: res.errors }, { status: 422 });
  const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "application/json" });
  // the cart is gone; a new one starts with the next add to cart
  headers.append("Set-Cookie", "cart=; Path=/; Max-Age=0; SameSite=Lax");
  headers.append("Set-Cookie", `order_view_${res.order!.token.slice(0, 8)}=${res.order!.token}; Path=/checkouts/order; Max-Age=${60 * 60 * 24 * 90}; SameSite=Lax; HttpOnly${sr.secure ? "; Secure" : ""}`);
  // a Headers object keeps both Set-Cookie lines (a plain object would merge them)
  return new Response(JSON.stringify({ ok: true, url: `/checkouts/order/${res.order!.token}` }), { headers });
}
