// POST /contact (contact + newsletter forms), /localization, /cart (cart page submit).
import { getCatalog } from "../catalog";
import { saveCart, updateItems, CART_COOKIE } from "../cart";
import { getDb, nowIso } from "../db";
import { escapeHtml, sendMail, shopNotifyEmail } from "../mail";
import { subscribe } from "../newsletter";
import { clientIp, rateLimited } from "../rate-limit";
import type { FormState } from "../liquid/state";
import { parseBody } from "./body";
import { buildRequest, cookie, parseMarketPath, LOCALIZATION_COOKIE, type StoreRequest } from "./context";
import { renderResolved, resolvePage } from "./pages";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ERR: Record<string, Record<string, string>> = {
  bg: { email_invalid: "е невалиден", blank: "не може да е празно", too_many: "Твърде много опити. Опитайте по-късно." },
  ro: { email_invalid: "nu este valid", blank: "nu poate fi gol", too_many: "Prea multe încercări. Încercați mai târziu." },
};
export function errText(locale: string, key: string) {
  return ERR[locale]?.[key] ?? ERR.bg[key];
}

function backPath(sr: StoreRequest, body: Record<string, unknown>): string {
  const rt = typeof body.return_to === "string" ? body.return_to : null;
  if (rt && rt.startsWith("/") && !rt.startsWith("//")) return rt;
  const ref = sr.req.headers.get("referer");
  if (ref) {
    try {
      const u = new URL(ref);
      if (u.host === new URL(sr.state.origin).host) return u.pathname;
    } catch {
      /* ignore */
    }
  }
  return `/${sr.state.market.path}`;
}

/** Re-renders the page the form was posted from, with the form's errors. */
export async function rerenderWithForm(sr: StoreRequest, path: string, form: FormState): Promise<Response> {
  const req = new Request(new URL(path, sr.state.origin).toString(), { headers: sr.req.headers });
  const parsed = parseMarketPath(new URL(req.url).pathname, sr.cookies);
  const sr2 = buildRequest(req, parsed);
  sr2.state.postedForm = form;
  const r = resolvePage(sr2);
  if (!r) return new Response(null, { status: 302, headers: { Location: path } });
  const out = await renderResolved(sr2, r);
  return new Response(out.body, { status: 200, headers: { "Content-Type": out.contentType, "Cache-Control": "no-store" } });
}

function redirect(loc: string) {
  return new Response(null, { status: 302, headers: { Location: loc } });
}

function withQuery(path: string, q: string, hash?: string) {
  const [p] = path.split("#");
  return `${p}${p.includes("?") ? "&" : "?"}${q}${hash ? "#" + hash : ""}`;
}

export async function handleForms(sr: StoreRequest, kind: string): Promise<Response> {
  const s = sr.state;
  const body = await parseBody(sr.req);
  const L = s.locale;

  if (kind === "localization") {
    const cat = getCatalog();
    const country = String(body.country_code || "");
    const lang = String(body.locale_code || body.language_code || "");
    const markets = cat.markets.filter((m) => m.enabled);
    const target = markets.find((m) => m.country === country) || markets.find((m) => m.language === lang) || s.market;
    const ret = typeof body.return_to === "string" && body.return_to.startsWith("/") ? body.return_to : `/${s.market.path}`;
    const restPath = parseMarketPath(ret.split("?")[0], {}).rest;
    sr.setCookies.push(cookie(LOCALIZATION_COOKIE, target.handle, { maxAge: 365 * 86400, secure: sr.secure }));
    return redirect(`/${target.path}${restPath === "/" ? "" : restPath}`);
  }

  if (kind === "cart") {
    if (body.updates) {
      const u = body.updates as Record<string, string> | string[];
      updateItems(s.cart, Array.isArray(u) ? u.map(Number) : Object.fromEntries(Object.entries(u).map(([k, v]) => [k, Number(v)])), L);
    }
    if (body.note !== undefined) s.cart.note = String(body.note).slice(0, 5000);
    if (body.attributes && typeof body.attributes === "object") for (const [k, v] of Object.entries(body.attributes as Record<string, string>)) s.cart.attributes[k] = String(v);
    const wasNew = s.cart.transient;
    saveCart(s.cart);
    if (wasNew) sr.setCookies.push(cookie(CART_COOKIE, s.cart.token, { maxAge: 14 * 86400, secure: sr.secure }));
    if (body.checkout !== undefined) return redirect(`/checkouts/${s.cart.token}?locale=${s.market.path}`);
    return redirect(`/${s.market.path}/cart`);
  }

  // /contact: contact form or newsletter (form_type customer)
  const formType = String(body.form_type || "contact");
  const contact = (body.contact || {}) as Record<string, string>;
  const email = String(contact.email || "").trim();
  const back = backPath(sr, body);
  const ip = clientIp(sr.req);

  if (rateLimited(`form:${formType}:${ip}`, 10, 10 * 60_000)) {
    return rerenderWithForm(sr, back, { type: formType, posted_successfully: false, errors: { form: [errText(L, "too_many")] }, values: {} });
  }
  if (!EMAIL_RE.test(email)) {
    return rerenderWithForm(sr, back, { type: formType, posted_successfully: false, errors: { email: [errText(L, "email_invalid")] }, values: { email } });
  }

  if (formType === "customer") {
    subscribe(email, "newsletter-form", L);
    const formId = String(body.form_id || "");
    return redirect(withQuery(back, "customer_posted=true", formId || undefined));
  }

  const message = String(contact.body || contact.message || "").trim();
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(contact)) if (!["email", "body", "name", "phone"].includes(k)) fields[k] = String(v);
  getDb()
    .prepare("INSERT INTO contact_messages(name, email, phone, body, fields, ip, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)")
    .run(contact.name || null, email, contact.phone || null, message, JSON.stringify(fields), ip, nowIso());
  const rows = Object.entries(contact)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${escapeHtml(k)}</td><td>${escapeHtml(String(v)).replace(/\n/g, "<br>")}</td></tr>`)
    .join("");
  await sendMail({ to: shopNotifyEmail(), replyTo: email, subject: `Ново съобщение от контактната форма — ${contact.name || email}`, html: `<p>Ново съобщение от pamaura.com:</p><table>${rows}</table>` });
  if (contact.accepts_marketing === "true" || contact.tags === "newsletter") subscribe(email, "contact-form", L);
  return redirect(withQuery(back, "contact_posted=true", "contact_form"));
}
