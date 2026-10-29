/* eslint-disable @next/next/no-img-element -- thumbnails come resized from /cdn */
// Order status page ("thank you" page and the link in the confirmation e-mail).
// The 32-character order token in the URL is the key, as with Shopify's order status links.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ct } from "@/lib/checkout";
import { checkoutTexts, fill } from "@/lib/checkout-i18n";
import { ORDER_STATUS_TEXT, fileThumb, logoUrl, storeLinks } from "@/lib/checkout-page";
import { getCatalog } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { orderByToken, orderLines } from "@/lib/orders";
import { shippingSettings } from "@/lib/shipping/rates";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

function load(token: string) {
  return /^[a-f0-9]{32}$/.test(token) ? orderByToken(token) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const order = load((await params).token);
  if (!order) return {};
  return { title: `${fill(checkoutTexts(order.locale).order_number, { n: order.number })} – ${getCatalog().shop.name}` };
}

interface ShipTo {
  name?: string;
  phone?: string;
  kind?: string;
  office_name?: string | null;
  office_address?: string | null;
  city?: string;
  zip?: string;
  address1?: string;
  address2?: string;
  country?: string;
}

export default async function OrderPage({ params }: Props) {
  const order = load((await params).token);
  if (!order) notFound();
  const cat = getCatalog();
  const market = cat.markets.find((m) => m.handle === order.market) || cat.markets[0];
  const L = order.locale === "ro" ? "ro" : "bg";
  const T = checkoutTexts(L);
  const money = (c: number) => formatMoney(c, market.money_format);
  const links = storeLinks(market);
  const lines = orderLines(order.id);
  const ship = JSON.parse(order.shipping_address || "{}") as ShipTo;
  const firstName = (ship.name || "").split(" ")[0];
  const bank = order.payment_method === "bank_transfer";
  const bankDetails = bank ? shippingSettings().bank_details : "";
  const logo = logoUrl();
  const status = ORDER_STATUS_TEXT[L][order.status] || order.status;
  const pickup = ship.kind === "office" || ship.kind === "locker";

  return (
    <div className="co co--order">
      <aside className="co-side" aria-label={T.summary}>
        <div className="co-inner">
          <div className="co-side-body" style={{ display: "block" }}>
            <ul className="co-lines">
              {lines.map((l) => {
                const img = fileThumb(l.image);
                return (
                  <li className="co-line" key={l.id}>
                    <span className="co-thumb">
                      {img ? <img src={img} alt="" loading="lazy" /> : null}
                      <span className="co-qty">{l.quantity}</span>
                    </span>
                    <span className="co-line-text">
                      <span className="co-line-title">{l.title}</span>
                      {l.variant_title ? <span className="co-line-variant">{l.variant_title}</span> : null}
                    </span>
                    <span className="co-line-price">{money(l.price * l.quantity)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="co-totals">
              <dl>
                <div className="co-tr">
                  <dt>{T.subtotal}</dt>
                  <dd>{money(order.subtotal)}</dd>
                </div>
                {order.discount_total ? (
                  <div className="co-tr co-tr--discount">
                    <dt>
                      {T.discount}
                      {order.discount_title || order.discount_code ? ` (${order.discount_title || order.discount_code})` : ""}
                    </dt>
                    <dd>−{money(order.discount_total)}</dd>
                  </div>
                ) : null}
                <div className="co-tr">
                  <dt>{T.shipping}</dt>
                  <dd>{order.shipping_total ? money(order.shipping_total) : T.free}</dd>
                </div>
                {order.cod_fee ? (
                  <div className="co-tr">
                    <dt>{T.cod_fee}</dt>
                    <dd>{money(order.cod_fee)}</dd>
                  </div>
                ) : null}
                <div className="co-tr co-tr--total">
                  <dt>{T.total}</dt>
                  <dd>
                    <small>{order.currency}</small>
                    {money(order.total)}
                  </dd>
                </div>
              </dl>
              <p className="co-vat">{fill(T.vat, { amount: money(order.tax_total) })}</p>
            </div>
          </div>
        </div>
      </aside>
      <main className="co-main">
        <div className="co-inner">
          {logo ? (
            <a className="co-logo" href={links.home}>
              <img src={logo} alt={cat.shop.name} />
            </a>
          ) : (
            <a className="co-logo co-logo-text" href={links.home}>
              {cat.shop.name}
            </a>
          )}
          <div className="co-thanks">
            <span className="co-thanks-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5 10 17l9-10" />
              </svg>
            </span>
            <div>
              <small>{fill(T.order_number, { n: order.number })}</small>
              <h1>{fill(T.thanks, { name: firstName })}</h1>
            </div>
          </div>

          <section className="co-box">
            <h2>{T.confirmed}</h2>
            <p>{fill(T.confirmed_text, { email: order.email })}</p>
            <p>
              {T.status}: <span className="co-status">{status}</span>
            </p>
            {order.tracking_number ? (
              <p>
                {T.tracking}:{" "}
                {order.tracking_url ? (
                  <a href={order.tracking_url} target="_blank" rel="noopener noreferrer">
                    {order.tracking_number}
                  </a>
                ) : (
                  order.tracking_number
                )}
              </p>
            ) : null}
          </section>

          <section className="co-box">
            <h2>{T.order_details}</h2>
            <div className="co-info">
              <div>
                <h3>{T.contact_info}</h3>
                <p>{order.email}</p>
                {order.phone ? <p>{order.phone}</p> : null}
              </div>
              <div>
                <h3>{T.delivery_to}</h3>
                <p>{ship.name}</p>
                {pickup ? (
                  <>
                    <p>{ship.office_name}</p>
                    <p>{[ship.city, ship.office_address].filter(Boolean).join(", ")}</p>
                  </>
                ) : (
                  <>
                    <p>{ship.address1}</p>
                    {ship.address2 ? <p>{ship.address2}</p> : null}
                    <p>{[ship.zip, ship.city].filter(Boolean).join(" ")}</p>
                    <p>{ship.country}</p>
                  </>
                )}
                <p className="co-hint">{order.shipping_title}</p>
              </div>
              <div>
                <h3>{T.payment_method}</h3>
                <p>{bank ? ct(L, "bank") : ct(L, "cod")}</p>
                <p className="co-hint">{bank ? fill(T.bank_text, { total: money(order.total), n: order.number }) : fill(T.cod_text, { total: money(order.total) })}</p>
                {bankDetails ? <p className="co-bank">{bankDetails}</p> : null}
              </div>
            </div>
          </section>

          <div className="co-actions">
            <a className="co-btn co-btn--block" href={links.home}>
              {T.continue}
            </a>
          </div>
          <p className="co-footer">{fill(T.questions, { email: cat.shop.email, phone: cat.shop.phone.replace(/ /g, "\u00a0") })}</p>
        </div>
      </main>
    </div>
  );
}
