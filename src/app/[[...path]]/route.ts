// Every storefront URL (Shopify's URL structure) is answered by the theme renderer.
import { handleStorefront } from "@/lib/storefront/router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return handleStorefront(req);
}
export async function HEAD(req: Request) {
  const res = await handleStorefront(req);
  return new Response(null, { status: res.status, headers: res.headers });
}
export async function POST(req: Request) {
  return handleStorefront(req);
}
export async function PUT(req: Request) {
  return handleStorefront(req);
}
export async function DELETE(req: Request) {
  return handleStorefront(req);
}
