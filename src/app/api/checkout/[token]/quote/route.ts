import { quote, type CheckoutInput } from "@/lib/checkout";
import { checkoutRequest } from "@/lib/storefront/checkout-context";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const sr = checkoutRequest(req, token, url.searchParams.get("locale"));
  if (!sr) return Response.json({ error: "not_found" }, { status: 404 });
  let body: Partial<CheckoutInput> = {};
  try {
    body = (await req.json()) as Partial<CheckoutInput>;
  } catch {
    /* empty body */
  }
  return Response.json(quote(sr.state, sr.state.cart, body), { headers: { "Cache-Control": "no-store" } });
}
