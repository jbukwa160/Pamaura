// RenderState for checkout pages / APIs: the cart is addressed by its token (/checkouts/<token>).
import { loadCart } from "../cart";
import { getCatalog } from "../catalog";
import { buildRequest, type StoreRequest } from "./context";

export function checkoutRequest(req: Request, token: string, locale?: string | null): StoreRequest | null {
  if (!/^[a-f0-9]{16,64}$/.test(token)) return null;
  const cat = getCatalog();
  const markets = cat.markets.filter((m) => m.enabled);
  const cart = loadCart(token, markets[0].handle);
  if (cart.transient) return null;
  const market = markets.find((m) => m.path === locale) || markets.find((m) => m.handle === cart.market) || markets.find((m) => m.primary) || markets[0];
  const sr = buildRequest(req, { market, prefixed: true, rest: "/checkout" });
  sr.state.cart = cart;
  return sr;
}

/** Builds a Request from Next's headers() for server components. */
export function requestFromHeaders(h: Headers, path: string): Request {
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return new Request(`${proto}://${host}${path}`, { headers: h });
}
