// Customer accounts: /account/login, register, logout, recover, reset, activate, addresses, orders.
import {
  CUSTOMER_COOKIE,
  addresses,
  checkLogin,
  createSession,
  createToken,
  customerByEmail,
  customerById,
  destroySession,
  peekToken,
  registerCustomer,
  setPassword,
  consumeToken,
} from "../customers";
import { getDb, nowIso } from "../db";
import { escapeHtml, sendMail } from "../mail";
import { orderByToken } from "../orders";
import { OrderDrop } from "../liquid/drops/store";
import { localePath, type FormState } from "../liquid/state";
import { clientIp, rateLimited } from "../rate-limit";
import { parseBody } from "./body";
import { cookie, type StoreRequest } from "./context";
import { renderResolved, systemTitle, shopDescription, type Resolved } from "./pages";

const T: Record<string, Record<string, string>> = {
  bg: {
    bad_login: "Неправилен имейл или парола.",
    taken: "Вече има профил с този имейл. Влезте или възстановете паролата си.",
    password_short: "Паролата трябва да е поне 5 символа.",
    password_mismatch: "Паролите не съвпадат.",
    email_invalid: "Невалиден имейл адрес.",
    token_invalid: "Връзката е невалидна или е изтекла. Поискайте нова.",
    too_many: "Твърде много опити. Опитайте отново след няколко минути.",
    reset_subject: "Възстановяване на паролата за PAMAURA",
    reset_body: "Получихме заявка за нова парола за профила Ви в PAMAURA. Отворете връзката, за да изберете нова парола (валидна 1 час):",
    reset_ignore: "Ако не сте поискали това, игнорирайте имейла.",
    welcome_subject: "Добре дошли в PAMAURA",
    welcome_body: "Профилът Ви е създаден. Можете да следите поръчките си от профила.",
  },
  ro: {
    bad_login: "E-mail sau parolă incorecte.",
    taken: "Există deja un cont cu acest e-mail. Autentificați-vă sau resetați parola.",
    password_short: "Parola trebuie să aibă cel puțin 5 caractere.",
    password_mismatch: "Parolele nu se potrivesc.",
    email_invalid: "Adresă de e-mail invalidă.",
    token_invalid: "Linkul este invalid sau a expirat. Solicitați unul nou.",
    too_many: "Prea multe încercări. Încercați din nou peste câteva minute.",
    reset_subject: "Resetarea parolei PAMAURA",
    reset_body: "Am primit o solicitare de resetare a parolei contului dvs. PAMAURA. Deschideți linkul pentru a alege o parolă nouă (valabil 1 oră):",
    reset_ignore: "Dacă nu ați solicitat acest lucru, ignorați acest e-mail.",
    welcome_subject: "Bine ați venit la PAMAURA",
    welcome_body: "Contul dvs. a fost creat. Vă puteți urmări comenzile din cont.",
  },
};
const t = (L: string, k: string) => T[L]?.[k] ?? T.bg[k];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function redirect(loc: string) {
  return new Response(null, { status: 302, headers: { Location: loc } });
}

function page(sr: StoreRequest, template: string, titleKey: string, extra: Partial<Resolved> = {}): Resolved {
  const s = sr.state;
  return {
    status: 200,
    template,
    suffix: null,
    pageType: template.replace("customers/", "customers/"),
    objects: {},
    title: systemTitle(s.locale, titleKey),
    description: shopDescription(s.locale),
    canonical: `${s.origin}${s.fullPath}`,
    ...extra,
  };
}

async function show(sr: StoreRequest, r: Resolved, form?: FormState) {
  if (form) sr.state.postedForm = form;
  const out = await renderResolved(sr, r);
  return new Response(out.body, { status: out.status, headers: { "Content-Type": out.contentType, "Cache-Control": "no-store" } });
}

function err(type: string, msg: string, field = "form", values: Record<string, string> = {}): FormState {
  return { type, posted_successfully: false, errors: { [field]: [msg] }, values };
}

function login(sr: StoreRequest, customerId: number) {
  const { token, maxAge } = createSession(customerId);
  sr.setCookies.push(cookie(CUSTOMER_COOKIE, token, { maxAge, httpOnly: true, secure: sr.secure }));
}

function safeReturn(v: unknown, fallback: string) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
}

export async function handleAccount(sr: StoreRequest): Promise<Response> {
  const s = sr.state;
  const L = s.locale;
  const req = sr.req;
  const rest = s.path;
  const isPost = req.method === "POST";
  const ip = clientIp(req);
  const acct = localePath(s, "/account");

  // ---- login
  if (rest === "/account/login") {
    if (!isPost) {
      if (s.customer) return redirect(acct);
      return show(sr, page(sr, "customers/login", "login"));
    }
    const body = await parseBody(req);
    const c = (body.customer || {}) as Record<string, string>;
    const email = String(c.email || "").trim();
    if (rateLimited(`login:${ip}`, 10, 15 * 60_000) || (email && rateLimited(`login-email:${email.toLowerCase()}`, 8, 15 * 60_000))) {
      return show(sr, page(sr, "customers/login", "login"), err("customer_login", t(L, "too_many")));
    }
    const cust = await checkLogin(email, String(c.password || ""));
    if (!cust) return show(sr, page(sr, "customers/login", "login"), err("customer_login", t(L, "bad_login")));
    login(sr, cust.id);
    return redirect(safeReturn(body.checkout_url || body.return_url, acct));
  }

  if (rest === "/account/logout") {
    destroySession(sr.cookies[CUSTOMER_COOKIE]);
    sr.setCookies.push(cookie(CUSTOMER_COOKIE, "", { maxAge: 0, httpOnly: true, secure: sr.secure }));
    return redirect(localePath(s, "/"));
  }

  if (rest === "/account/register") {
    if (s.customer) return redirect(acct);
    return show(sr, page(sr, "customers/register", "register"));
  }

  // ---- create account: POST /account
  if (rest === "/account" && isPost) {
    const body = await parseBody(req);
    const c = (body.customer || {}) as Record<string, string>;
    const email = String(c.email || "").trim();
    const values = { first_name: c.first_name || "", last_name: c.last_name || "", email };
    const r = page(sr, "customers/register", "register");
    if (rateLimited(`register:${ip}`, 5, 60 * 60_000)) return show(sr, r, err("create_customer", t(L, "too_many"), "form", values));
    if (!EMAIL_RE.test(email)) return show(sr, r, err("create_customer", t(L, "email_invalid"), "form", values));
    if (String(c.password || "").length < 5) return show(sr, r, err("create_customer", t(L, "password_short"), "form", values));
    const created = await registerCustomer({ email, password: String(c.password), first_name: String(c.first_name || "").slice(0, 100), last_name: String(c.last_name || "").slice(0, 100), accepts_marketing: c.accepts_marketing === "true" || c.accepts_marketing === "on", locale: L });
    if (created === "taken") return show(sr, r, err("create_customer", t(L, "taken"), "form", values));
    login(sr, created.id);
    await sendMail({ to: email, subject: t(L, "welcome_subject"), html: `<p>${escapeHtml(t(L, "welcome_body"))}</p><p><a href="${s.origin}${acct}">${s.origin}${acct}</a></p>` });
    return redirect(safeReturn(body.return_to, acct));
  }

  // ---- password recovery
  if (rest === "/account/recover" && isPost) {
    const body = await parseBody(req);
    const email = String(body.email || "").trim();
    const r = page(sr, "customers/login", "login");
    if (rateLimited(`recover:${ip}`, 5, 60 * 60_000) || (email && rateLimited(`recover-email:${email.toLowerCase()}`, 3, 60 * 60_000))) {
      return show(sr, r, err("recover_customer_password", t(L, "too_many")));
    }
    if (!EMAIL_RE.test(email)) return show(sr, r, err("recover_customer_password", t(L, "email_invalid")));
    const cust = customerByEmail(email);
    if (cust && cust.state !== "disabled") {
      const token = createToken(cust.id, "reset", 1);
      const link = `${s.origin}${localePath(s, `/account/reset/${cust.id}/${token}`)}`;
      await sendMail({ to: cust.email, subject: t(L, "reset_subject"), html: `<p>${escapeHtml(t(L, "reset_body"))}</p><p><a href="${link}">${link}</a></p><p style="color:#777">${escapeHtml(t(L, "reset_ignore"))}</p>` });
    }
    // same answer whether or not the address exists
    return show(sr, r, { type: "recover_customer_password", posted_successfully: true, errors: null, values: {} });
  }

  // ---- reset / activate
  let m = rest.match(/^\/account\/(reset|activate)\/(\d+)\/([^/]+)$/);
  if (m && !isPost) {
    const kind = m[1] as "reset" | "activate";
    if (!peekToken(Number(m[2]), m[3], kind)) return show(sr, page(sr, "customers/login", "login"), err("customer_login", t(L, "token_invalid")));
    return show(sr, page(sr, kind === "reset" ? "customers/reset_password" : "customers/activate_account", kind === "reset" ? "reset_password" : "activate_account"));
  }
  if ((rest === "/account/reset" || rest === "/account/activate") && isPost) {
    const kind = rest === "/account/reset" ? "reset" : "activate";
    const body = await parseBody(req);
    const id = Number(body.customer_id);
    const token = String(body.token || "");
    const c = (body.customer || {}) as Record<string, string>;
    const tpl = kind === "reset" ? "customers/reset_password" : "customers/activate_account";
    const ftype = kind === "reset" ? "reset_customer_password" : "activate_customer_password";
    if (body.decline !== undefined) return redirect(localePath(s, "/"));
    s.path = `/account/${kind}/${id}/${token}`;
    const r = page(sr, tpl, kind === "reset" ? "reset_password" : "activate_account");
    if (String(c.password || "").length < 5) return show(sr, r, err(ftype, t(L, "password_short"), "password"));
    if (c.password !== c.password_confirmation) return show(sr, r, err(ftype, t(L, "password_mismatch"), "password_confirmation"));
    if (!consumeToken(id, token, kind)) return show(sr, page(sr, "customers/login", "login"), err("customer_login", t(L, "token_invalid")));
    await setPassword(id, String(c.password));
    login(sr, id);
    return redirect(acct);
  }

  // ---- everything below needs a session
  if (!s.customer) return redirect(localePath(s, "/account/login"));
  const customer = s.customer;

  if (rest === "/account") return show(sr, page(sr, "customers/account", "account"));

  if (rest === "/account/addresses" || /^\/account\/addresses\/\d+$/.test(rest)) {
    if (!isPost) return show(sr, page(sr, "customers/addresses", "addresses"));
    const body = await parseBody(req);
    const a = (body.address || {}) as Record<string, string>;
    const db = getDb();
    const idMatch = rest.match(/\/(\d+)$/);
    const method = String(body._method || "").toLowerCase();
    const fields = ["first_name", "last_name", "company", "address1", "address2", "city", "province", "country", "zip", "phone"].map((k) => String(a[k] ?? "").slice(0, 255));
    const isDefault = a.default === "1" || a.default === "true" ? 1 : 0;
    if (idMatch) {
      const id = Number(idMatch[1]);
      const own = db.prepare("SELECT id FROM customer_addresses WHERE id = ? AND customer_id = ?").get(id, customer.id);
      if (!own) return redirect(localePath(s, "/account/addresses"));
      if (method === "delete") db.prepare("DELETE FROM customer_addresses WHERE id = ?").run(id);
      else {
        db.prepare("UPDATE customer_addresses SET first_name=?, last_name=?, company=?, address1=?, address2=?, city=?, province=?, country=?, zip=?, phone=? WHERE id = ?").run(...fields, id);
        if (isDefault) {
          db.prepare("UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?").run(customer.id);
          db.prepare("UPDATE customer_addresses SET is_default = 1 WHERE id = ?").run(id);
        }
      }
    } else {
      const hasAny = addresses(customer.id).length > 0;
      const info = db
        .prepare("INSERT INTO customer_addresses(customer_id, first_name, last_name, company, address1, address2, city, province, country, zip, phone, is_default) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(customer.id, ...fields, isDefault || !hasAny ? 1 : 0);
      if (isDefault) db.prepare("UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ? AND id != ?").run(customer.id, info.lastInsertRowid);
    }
    db.prepare("UPDATE customers SET updated_at = ? WHERE id = ?").run(nowIso(), customer.id);
    return redirect(localePath(s, "/account/addresses"));
  }

  m = rest.match(/^\/account\/orders\/([a-z0-9]+)$/i);
  if (m) {
    const order = orderByToken(m[1]);
    if (!order || order.customer_id !== customer.id) return redirect(acct);
    const r = page(sr, "customers/order", "order");
    r.title = `${systemTitle(L, "order")} #${order.number}`;
    sr.state.templateName = "customers/order";
    const resolved = { ...r, objects: { __order: order } };
    // the order object is created inside renderResolved via objects
    return showOrder(sr, resolved, order);
  }

  void customerById;
  return redirect(acct);
}

async function showOrder(sr: StoreRequest, r: Resolved, order: NonNullable<ReturnType<typeof orderByToken>>) {
  const { createEnv, renderPage } = await import("../liquid/render");
  const s = sr.state;
  s.templateName = r.template;
  s.templateSuffix = null;
  s.pageType = "customers/order";
  const env = createEnv(s, {}, { pageTitle: r.title, pageDescription: r.description, canonicalUrl: r.canonical });
  env.globals.order = new OrderDrop(s, env.f, order);
  const html = await renderPage(env, r.template, null);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
