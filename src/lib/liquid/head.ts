// content_for_header and the markup Shopify appends before </body> (theme custom CSS, app embeds).
import { getSetting } from "../db";
import { settingsData } from "./theme";
import type { PageEnv } from "./render";
import { reviewsHeadHtml } from "../reviews-render";
import { languageSwitcherHtml } from "./switcher";

function js(v: unknown) {
  return JSON.stringify(v).replace(/</g, "\\u003c").replace(/\//g, "\\/");
}

export interface HeadSettings {
  google_site_verification: string;
  facebook_domain_verification: string;
  klaviyo_company_id: string;
  extra_head_html: string;
}

export const DEFAULT_HEAD: HeadSettings = {
  google_site_verification: "qIyMPjmh5VKQsq2D7f49gC7bAxhh58LqSYsX8jjigXs",
  facebook_domain_verification: "iwp2hjmmaeunuosvnogsw06h56mywr",
  klaviyo_company_id: "WLRnXA",
  extra_head_html: "",
};

export function contentForHeader(env: PageEnv): string {
  const s = env.s;
  const head = { ...DEFAULT_HEAD, ...getSetting<Partial<HeadSettings>>("head", {}) };
  const parts: string[] = [];
  if (head.google_site_verification) parts.push(`<meta name="google-site-verification" content="${head.google_site_verification}">`);
  if (head.facebook_domain_verification) parts.push(`<meta name="facebook-domain-verification" content="${head.facebook_domain_verification}">`);

  // hreflang alternates for every market, like Shopify Markets
  const pathNoPrefix = s.path === "/" ? "" : s.path;
  const markets = s.catalog.markets.filter((m) => m.enabled);
  const primary = markets.find((m) => m.primary) || markets[0];
  if (primary && s.pageType !== "404" && !s.path.startsWith("/account") && !s.path.startsWith("/cart") && !s.path.startsWith("/search")) {
    parts.push(`<link rel="alternate" hreflang="x-default" href="${s.origin}/${primary.path}${pathNoPrefix}">`);
    for (const m of markets) {
      const code = m.primary ? m.language : `${m.language}-${m.country}`;
      parts.push(`<link rel="alternate" hreflang="${code}" href="${s.origin}/${m.path}${pathNoPrefix}">`);
    }
  }

  const theme = { name: "pamaura/main/25.02", id: s.themeId, schema_name: "Combine", schema_version: "2.4.2.1", theme_store_id: null, role: "main" };
  // read by the theme (section-header.js) to enable predictive search
  parts.push(`<script id="shopify-features" type="application/json">${js({ betas: [], domain: s.catalog.shop.domain, predictiveSearch: true, locale: s.locale })}</script>`);
  parts.push(`<script>
var Shopify = Shopify || {};
Shopify.shop = ${js(s.catalog.shop.domain)};
Shopify.locale = ${js(s.locale)};
Shopify.currency = ${js({ active: s.market.currency, rate: String(s.market.rate === 1 ? "1.0" : s.market.rate) })};
Shopify.country = ${js(s.market.country)};
Shopify.theme = ${js(theme)};
Shopify.cdnHost = ${js(`${s.host}/cdn`)};
Shopify.routes = Shopify.routes || {};
Shopify.routes.root = ${js(`/${s.market.path}/`)};
</script>`);
  // Shopify.loadFeatures + Customer Privacy API used by the theme's cookie banner
  parts.push(`<script>
(function(){
  var S = window.Shopify = window.Shopify || {};
  function readConsent(){ var m = document.cookie.match(/(?:^|; )_tracking_consent=([^;]*)/); try { return m ? JSON.parse(decodeURIComponent(m[1])) : null; } catch(e){ return null; } }
  S.customerPrivacy = S.customerPrivacy || {
    setTrackingConsent: function(consent, cb){
      var v = { analytics: !!consent.analytics, marketing: !!consent.marketing, preferences: !!consent.preferences, sale_of_data: !!consent.sale_of_data, at: Date.now() };
      document.cookie = "_tracking_consent=" + encodeURIComponent(JSON.stringify(v)) + "; path=/; max-age=31536000; SameSite=Lax";
      try { fetch("/api/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v), keepalive: true }); } catch(e) {}
      document.dispatchEvent(new CustomEvent("visitorConsentCollected", { detail: v }));
      if (cb) cb();
    },
    getTrackingConsent: function(){ var c = readConsent(); return c ? (c.analytics && c.marketing ? "yes" : "no") : "no_interaction"; },
    currentVisitorConsent: function(){ var c = readConsent() || {}; return { analytics: c.analytics ? "yes" : (c.at ? "no" : ""), marketing: c.marketing ? "yes" : (c.at ? "no" : ""), preferences: c.preferences ? "yes" : (c.at ? "no" : ""), sale_of_data: "" }; },
    userCanBeTracked: function(){ var c = readConsent(); return !!(c && c.analytics); },
    analyticsProcessingAllowed: function(){ var c = readConsent(); return !!(c && c.analytics); },
    marketingAllowed: function(){ var c = readConsent(); return !!(c && c.marketing); },
    preferencesProcessingAllowed: function(){ var c = readConsent(); return !!(c && c.preferences); },
    shouldShowBanner: function(){ return !readConsent(); }
  };
  S.loadFeatures = S.loadFeatures || function(features, cb){ if (cb) setTimeout(function(){ cb(); }, 0); };
})();
</script>`);
  if (head.klaviyo_company_id) {
    parts.push(
      `<script async src="https://static.klaviyo.com/onsite/js/${head.klaviyo_company_id}/klaviyo.js?company_id=${head.klaviyo_company_id}"></script>` +
        `<script>!function(){if(!window.klaviyo){window._klOnsite=window._klOnsite||[];try{window.klaviyo=new Proxy({},{get:function(n,i){return"push"===i?function(){var n;(n=window._klOnsite).push.apply(n,arguments)}:function(){for(var n=arguments.length,o=new Array(n),w=0;w<n;w++)o[w]=arguments[w];var t="function"==typeof o[o.length-1]?o.pop():void 0,e=new Promise((function(n){window._klOnsite.push([i].concat(o,[function(i){t&&t(i),n(i)}]))}));return e}}})}catch(n){window.klaviyo=window.klaviyo||[],window.klaviyo.push=function(){var n;(n=window._klOnsite).push.apply(n,arguments)}}}}();</script>`,
    );
  }
  parts.push(reviewsHeadHtml(env));
  if (head.extra_head_html) parts.push(head.extra_head_html);
  return parts.filter(Boolean).join("\n");
}

/** Shopify places the theme's custom CSS (theme settings → Custom CSS) at the end of <body>. */
export function bodyEndHtml(env: PageEnv): string {
  const css = settingsData().customCss;
  const out: string[] = [];
  if (css.length) out.push(`<style> ${css.join(" ")} </style>`);
  out.push(languageSwitcherHtml(env));
  return out.join("\n");
}
