"use client";
/* eslint-disable @next/next/no-img-element -- thumbnails come resized from /cdn */
// Checkout form: contact, delivery (courier office / locker / address), payment, discount code and
// the order summary. Prices always come from the server (/api/checkout/<token>/quote).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Quote, QuoteMethod } from "@/lib/checkout";
import type { CheckoutTexts } from "@/lib/checkout-i18n";
import type { City, Office } from "@/lib/shipping/couriers/types";
import { formatMoney } from "@/lib/money";

export interface CheckoutProps {
  token: string;
  marketPath: string;
  locale: string;
  moneyFormat: string;
  currency: string;
  texts: CheckoutTexts;
  quote: Quote;
  freeThreshold: number | null;
  prefill: { email: string; phone: string; first_name: string; last_name: string; accepts_marketing: boolean };
  country: string;
  links: { home: string; cart: string; terms: string; privacy: string };
  shopName: string;
  logo: string | null;
}

type Errors = Record<string, string>;

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? ""));

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="6" />
      <path d="m13 13 5 5" strokeLinecap="round" />
    </svg>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  required?: boolean;
  textarea?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  children?: React.ReactNode;
}) {
  const errId = `${props.id}-error`;
  const common = {
    id: props.id,
    name: props.id,
    value: props.value,
    placeholder: " ",
    "aria-invalid": props.error ? true : undefined,
    "aria-describedby": props.error ? errId : undefined,
    required: props.required,
  };
  return (
    <div className={`co-field${props.error ? " co-field--error" : ""}`}>
      {props.textarea ? (
        <textarea {...common} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input
          {...common}
          type={props.type || "text"}
          autoComplete={props.autoComplete}
          inputMode={props.inputMode}
          onChange={(e) => props.onChange(e.target.value)}
          onFocus={props.onFocus}
          onBlur={props.onBlur}
          onKeyDown={props.onKeyDown}
        />
      )}
      <label htmlFor={props.id}>{props.label}</label>
      {props.children}
      {props.error ? (
        <p className="co-error" id={errId}>
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

/** Office / locker picker backed by the courier's list (/api/shipping/offices). */
function OfficePicker(props: { method: QuoteMethod; texts: CheckoutTexts; value: Office | null; onChange: (o: Office | null) => void; error?: string }) {
  const { method, texts: T, value, onChange } = props;
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 250);
  const kind = method.kind === "locker" ? "locker" : "office";
  const url = `/api/shipping/offices?carrier=${encodeURIComponent(method.carrier)}&kind=${kind}&q=${encodeURIComponent(q)}`;
  // the answer remembers its URL: while it differs from the current one the list is loading
  const [result, setResult] = useState<{ url: string; offices: Office[]; error: boolean } | null>(null);

  useEffect(() => {
    if (value) return;
    const ctl = new AbortController();
    fetch(url, { signal: ctl.signal })
      .then((r) => r.json())
      .then((d: { offices: Office[]; error?: string }) => setResult({ url, offices: d.offices || [], error: Boolean(d.error) }))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setResult({ url, offices: [], error: true });
      });
    return () => ctl.abort();
  }, [url, value]);
  const list = result?.offices || [];
  const state: "idle" | "loading" | "error" = !result || result.url !== url ? "loading" : result.error ? "error" : "idle";

  if (value) {
    return (
      <div className="co-office-picked">
        <div>
          <span className="co-office-name">{value.name}</span>
          <span className="co-office-addr">{[value.city, value.address].filter(Boolean).join(", ")}</span>
        </div>
        <button type="button" className="co-link-btn" onClick={() => onChange(null)}>
          {T.office_change}
        </button>
      </div>
    );
  }
  const label = method.kind === "locker" ? T.locker_search : T.office_search;
  return (
    <div>
      <div className="co-search">
        <SearchIcon />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={label}
          aria-label={label}
          aria-invalid={props.error ? true : undefined}
          autoComplete="off"
        />
      </div>
      {state === "loading" && !list.length ? <p className="co-office-status">{T.office_loading}</p> : null}
      {state === "error" ? <p className="co-office-status">{T.office_error}</p> : null}
      {state !== "error" && state !== "loading" && !list.length ? <p className="co-office-status">{T.office_none}</p> : null}
      {list.length ? (
        <ul className="co-office-list">
          {list.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => onChange(o)}>
                <span className="co-office-name">{o.name}</span>
                <span className="co-office-addr">{[o.city, o.address, o.note].filter(Boolean).join(", ")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {props.error ? <p className="co-error">{props.error}</p> : null}
    </div>
  );
}

/** City field with suggestions from Econt's list of places (Bulgaria); fills in the postcode. */
function CityField(props: { texts: CheckoutTexts; value: string; onChange: (v: string) => void; onPick: (c: City) => void; error?: string; suggest: boolean }) {
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ q: string; cities: City[] }>({ q: "", cities: [] });
  const [active, setActive] = useState(-1);
  const q = useDebounced(props.value, 250).trim();
  const wanted = props.suggest && q.length >= 2;
  useEffect(() => {
    if (!wanted) return;
    const ctl = new AbortController();
    fetch(`/api/shipping/cities?carrier=econt&q=${encodeURIComponent(q)}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((d: { cities: City[] }) => setFound({ q, cities: d.cities || [] }))
      .catch(() => undefined);
    return () => ctl.abort();
  }, [q, wanted]);
  const list = wanted && found.q === q ? found.cities : [];
  const pick = (c: City) => {
    props.onPick(c);
    setOpen(false);
    setActive(-1);
  };
  return (
    <Field
      id="city"
      label={props.texts.city}
      value={props.value}
      onChange={(v) => {
        props.onChange(v);
        setOpen(true);
      }}
      autoComplete="address-level2"
      error={props.error}
      onFocus={() => setOpen(true)}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
      onKeyDown={(e) => {
        if (!open || !list.length) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive((a) => Math.min(list.length - 1, a + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive((a) => Math.max(0, a - 1));
        } else if (e.key === "Enter" && active >= 0) {
          e.preventDefault();
          pick(list[active]);
        } else if (e.key === "Escape") setOpen(false);
      }}
    >
      {open && list.length ? (
        <ul className="co-suggest" role="listbox">
          {list.map((c, i) => (
            <li key={c.id}>
              <button type="button" role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
                {c.name}
                {c.postcode ? ` (${c.postcode})` : ""}
                {c.region ? <span className="co-office-addr">{c.region}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Field>
  );
}

export default function CheckoutForm(p: CheckoutProps) {
  const T = p.texts;
  const money = useCallback((cents: number) => formatMoney(cents, p.moneyFormat), [p.moneyFormat]);

  const [quote, setQuote] = useState<Quote>(p.quote);
  const [email, setEmail] = useState(p.prefill.email);
  const [phone, setPhone] = useState(p.prefill.phone);
  const [marketing, setMarketing] = useState(p.prefill.accepts_marketing);
  const [firstName, setFirstName] = useState(p.prefill.first_name);
  const [lastName, setLastName] = useState(p.prefill.last_name);
  const [method, setMethod] = useState<string>("");
  const [office, setOffice] = useState<Office | null>(null);
  const [city, setCity] = useState("");
  const [cityId, setCityId] = useState<string | undefined>();
  const [postcode, setPostcode] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [payment, setPayment] = useState<string>(p.quote.payments[0]?.code || "");
  const [note, setNote] = useState("");
  const [terms, setTerms] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const idempotency = useRef<string>("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    idempotency.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  }, []);

  const apiQuery = `?locale=${encodeURIComponent(p.marketPath)}`;
  const requote = useCallback(
    async (input: { method: string; payment: string; discount_code: string }) => {
      const r = await fetch(`/api/checkout/${p.token}/quote${apiQuery}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, email }) });
      if (!r.ok) return null;
      const q = (await r.json()) as Quote;
      setQuote(q);
      return q;
    },
    [p.token, apiQuery, email],
  );

  // prices follow the chosen method, payment and code (the e-mail goes with the order itself)
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/checkout/${p.token}/quote${apiQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, payment, discount_code: discountCode }),
      signal: ctl.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<Quote>) : null))
      .then((q) => {
        if (q) setQuote(q);
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, [p.token, apiQuery, method, payment, discountCode]);

  const selected = quote.methods.find((m) => m.code === method) || null;
  const isPickup = selected ? selected.kind === "office" || selected.kind === "locker" : false;

  const applyDiscount = async () => {
    const code = discountInput.trim();
    if (!code) return;
    const q = await requote({ method, payment, discount_code: code });
    if (q?.discount?.error) {
      setDiscountError(q.discount.error);
      setDiscountCode("");
      void requote({ method, payment, discount_code: "" });
    } else if (q?.discount) {
      setDiscountError("");
      setDiscountCode(q.discount.code);
      setDiscountInput("");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError("");
    try {
      const body = {
        email,
        phone,
        first_name: firstName,
        last_name: lastName,
        method,
        office: isPickup ? office : null,
        address: isPickup ? null : { city, cityId, postcode, address1, address2 },
        payment,
        discount_code: discountCode,
        note,
        accepts_marketing: marketing,
        terms,
        idempotency: idempotency.current,
      };
      const r = await fetch(`/api/checkout/${p.token}/complete${apiQuery}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; url?: string; errors?: Errors };
      if (d.ok && d.url) {
        window.location.assign(d.url);
        return;
      }
      if (r.status === 404) {
        window.location.assign(p.links.cart);
        return;
      }
      const errs = d.errors || { form: T.generic_error };
      setErrors(errs);
      const lineErrors = Object.entries(errs).filter(([k]) => k.startsWith("line_")).map(([, v]) => v);
      setFormError([errs.form, ...lineErrors].filter(Boolean).join(" ") || T.errors_title);
      if (errs.discount_code) {
        setDiscountError(errs.discount_code);
        setDiscountCode("");
      }
      void requote({ method, payment, discount_code: errs.discount_code ? "" : discountCode });
      requestAnimationFrame(() => {
        const first = formRef.current?.querySelector<HTMLElement>("[aria-invalid='true'], .co-alert");
        first?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (first instanceof HTMLInputElement) first.focus({ preventScroll: true });
      });
      setBusy(false);
    } catch {
      setFormError(T.generic_error);
      setBusy(false);
    }
  };

  const discountAmount = quote.discount && !quote.discount.error ? quote.discount.amount : 0;
  const freeHint = useMemo(() => {
    if (p.freeThreshold === null || !quote.methods.length) return null;
    const left = p.freeThreshold - (quote.subtotal - discountAmount);
    return left > 0 ? fill(T.free_left, { amount: money(left) }) : T.free_ok;
  }, [p.freeThreshold, quote.subtotal, quote.methods.length, discountAmount, T, money]);

  const summary = (
    <>
      <ul className="co-lines">
        {quote.lines.map((l) => (
          <li className="co-line" key={l.key}>
            <span className="co-thumb">
              {l.image_url ? <img src={l.image_url} alt="" loading="lazy" /> : null}
              <span className="co-qty">{l.quantity}</span>
            </span>
            <span className="co-line-text">
              <span className="co-line-title">{l.title}</span>
              {l.variant_title ? <span className="co-line-variant">{l.variant_title}</span> : null}
            </span>
            <span className="co-line-price">
              {l.compare_at_price && l.compare_at_price > l.price ? <s>{money(l.compare_at_price * l.quantity)}</s> : null}
              {money(l.line_price)}
            </span>
          </li>
        ))}
      </ul>
      <div className="co-discount">
        <Field
          id="discount"
          label={T.discount_placeholder}
          value={discountInput}
          onChange={setDiscountInput}
          autoComplete="off"
          onKeyDown={(e) => {
            // Enter applies the code instead of sending the order
            if (e.key === "Enter") {
              e.preventDefault();
              void applyDiscount();
            }
          }}
        />
        <button type="button" className="co-btn co-btn--ghost" onClick={applyDiscount}>
          {T.apply}
        </button>
      </div>
      {discountError ? <p className="co-error">{discountError}</p> : null}
      {discountCode ? (
        <span className="co-chip">
          {discountCode}
          <button type="button" aria-label={`${T.remove} ${discountCode}`} onClick={() => setDiscountCode("")}>
            ×
          </button>
        </span>
      ) : null}
      <div className="co-totals">
        <dl>
          <div className="co-tr">
            <dt>{T.subtotal}</dt>
            <dd>{money(quote.subtotal)}</dd>
          </div>
          {discountAmount ? (
            <div className="co-tr co-tr--discount">
              <dt>
                {T.discount} ({quote.discount!.code})
              </dt>
              <dd>−{money(discountAmount)}</dd>
            </div>
          ) : null}
          <div className="co-tr">
            <dt>{T.shipping}</dt>
            <dd>{quote.method ? (quote.shipping ? money(quote.shipping) : T.free) : T.shipping_choose}</dd>
          </div>
          {quote.cod_fee ? (
            <div className="co-tr">
              <dt>{T.cod_fee}</dt>
              <dd>{money(quote.cod_fee)}</dd>
            </div>
          ) : null}
          <div className="co-tr co-tr--total">
            <dt>{T.total}</dt>
            <dd>
              <small>{p.currency}</small>
              {money(quote.total)}
            </dd>
          </div>
        </dl>
        <p className="co-vat">{fill(T.vat, { amount: money(quote.tax) })}</p>
        {freeHint ? <p className="co-free">{freeHint}</p> : null}
      </div>
    </>
  );

  const logo = p.logo ? (
    <a className="co-logo" href={p.links.home}>
      <img src={p.logo} alt={p.shopName} />
    </a>
  ) : (
    <a className="co-logo co-logo-text" href={p.links.home}>
      {p.shopName}
    </a>
  );

  return (
    <div className="co">
      <a className="co-skip" href="#co-form">
        {T.information}
      </a>
      <header className="co-head-mobile">{logo}</header>
      <aside className="co-side" aria-label={T.summary}>
        <button type="button" className="co-summary-toggle" aria-expanded={summaryOpen} aria-controls="co-side-body" onClick={() => setSummaryOpen((o) => !o)}>
          <span>{summaryOpen ? T.hide_summary : T.show_summary}</span>
          <strong>{money(quote.total)}</strong>
        </button>
        <div className="co-inner">
          <div id="co-side-body" className="co-side-body" style={{ display: summaryOpen ? "block" : "none" }}>
            {summary}
          </div>
        </div>
      </aside>
      <main className="co-main">
        <div className="co-inner">
          <div className="co-head-desktop">{logo}</div>
          <ol className="co-crumbs">
            <li>
              <a href={p.links.cart}>{T.cart}</a>
            </li>
            <li aria-hidden="true">›</li>
            <li aria-current="step">{T.information}</li>
          </ol>
          <form id="co-form" ref={formRef} onSubmit={submit} noValidate>
            {formError ? (
              <div className="co-alert" role="alert">
                {formError}
              </div>
            ) : null}

            <section className="co-section" aria-labelledby="co-contact">
              <h2 id="co-contact">{T.contact}</h2>
              <div className="co-row">
                <Field id="email" label={T.email} type="email" autoComplete="email" inputMode="email" value={email} onChange={setEmail} error={errors.email} required />
              </div>
              <div className="co-row">
                <Field id="phone" label={T.phone} type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={setPhone} error={errors.phone} required />
              </div>
              <label className="co-check">
                <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
                <span>{T.newsletter}</span>
              </label>
            </section>

            <section className="co-section" aria-labelledby="co-delivery">
              <h2 id="co-delivery">{T.delivery}</h2>
              <div className="co-row co-row--2">
                <Field id="first_name" label={T.first_name} autoComplete="given-name" value={firstName} onChange={setFirstName} error={errors.first_name} required />
                <Field id="last_name" label={T.last_name} autoComplete="family-name" value={lastName} onChange={setLastName} error={errors.last_name} required />
              </div>
              <div className="co-options" role="radiogroup" aria-label={T.delivery} aria-invalid={errors.method ? true : undefined}>
                {quote.methods.map((m) => {
                  const on = m.code === method;
                  const pickup = m.kind === "office" || m.kind === "locker";
                  return (
                    <div className={`co-option${on ? " co-option--on" : ""}`} key={m.code}>
                      <label>
                        <input
                          type="radio"
                          name="method"
                          value={m.code}
                          checked={on}
                          onChange={() => {
                            setMethod(m.code);
                            setOffice(null);
                          }}
                        />
                        <span className="co-option-text">
                          <span className="co-option-title">{m.title}</span>
                          {m.description ? <span className="co-option-desc">{m.description}</span> : null}
                        </span>
                        <span className="co-option-price">{m.price ? money(m.price) : T.free}</span>
                      </label>
                      {on ? (
                        <div className="co-option-body">
                          {pickup ? (
                            <OfficePicker method={m} texts={T} value={office} onChange={setOffice} error={errors.office} />
                          ) : (
                            <div style={{ paddingTop: 12 }}>
                              <div className="co-row co-row--zip">
                                <CityField
                                  texts={T}
                                  value={city}
                                  suggest={p.country === "BG"}
                                  onChange={(v) => {
                                    setCity(v);
                                    setCityId(undefined);
                                  }}
                                  onPick={(c) => {
                                    setCity(c.name);
                                    setCityId(c.id);
                                    if (c.postcode) setPostcode(c.postcode);
                                  }}
                                  error={errors.city}
                                />
                                <Field id="postcode" label={T.postcode} autoComplete="postal-code" inputMode="numeric" value={postcode} onChange={setPostcode} error={errors.postcode} />
                              </div>
                              <div className="co-row">
                                <Field id="address1" label={T.address1} autoComplete="address-line1" value={address1} onChange={setAddress1} error={errors.address1} />
                              </div>
                              <div className="co-row">
                                <Field id="address2" label={T.address2} autoComplete="address-line2" value={address2} onChange={setAddress2} />
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {errors.method ? <p className="co-error">{errors.method}</p> : null}
            </section>

            <section className="co-section" aria-labelledby="co-payment">
              <h2 id="co-payment">{T.payment}</h2>
              <div className="co-options" role="radiogroup" aria-label={T.payment}>
                {quote.payments.map((pm) => (
                  <div className={`co-option${pm.code === payment ? " co-option--on" : ""}`} key={pm.code}>
                    <label>
                      <input type="radio" name="payment" value={pm.code} checked={pm.code === payment} onChange={() => setPayment(pm.code)} />
                      <span className="co-option-text">
                        <span className="co-option-title">{pm.title}</span>
                        <span className="co-option-desc">{pm.description}</span>
                      </span>
                    </label>
                  </div>
                ))}
              </div>
              {errors.payment ? <p className="co-error">{errors.payment}</p> : null}
            </section>

            <section className="co-section">
              <div className="co-row">
                <Field id="note" label={T.note} value={note} onChange={setNote} textarea />
              </div>
              <label className="co-check">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} aria-invalid={errors.terms ? true : undefined} />
                <span dangerouslySetInnerHTML={{ __html: fill(T.terms_html, { terms: p.links.terms, privacy: p.links.privacy }) }} />
              </label>
              {errors.terms ? <p className="co-error">{errors.terms}</p> : null}
            </section>

            <div className="co-actions">
              <button type="submit" className="co-btn co-btn--block" disabled={busy}>
                {busy ? <span className="co-spinner" aria-hidden="true" /> : null}
                {busy ? T.submitting : T.submit}
              </button>
              <a href={p.links.cart}>‹ {T.back}</a>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
