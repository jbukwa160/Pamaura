// Product reviews, shown where the Judge.me app blocks were (badge under the title, review widget,
// shop rating summary). Same look as the Judge.me widget the live store showed; our own markup.
import { getDb } from "./db";
import type { ProductDrop } from "./liquid/drops/catalog";
import type { Env } from "./liquid/settings";

export interface ReviewRow {
  id: number;
  product_id: number | null;
  rating: number;
  title: string;
  body: string;
  author: string;
  verified: number;
  pictures: string;
  reply: string | null;
  created_at: string;
}

export const REVIEWS_PER_PAGE = 5;

const T: Record<string, Record<string, string>> = {
  bg: {
    title: "Отзиви от клиенти",
    of5: "{{avg}} от 5",
    based: "На базата на {{n}} отзива",
    based_one: "На базата на 1 отзив",
    count: "{{n}} отзива",
    count_one: "1 отзив",
    verified: "Проверено",
    sort_recent: "Най-нови",
    sort_high: "Най-висока оценка",
    sort_low: "Най-ниска оценка",
    sort_pictures: "Само със снимки",
    reply: "Отговор от PAMAURA",
    none: "Все още няма отзиви за този продукт.",
    stars: "{{n}} звезди",
    write: "Напишете отзив",
    first: "Бъдете първият, който ще напише отзив",
    cancel: "Отмяна на отзив",
    f_rating: "Оценка",
    f_name: "Име за показване",
    f_email: "Имейл адрес",
    f_email_hint: "Няма да бъде публикуван.",
    f_title: "Заглавие на отзив",
    f_title_ph: "Дайте заглавие на вашия отзив",
    f_body: "Съдържание на отзива",
    f_body_ph: "Започнете да пишете тук...",
    submit: "Изпращане на отзив",
    sent: "Благодаря! Вашият отзив ще бъде публикуван веднага щом бъде одобрен.",
    err_required: "Моля, попълнете всички полета и изберете оценка.",
    err_email: "Моля, въведете валиден имейл адрес.",
    err_generic: "Отзивът не беше изпратен. Опитайте отново.",
  },
  ro: {
    title: "Recenzii clienți",
    of5: "{{avg}} din 5",
    based: "Pe baza a {{n}} recenzii",
    based_one: "Pe baza unei recenzii",
    count: "{{n}} recenzii",
    count_one: "1 recenzie",
    verified: "Verificat",
    sort_recent: "Cele mai recente",
    sort_high: "Cel mai bine notate",
    sort_low: "Cel mai slab notate",
    sort_pictures: "Doar cu fotografii",
    reply: "Răspuns de la PAMAURA",
    none: "Încă nu există recenzii pentru acest produs.",
    stars: "{{n}} stele",
    write: "Scrieți o recenzie",
    first: "Fiți primul care scrie o recenzie",
    cancel: "Anulați recenzia",
    f_rating: "Evaluare",
    f_name: "Nume afișat",
    f_email: "Adresă de e-mail",
    f_email_hint: "Nu va fi publicată.",
    f_title: "Titlul recenziei",
    f_title_ph: "Dați un titlu recenziei",
    f_body: "Recenzia",
    f_body_ph: "Începeți să scrieți aici...",
    submit: "Trimiteți recenzia",
    sent: "Mulțumim! Recenzia dvs. va fi publicată după ce este aprobată.",
    err_required: "Completați toate câmpurile și alegeți o evaluare.",
    err_email: "Introduceți o adresă de e-mail validă.",
    err_generic: "Recenzia nu a fost trimisă. Încercați din nou.",
  },
};
export function rt(locale: string, key: string, vars: Record<string, string | number> = {}) {
  return (T[locale]?.[key] ?? T.bg[key]).replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? ""));
}

const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function productStats(productId: number) {
  const rows = getDb().prepare("SELECT rating, COUNT(*) AS n FROM reviews WHERE product_id = ? AND status = 'published' GROUP BY rating").all(productId) as { rating: number; n: number }[];
  const hist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let n = 0, sum = 0;
  for (const r of rows) {
    hist[r.rating] = (hist[r.rating] || 0) + r.n;
    n += r.n;
    sum += r.rating * r.n;
  }
  return { count: n, avg: n ? Math.round((sum / n) * 100) / 100 : 0, hist };
}

export function shopStats() {
  const r = getDb().prepare("SELECT COUNT(*) AS n, AVG(rating) AS a FROM reviews WHERE status = 'published'").get() as { n: number; a: number | null };
  return { count: r.n, avg: r.a ? Math.round(r.a * 100) / 100 : 0 };
}

const STAR_PATH = "M12 .9l3.4 7 7.7 1.1-5.6 5.4 1.3 7.6L12 18.4 5.2 22l1.3-7.6L.9 9l7.7-1.1z";
const STAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
const STAR_EMPTY = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M12 3.6l2.6 5.4 6 .8-4.3 4.2 1 5.9L12 17.1l-5.3 2.8 1-5.9-4.3-4.2 6-.8z"/></svg>`;
const STAR_HALF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M12 3.6l2.6 5.4 6 .8-4.3 4.2 1 5.9L12 17.1l-5.3 2.8 1-5.9-4.3-4.2 6-.8z"/><path d="M12 .9v17.5L5.2 22l1.3-7.6L.9 9l7.7-1.1z"/></svg>`;

export function starsHtml(score: number, cls = "") {
  let out = "";
  for (let i = 1; i <= 5; i++) {
    if (score >= i - 0.25) out += STAR;
    else if (score >= i - 0.75) out += STAR_HALF;
    else out += STAR_EMPTY;
  }
  return `<span class="pm-stars ${cls}" role="img" aria-label="${score} / 5">${out}</span>`;
}

function relative(locale: string, iso: string, now = Date.now()) {
  const d = (now - new Date(iso).getTime()) / 1000;
  const f = new Intl.RelativeTimeFormat(locale === "ro" ? "ro" : "bg", { numeric: "always" });
  if (d < 3600) return f.format(-Math.max(1, Math.round(d / 60)), "minute");
  if (d < 86400) return f.format(-Math.round(d / 3600), "hour");
  if (d < 86400 * 30) return f.format(-Math.round(d / 86400), "day");
  if (d < 86400 * 365) return f.format(-Math.max(1, Math.floor(d / (86400 * 30))), "month");
  return f.format(-Math.floor(d / (86400 * 365)), "year");
}

const AVATAR = '<svg viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" fill="#EFEEEE"/><circle cx="17" cy="14" r="4.2" fill="none" stroke="#A67A55" stroke-width="1.6"/><path d="M9.5 27c0-4.4 3.4-7.4 7.5-7.4s7.5 3 7.5 7.4" fill="none" stroke="#A67A55" stroke-width="1.6"/><rect x="25" y="25" width="11" height="11" fill="#A67A55"/><path d="M27.6 30.6l1.9 1.9 3.6-3.8" fill="none" stroke="#fff" stroke-width="1.4"/></svg>';

export function reviewItemsHtml(locale: string, rows: ReviewRow[], host: string) {
  return rows
    .map((r) => {
      const pics = (JSON.parse(r.pictures || "[]") as string[])
        .map((p) => `<a class="pm-review__pic" href="//${host}/cdn/shop/files/${p.split("/").map(encodeURIComponent).join("/")}" target="_blank" rel="noopener"><img loading="lazy" src="//${host}/cdn/shop/files/${p.split("/").map(encodeURIComponent).join("/")}?width=160&height=160&crop=center" alt=""></a>`)
        .join("");
      return `<div class="pm-review" data-review-id="${r.id}">
  <div class="pm-review__author"><span class="pm-review__avatar">${AVATAR}</span><span class="pm-review__name">${esc(r.author)}</span>${r.verified ? ` <span class="pm-review__badge">${rt(locale, "verified")}</span>` : ""}</div>
  <div class="pm-review__main">
    <div class="pm-review__head">${starsHtml(r.rating, "pm-stars--item")}<time class="pm-review__date" datetime="${esc(r.created_at)}">${relative(locale, r.created_at)}</time></div>
    ${r.title ? `<div class="pm-review__title">${esc(r.title)}</div>` : ""}
    <div class="pm-review__body">${r.body}</div>
    ${pics ? `<div class="pm-review__pics">${pics}</div>` : ""}
    ${r.reply ? `<div class="pm-review__reply"><div class="pm-review__reply-title">${rt(locale, "reply")}</div>${r.reply}</div>` : ""}
  </div>
</div>`;
    })
    .join("");
}

export function pageReviews(productId: number, page: number, sort: string): { rows: ReviewRow[]; pages: number; total: number } {
  const order = sort === "highest" ? "rating DESC, created_at DESC" : sort === "lowest" ? "rating ASC, created_at DESC" : "created_at DESC";
  const where = `product_id = ? AND status = 'published'${sort === "pictures" ? " AND pictures != '[]'" : ""}`;
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM reviews WHERE ${where}`).get(productId) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / REVIEWS_PER_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const rows = db.prepare(`SELECT * FROM reviews WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(productId, REVIEWS_PER_PAGE, (p - 1) * REVIEWS_PER_PAGE) as ReviewRow[];
  return { rows, pages, total };
}

export function paginationHtml(page: number, pages: number) {
  if (pages <= 1) return "";
  const nums: string[] = [];
  const from = Math.max(1, Math.min(page - 1, pages - 2));
  for (let i = from; i <= Math.min(pages, from + 2); i++) nums.push(i === page ? `<span class="pm-page pm-page--current">${i}</span>` : `<a class="pm-page" href="#" data-page="${i}">${i}</a>`);
  const prev = page > 1 ? `<a class="pm-page pm-page--first" href="#" data-page="1" aria-label="first">|‹</a><a class="pm-page pm-page--prev" href="#" data-page="${page - 1}" aria-label="previous">‹</a>` : "";
  const next = page < pages ? `<a class="pm-page pm-page--next" href="#" data-page="${page + 1}" aria-label="next">›</a><a class="pm-page pm-page--last" href="#" data-page="${pages}" aria-label="last">›|</a>` : "";
  return prev + nums.join("") + next;
}

// ---------------------------------------------------------------------------------------------

export function reviewBadgeHtml(env: Env, product: ProductDrop): string {
  const st = productStats(product.id);
  if (!st.count) return "";
  const L = env.s.locale;
  return `<a class="pm-badge" href="#judgeme_product_reviews">${starsHtml(st.avg, "pm-stars--badge")}<span class="pm-badge__text">${st.count === 1 ? rt(L, "count_one") : rt(L, "count", { n: st.count })}</span></a>`;
}

/** "Write a review" button and form (reviews wait for approval in the admin). */
function writeFormHtml(L: string, productId: number) {
  const stars = [5, 4, 3, 2, 1]
    .map((n) => `<input type="radio" id="pm-rate-${productId}-${n}" name="rating" value="${n}"><label for="pm-rate-${productId}-${n}" title="${esc(rt(L, "stars", { n }))}">${STAR}</label>`)
    .join("");
  return `<button type="button" class="pm-write-btn" aria-expanded="false">${esc(rt(L, "write"))}</button>
  <form class="pm-write" hidden novalidate data-cancel="${esc(rt(L, "cancel"))}" data-write="${esc(rt(L, "write"))}" data-err-required="${esc(rt(L, "err_required"))}" data-err-email="${esc(rt(L, "err_email"))}" data-err-generic="${esc(rt(L, "err_generic"))}" data-sent="${esc(rt(L, "sent"))}">
    <fieldset class="pm-write__rating"><legend>${esc(rt(L, "f_rating"))}</legend><div class="pm-rate">${stars}</div></fieldset>
    <label class="pm-write__field"><span>${esc(rt(L, "f_name"))}</span><input name="name" maxlength="60" autocomplete="name" required></label>
    <label class="pm-write__field"><span>${esc(rt(L, "f_email"))} <small>${esc(rt(L, "f_email_hint"))}</small></span><input name="email" type="email" maxlength="200" autocomplete="email" required></label>
    <label class="pm-write__field"><span>${esc(rt(L, "f_title"))}</span><input name="title" maxlength="120" placeholder="${esc(rt(L, "f_title_ph"))}" required></label>
    <label class="pm-write__field"><span>${esc(rt(L, "f_body"))}</span><textarea name="body" rows="5" maxlength="5000" placeholder="${esc(rt(L, "f_body_ph"))}" required></textarea></label>
    <label class="pm-write__hp" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off"></label>
    <p class="pm-write__msg" role="status"></p>
    <button type="submit" class="pm-write__submit">${esc(rt(L, "submit"))}</button>
  </form>`;
}

export function reviewWidgetHtml(env: Env, product: ProductDrop): string {
  const L = env.s.locale;
  const st = productStats(product.id);
  if (!st.count) {
    return `<div id="judgeme_product_reviews" class="pm-reviews pm-reviews--empty" data-product-id="${product.id}" data-locale="${L}" data-market="${env.s.market.path}">
  <h2 class="pm-reviews__title">${rt(L, "title")}</h2>
  <div class="pm-reviews__summary pm-reviews__summary--empty"><div class="pm-reviews__avg"><div>${starsHtml(0, "pm-stars--avg")}</div><div class="pm-reviews__based">${rt(L, "first")}</div></div><div class="pm-reviews__aside">${writeFormHtml(L, product.id)}</div></div>
</div>`;
  }
  const { rows, pages } = pageReviews(product.id, 1, "recent");
  const hist = [5, 4, 3, 2, 1]
    .map((n) => {
      const c = st.hist[n] || 0;
      const pct = st.count ? Math.round((c / st.count) * 100) : 0;
      return `<div class="pm-hist__row">${starsHtml(n, "pm-stars--hist")}<span class="pm-hist__bar"><span style="width:${pct}%"></span></span><span class="pm-hist__count">${c}</span></div>`;
    })
    .join("");
  return `<div id="judgeme_product_reviews" class="pm-reviews" data-product-id="${product.id}" data-locale="${L}" data-market="${env.s.market.path}">
  <h2 class="pm-reviews__title">${rt(L, "title")}</h2>
  <div class="pm-reviews__summary">
    <div class="pm-reviews__avg"><div>${starsHtml(st.avg, "pm-stars--avg")} <a href="#pm-reviews-list" class="pm-reviews__avg-link">${rt(L, "of5", { avg: st.avg.toFixed(2) })}</a></div><div class="pm-reviews__based">${st.count === 1 ? rt(L, "based_one") : rt(L, "based", { n: st.count })}</div></div>
    <div class="pm-reviews__hist">${hist}</div>
    <div class="pm-reviews__aside">${writeFormHtml(L, product.id)}</div>
  </div>
  <div class="pm-reviews__toolbar"><select class="pm-reviews__sort" aria-label="sort">
    <option value="recent">${rt(L, "sort_recent")}</option><option value="highest">${rt(L, "sort_high")}</option><option value="lowest">${rt(L, "sort_low")}</option><option value="pictures">${rt(L, "sort_pictures")}</option>
  </select></div>
  <div class="pm-reviews__list" id="pm-reviews-list">${reviewItemsHtml(L, rows, env.s.host)}</div>
  <nav class="pm-reviews__pages" data-pages="${pages}" data-page="1">${paginationHtml(1, pages)}</nav>
</div>`;
}

/** Replaces the Judge.me "medals" block: shop rating + number of reviews. */
export function shopRatingHtml(env: Env): string {
  const st = shopStats();
  if (!st.count) return "";
  return `<div class="pm-shop-rating">${starsHtml(st.avg, "pm-stars--shop")}<span class="pm-shop-rating__text">${rt(env.s.locale, "count", { n: st.count })}</span></div>`;
}

export function reviewsHeadHtml(env: Env): string {
  void env;
  return `<style id="pm-reviews-css">
.pm-stars{display:inline-flex;gap:1px;color:#E9B61F;vertical-align:middle;line-height:1}
.pm-stars svg{width:17px;height:17px;fill:currentColor;display:block}
.pm-stars--badge{color:#FBCD0A;gap:2px}
.pm-stars--badge svg{width:17px;height:17px}
.pm-stars--avg svg,.pm-stars--item svg{width:20px;height:20px}
.pm-stars--hist svg{width:15px;height:15px}
.pm-badge{display:inline-flex;align-items:center;gap:6px;color:#5E5045;text-decoration:none;font-size:15px;line-height:1.2;margin:2px 0 4px}
.pm-badge:hover{text-decoration:none}
.pm-reviews{max-width:1200px;margin:0 auto;padding:20px 16px 0;color:#5E5045;font-size:16px;line-height:1.4}
.pm-reviews__title{font-family:var(--font-stack-headings-primary);font-weight:var(--font-weight-headings-primary);font-size:24px;text-align:center;margin:0 0 28px;letter-spacing:.5px}
.pm-reviews__summary{display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;border-bottom:1px solid #F5EFEB;padding-bottom:24px}
.pm-reviews__avg{text-align:center;border-right:1px solid #F5EFEB;padding:18px 10px}
.pm-reviews__avg-link{color:#A67A55;text-decoration:underline;margin-left:4px}
.pm-reviews__based{margin-top:4px}
.pm-reviews__hist{padding:0 20px;border-right:1px solid #F5EFEB;display:flex;flex-direction:column;align-items:center;gap:6px}
.pm-hist__row{display:flex;align-items:center;gap:30px;font-size:13px}
.pm-hist__bar{display:block;width:140px;height:12px;background:#EFEEEE}
.pm-hist__bar span{display:block;height:100%;background:#A67A55}
.pm-hist__count{color:#898989;min-width:24px}
.pm-reviews__toolbar{border-bottom:1px solid #F5EFEB;padding:16px 0}
.pm-reviews .pm-reviews__sort{-webkit-appearance:none;appearance:none;border:0;border-radius:0;box-shadow:none;width:auto;min-width:160px;height:auto;margin:0;background:transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%235E5045' stroke-width='1.4'/%3E%3C/svg%3E") no-repeat right 4px center;color:#A67A55;font:inherit;font-size:14px;padding:4px 24px 4px 0;cursor:pointer}
.pm-review{display:grid;grid-template-columns:374px 1fr;gap:0 20px;padding:18px 0 32px;border-bottom:1px solid #F5EFEB}
.pm-review__author{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap}
.pm-review__avatar svg{width:36px;height:36px;display:block}
.pm-review__name{color:#A67A55;margin-top:-2px}
.pm-review__badge{background:#A67A55;color:#fff;font-size:12px;line-height:1;padding:3px 6px;margin-top:2px}
.pm-review__head{display:flex;justify-content:space-between;align-items:center;margin-top:10px}
.pm-review__date{font-size:13px;color:#6B6B6B}
.pm-review__title{margin-top:10px}
.pm-review__body{margin-top:8px}
.pm-review__body p{margin:0 0 6px}
.pm-review__pics{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.pm-review__pic img{width:80px;height:80px;object-fit:cover;display:block}
.pm-review__reply{margin-top:12px;padding:10px 14px;background:#F5EFEB;font-size:15px}
.pm-review__reply-title{font-weight:600;margin-bottom:4px}
.pm-reviews__pages{display:flex;justify-content:center;align-items:baseline;gap:22px;padding:24px 0}
.pm-page{color:#A67A55;text-decoration:none;font-size:16px}
.pm-page--current{color:#6B6B6B;font-size:22px;font-weight:600}
.pm-reviews.is-loading .pm-reviews__list{opacity:.4}
.pm-shop-rating{display:flex;align-items:center;justify-content:center;gap:8px;color:#5E5045;font-size:16px;padding:10px 0}
.pm-shop-rating .pm-stars{color:#E9B61F}
.pm-shop-rating .pm-stars svg{width:20px;height:20px}
.pm-reviews__aside{text-align:center;padding:0 10px}
.pm-write-btn,.pm-write__submit{background:#A67A55;color:#fff;border:0;padding:12px 26px;font:inherit;font-size:15px;cursor:pointer}
.pm-write-btn:hover,.pm-write__submit:hover{background:#8c6443}
.pm-write{text-align:left;max-width:560px;margin:18px auto 0}
.pm-reviews__summary:has(.pm-write:not([hidden])){grid-template-columns:1fr}
.pm-reviews__summary:has(.pm-write:not([hidden])) .pm-reviews__avg,.pm-reviews__summary:has(.pm-write:not([hidden])) .pm-reviews__hist{display:none}
.pm-write fieldset{border:0;padding:0;margin:0 0 14px}
.pm-write legend,.pm-write__field>span{display:block;font-size:14px;margin-bottom:6px}
.pm-write__field{display:block;margin-bottom:14px}
.pm-write__field small{color:#898989}
.pm-write__field input,.pm-write__field textarea{width:100%;box-sizing:border-box;border:1px solid #E9DBCF;background:#fff;padding:10px 12px;font:inherit;font-size:15px;color:#5E5045;border-radius:0;margin:0}
.pm-write__hp{position:absolute;left:-9999px}
.pm-rate{display:inline-flex;flex-direction:row-reverse;gap:4px}
.pm-rate input{position:absolute;opacity:0;width:1px;height:1px}
.pm-rate label{cursor:pointer;color:#D9D3CE}
.pm-rate label svg{width:26px;height:26px;fill:currentColor;display:block}
.pm-rate label:hover,.pm-rate label:hover~label,.pm-rate input:checked~label{color:#E9B61F}
.pm-rate input:focus-visible+label{outline:2px solid #A67A55;outline-offset:2px}
.pm-write__msg{min-height:1.2em;font-size:14px;margin:4px 0 12px}
.pm-write__msg.is-error{color:#c43846}
.pm-write.is-sent .pm-write__field,.pm-write.is-sent fieldset,.pm-write.is-sent .pm-write__submit{display:none}
.pm-reviews__summary--empty{grid-template-columns:1fr 1fr}
@media (max-width:767px){
  .pm-reviews__summary{grid-template-columns:1fr;border-bottom:1px solid #F5EFEB}
  .pm-reviews__avg,.pm-reviews__hist{border-right:0}
  .pm-reviews__aside{display:none}
  .pm-review{grid-template-columns:1fr}
  .pm-review__head{margin-top:14px}
}
</style>
<script defer>
document.addEventListener('DOMContentLoaded',function(){
  var root=document.querySelector('.pm-reviews'); if(!root) return;
  var btn=root.querySelector('.pm-write-btn'), form=root.querySelector('.pm-write');
  if(btn&&form){
    btn.addEventListener('click',function(){ var open=form.hidden; form.hidden=!open; btn.setAttribute('aria-expanded',String(open)); btn.textContent=open?form.dataset.cancel:form.dataset.write; if(open){ var f=form.querySelector('input[name=rating]'); if(f) f.focus(); } });
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var msg=form.querySelector('.pm-write__msg'), fd=new FormData(form), data={};
      fd.forEach(function(v,k){ data[k]=String(v).trim(); });
      msg.classList.remove('is-error');
      if(!data.rating||!data.name||!data.email||!data.title||!data.body){ msg.textContent=form.dataset.errRequired; msg.classList.add('is-error'); return; }
      if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(data.email)){ msg.textContent=form.dataset.errEmail; msg.classList.add('is-error'); return; }
      data.product_id=root.dataset.productId; data.locale=root.dataset.locale;
      var submit=form.querySelector('.pm-write__submit'); submit.disabled=true;
      fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
        .then(function(r){ return r.json().then(function(d){ return {ok:r.ok,d:d}; }); })
        .then(function(x){ submit.disabled=false; if(x.ok&&x.d.ok){ form.classList.add('is-sent'); msg.textContent=form.dataset.sent; btn.hidden=true; } else { msg.textContent=(x.d&&x.d.error)||form.dataset.errGeneric; msg.classList.add('is-error'); } })
        .catch(function(){ submit.disabled=false; msg.textContent=form.dataset.errGeneric; msg.classList.add('is-error'); });
    });
  }
  var list=root.querySelector('.pm-reviews__list'), nav=root.querySelector('.pm-reviews__pages'), sort=root.querySelector('.pm-reviews__sort');
  if(!list||!nav||!sort) return;
  function load(page){
    root.classList.add('is-loading');
    fetch('/api/reviews?product_id='+root.dataset.productId+'&page='+page+'&sort='+encodeURIComponent(sort.value)+'&locale='+root.dataset.locale)
      .then(function(r){return r.json()}).then(function(d){ list.innerHTML=d.items; nav.innerHTML=d.pagination; root.classList.remove('is-loading'); if(page>1||sort.value!=='recent') root.scrollIntoView({behavior:'smooth',block:'start'}); })
      .catch(function(){ root.classList.remove('is-loading'); });
  }
  nav.addEventListener('click',function(e){ var a=e.target.closest('[data-page]'); if(!a) return; e.preventDefault(); load(Number(a.dataset.page)); });
  sort.addEventListener('change',function(){ load(1); });
});
</script>`;
}
