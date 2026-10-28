// Order e-mails: confirmation to the customer (in the order's language) and a notice to the shop.
import { getCatalog, type Market } from "../catalog";
import { formatMoney } from "../liquid/filters";
import type { RenderState } from "../liquid/state";
import { escapeHtml as e, sendMail, shopNotifyEmail } from "../mail";
import { orderLines, STATUS_LABELS, type OrderRec } from "../orders";
import { shippingSettings } from "../shipping/rates";

const T: Record<string, Record<string, string>> = {
  bg: {
    subject: "Поръчка #{{n}} е приета",
    hello: "Здравейте, {{name}}!",
    thanks: "Благодарим Ви за поръчката. Ще Ви се обадим или ще Ви изпратим имейл, когато я изпратим.",
    order: "Поръчка",
    date: "Дата",
    item: "Продукт",
    qty: "Бр.",
    price: "Цена",
    subtotal: "Междинна сума",
    discount: "Отстъпка",
    shipping: "Доставка",
    free: "Безплатна",
    cod_fee: "Такса наложен платеж",
    total: "Общо",
    vat: "В това число ДДС ({{rate}}%)",
    delivery: "Доставка",
    payment: "Плащане",
    cod: "Наложен платеж — ще платите {{total}} на куриера при получаване.",
    bank: "Банков превод — моля, преведете {{total}} по сметката по-долу с основание „Поръчка #{{n}}“. Изпращаме след получаване на плащането.",
    contact: "Данни за контакт",
    view: "Вижте поръчката",
    questions: "Въпроси? Отговорете на този имейл или ни се обадете на {{phone}}.",
  },
  ro: {
    subject: "Comanda #{{n}} a fost primită",
    hello: "Bună ziua, {{name}}!",
    thanks: "Vă mulțumim pentru comandă. Vă anunțăm când o expediem.",
    order: "Comanda",
    date: "Data",
    item: "Produs",
    qty: "Buc.",
    price: "Preț",
    subtotal: "Subtotal",
    discount: "Reducere",
    shipping: "Livrare",
    free: "Gratuită",
    cod_fee: "Taxă ramburs",
    total: "Total",
    vat: "Din care TVA ({{rate}}%)",
    delivery: "Livrare",
    payment: "Plată",
    cod: "Ramburs — plătiți {{total}} curierului la livrare.",
    bank: "Transfer bancar — transferați {{total}} în contul de mai jos cu mențiunea „Comanda #{{n}}”. Expediem după primirea plății.",
    contact: "Date de contact",
    view: "Vezi comanda",
    questions: "Întrebări? Răspundeți la acest e-mail sau sunați-ne la {{phone}}.",
  },
};

function t(locale: string, key: string, vars: Record<string, string | number> = {}) {
  return (T[locale]?.[key] ?? T.bg[key]).replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? ""));
}

function marketOf(handle: string): Market {
  const cat = getCatalog();
  return cat.markets.find((m) => m.handle === handle) || cat.markets[0];
}

export function orderStatusUrl(origin: string, order: OrderRec) {
  return `${origin}/checkouts/order/${order.token}`;
}

function linesTable(order: OrderRec, origin: string, money: (n: number) => string, locale: string) {
  const rows = orderLines(order.id)
    .map((l) => {
      // JPEG thumbnails: mail programs do not all show WebP / SVG
      const f = l.image ? getCatalog().files.get(l.image) : undefined;
      const src = f ? `${origin}/cdn/shop/${f.folder}/${f.plain.split("/").map(encodeURIComponent).join("/")}?v=${f.version}&width=120&format=jpg` : "";
      const img = src ? `<img src="${src}" width="56" height="56" alt="" style="border-radius:8px;display:block;object-fit:cover">` : "";
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee;width:64px">${img}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee">${e(l.title)}${l.variant_title ? `<br><span style="color:#8a7a6d;font-size:13px">${e(l.variant_title)}</span>` : ""}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center">${l.quantity}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${money(l.price * l.quantity)}</td>
      </tr>`;
    })
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px"><tr style="color:#8a7a6d;font-size:12px"><td></td><td style="padding:0 8px">${t(locale, "item")}</td><td style="padding:0 8px;text-align:center">${t(locale, "qty")}</td><td style="text-align:right">${t(locale, "price")}</td></tr>${rows}</table>`;
}

export function orderSummaryHtml(order: OrderRec, origin: string, forShop = false): string {
  const L = forShop ? "bg" : order.locale;
  const m = marketOf(order.market);
  const money = (n: number) => formatMoney(n, m.money_format);
  const addr = JSON.parse(order.shipping_address || "{}");
  const cfg = shippingSettings();
  const rate = order.total ? Math.round(((order.tax_total / (order.total - order.tax_total)) * 100)) : 20;
  const totals = [
    [t(L, "subtotal"), money(order.subtotal)],
    ...(order.discount_total ? [[`${t(L, "discount")}${order.discount_code ? ` (${e(order.discount_code)})` : ""}`, "−" + money(order.discount_total)]] : []),
    [`${t(L, "shipping")} — ${e(order.shipping_title)}`, order.shipping_total ? money(order.shipping_total) : t(L, "free")],
    ...(order.cod_fee ? [[t(L, "cod_fee"), money(order.cod_fee)]] : []),
  ]
    .map(([k, v]) => `<tr><td style="padding:4px 0;color:#5E5045">${k}</td><td style="padding:4px 0;text-align:right">${v}</td></tr>`)
    .join("");
  const delivery =
    addr.kind === "address"
      ? `${e(addr.address1)}${addr.address2 ? ", " + e(addr.address2) : ""}<br>${e(addr.zip)} ${e(addr.city)}, ${e(addr.country || "")}`
      : `${e(addr.office_name || "")}${addr.office_address ? "<br>" + e(addr.office_address) : ""}<br>${e(addr.city || "")}`;
  const payment = order.payment_method === "bank_transfer" ? t(L, "bank", { total: money(order.total), n: order.number }) + (cfg.bank_details ? `<br><span style="white-space:pre-line">${e(cfg.bank_details)}</span>` : "") : t(L, "cod", { total: money(order.total) });
  return `
  ${linesTable(order, origin, money, L)}
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;font-size:14px">${totals}
    <tr><td style="padding:10px 0 2px;font-size:17px;font-weight:600">${t(L, "total")}</td><td style="padding:10px 0 2px;text-align:right;font-size:17px;font-weight:600">${money(order.total)}</td></tr>
    <tr><td colspan="2" style="color:#8a7a6d;font-size:12px">${t(L, "vat", { rate })}: ${money(order.tax_total)}</td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;font-size:14px">
    <tr><td style="vertical-align:top;padding:8px 8px 8px 0;width:50%"><div style="color:#8a7a6d;font-size:12px;text-transform:uppercase;letter-spacing:.05em">${t(L, "delivery")}</div>${e(order.shipping_title)}<br>${delivery}</td>
        <td style="vertical-align:top;padding:8px 0 8px 8px"><div style="color:#8a7a6d;font-size:12px;text-transform:uppercase;letter-spacing:.05em">${t(L, "contact")}</div>${e(addr.name || "")}<br>${e(order.phone || "")}<br>${e(order.email)}</td></tr>
    <tr><td colspan="2" style="padding-top:8px"><div style="color:#8a7a6d;font-size:12px;text-transform:uppercase;letter-spacing:.05em">${t(L, "payment")}</div>${payment}</td></tr>
  </table>`;
}

function shell(inner: string, origin: string) {
  return `<!doctype html><html><body style="margin:0;background:#F5EBE0;font-family:'Nunito Sans',Arial,sans-serif;color:#5E5045">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FEFDFC;border-radius:12px">
    <tr><td style="padding:28px 28px 8px;text-align:center"><a href="${origin}" style="color:#57391F;text-decoration:none;font-family:'Fira Sans',Arial,sans-serif;font-size:26px;letter-spacing:.18em">PAMAURA</a></td></tr>
    <tr><td style="padding:8px 28px 28px">${inner}</td></tr>
  </table>
  <p style="font-size:12px;color:#8a7a6d;margin:16px 0 0">PAMAURA · ДИЛОН ЕООД · гр. София, ул. Иван Радоев 34 · hello@pamaura.com</p>
  </td></tr></table></body></html>`;
}

export async function sendOrderEmails(order: OrderRec, s: RenderState, opts: { shop?: boolean } = {}) {
  const L = order.locale;
  const addr = JSON.parse(order.shipping_address || "{}");
  const url = orderStatusUrl(s.origin, order);
  const customerHtml = shell(
    `<h1 style="font-family:'Fira Sans',Arial,sans-serif;font-weight:300;font-size:24px;margin:0 0 6px;color:#57391F">${t(L, "hello", { name: e(addr.first_name || "") })}</h1>
     <p style="margin:0 0 6px">${t(L, "thanks")}</p>
     <p style="margin:0 0 18px;color:#8a7a6d">${t(L, "order")} <strong style="color:#57391F">#${order.number}</strong> · ${new Date(order.created_at).toLocaleDateString(L === "ro" ? "ro-RO" : "bg-BG", { timeZone: "Europe/Sofia" })}</p>
     ${orderSummaryHtml(order, s.origin)}
     <p style="margin:24px 0 8px;text-align:center"><a href="${url}" style="display:inline-block;background:#a77a53;color:#fefdfc;text-decoration:none;padding:12px 26px;border-radius:6px">${t(L, "view")}</a></p>
     <p style="margin:12px 0 0;font-size:13px;color:#8a7a6d;text-align:center">${t(L, "questions", { phone: s.catalog.shop.phone })}</p>`,
    s.origin,
  );
  await sendMail({ to: order.email, subject: `${t(L, "subject", { n: order.number })} — PAMAURA`, html: customerHtml, replyTo: shopNotifyEmail() });
  if (opts.shop === false) return;
  const shopHtml = shell(
    `<h1 style="font-family:'Fira Sans',Arial,sans-serif;font-weight:300;font-size:22px;margin:0 0 6px;color:#57391F">Нова поръчка #${order.number}</h1>
     <p style="margin:0 0 4px">${e(addr.name || "")} · ${e(order.phone || "")} · ${e(order.email)}</p>
     <p style="margin:0 0 18px;color:#8a7a6d">Пазар: ${e(order.market.toUpperCase())} · Статус: ${STATUS_LABELS[order.status] || order.status}${order.note ? `<br>Бележка: ${e(order.note)}` : ""}</p>
     ${orderSummaryHtml(order, s.origin, true)}
     <p style="margin:24px 0 0;text-align:center"><a href="${s.origin}/admin/poruchki/${order.id}" style="display:inline-block;background:#57391F;color:#fefdfc;text-decoration:none;padding:12px 26px;border-radius:6px">Отвори в админ панела</a></p>`,
    s.origin,
  );
  await sendMail({ to: shopNotifyEmail(), subject: `Нова поръчка #${order.number} — ${formatMoney(order.total, marketOf(order.market).money_format)}`, html: shopHtml, replyTo: order.email });
}

const STATUS_MAIL: Record<string, Record<string, string>> = {
  bg: {
    shipped_subject: "Поръчка #{{n}} е изпратена",
    shipped_text: "Поръчката Ви е предадена на куриера.",
    tracking: "Номер на пратката: {{tracking}}",
    track: "Проследете пратката",
    cancelled_subject: "Поръчка #{{n}} е отказана",
    cancelled_text: "Поръчката Ви беше отказана.",
    reason: "Причина: {{reason}}",
    delivered_subject: "Поръчка #{{n}} е доставена",
    delivered_text: "Поръчката Ви е доставена. Благодарим Ви, че пазарувахте при нас!",
  },
  ro: {
    shipped_subject: "Comanda #{{n}} a fost expediată",
    shipped_text: "Comanda dvs. a fost predată curierului.",
    tracking: "Număr de urmărire: {{tracking}}",
    track: "Urmăriți coletul",
    cancelled_subject: "Comanda #{{n}} a fost anulată",
    cancelled_text: "Comanda dvs. a fost anulată.",
    reason: "Motiv: {{reason}}",
    delivered_subject: "Comanda #{{n}} a fost livrată",
    delivered_text: "Comanda dvs. a fost livrată. Vă mulțumim!",
  },
};

function st(locale: string, key: string, vars: Record<string, string | number> = {}) {
  return (STATUS_MAIL[locale]?.[key] ?? STATUS_MAIL.bg[key]).replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? ""));
}

/** Notice to the customer when the shop ships, delivers or cancels an order (admin → order). */
export async function sendStatusEmail(order: OrderRec, kind: "shipped" | "delivered" | "cancelled", origin: string) {
  const L = order.locale;
  const addr = JSON.parse(order.shipping_address || "{}");
  const parts = [`<p style="margin:0 0 10px">${st(L, `${kind}_text`)}</p>`];
  if (kind === "shipped" && order.tracking_number) {
    parts.push(`<p style="margin:0 0 10px">${st(L, "tracking", { tracking: e(order.tracking_number) })}</p>`);
    if (order.tracking_url) parts.push(`<p style="margin:16px 0;text-align:center"><a href="${e(order.tracking_url)}" style="display:inline-block;background:#a77a53;color:#fefdfc;text-decoration:none;padding:12px 26px;border-radius:6px">${st(L, "track")}</a></p>`);
  }
  if (kind === "cancelled" && order.cancel_reason) parts.push(`<p style="margin:0 0 10px">${st(L, "reason", { reason: e(order.cancel_reason) })}</p>`);
  const html = shell(
    `<h1 style="font-family:'Fira Sans',Arial,sans-serif;font-weight:300;font-size:24px;margin:0 0 10px;color:#57391F">${t(L, "hello", { name: e(addr.first_name || "") })}</h1>
     ${parts.join("")}
     ${orderSummaryHtml(order, origin)}
     <p style="margin:24px 0 8px;text-align:center"><a href="${orderStatusUrl(origin, order)}" style="color:#8c6443">${t(L, "view")}</a></p>
     <p style="margin:12px 0 0;font-size:13px;color:#8a7a6d;text-align:center">${t(L, "questions", { phone: getCatalog().shop.phone })}</p>`,
    origin,
  );
  return sendMail({ to: order.email, subject: `${st(L, `${kind}_subject`, { n: order.number })} — PAMAURA`, html, replyTo: shopNotifyEmail() });
}

