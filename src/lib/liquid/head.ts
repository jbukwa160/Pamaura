// content_for_header and the markup Shopify appends before </body> (theme custom CSS, app embeds).
import { getSetting } from "../db";
import { settingsData } from "./theme";
import type { PageEnv } from "./render";
import { reviewsHeadHtml } from "../reviews-render";
import { languageSwitcherHtml } from "./switcher";
import { ProductDrop } from "./drops/catalog";
import { encodeFileName } from "./drops/base";
import { formatMoney } from "../money";

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
  if (head.klaviyo_company_id) parts.push(klaviyoViewedProduct(env));
  parts.push(reviewsHeadHtml(env));
  if (head.extra_head_html) parts.push(head.extra_head_html);
  return parts.filter(Boolean).join("\n");
}

/** Rating as Shopify / Judge.me print it: "5.0", "4.88". */
function ratingText(v: number): string {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

/**
 * Klaviyo's "Viewed Product" tracking on product pages, as the Klaviyo app embed prints it on the live
 * store. Besides the tracking, it defines the global `item` that the theme's add-to-cart handler reads
 * (section-main-product.js: `upsellPopup.variantTitle = item.variant_title`) before opening the upsell popup.
 */
function klaviyoViewedProduct(env: PageEnv): string {
  const s = env.s;
  const product = env.globals.product;
  if (s.pageType !== "product" || !(product instanceof ProductDrop)) return "";
  const str = (v: unknown) => JSON.stringify(String(v ?? "")).replace(/</g, "\\u003c");
  const money = (cents: number) => formatMoney(cents, s.market.money_format);
  const amount = (cents: number) => formatMoney(cents, s.market.money_format.replace(/^[^{]*(\{\{[^}]*\}\})[\s\S]*$/, "$1"));
  const mf = (ns: string, key: string) => s.catalog.metafields.get(`product:${product.id}`)?.find((m) => m.namespace === ns && m.key === key)?.value ?? null;
  let reviews = "null";
  const rating = mf("reviews", "rating");
  const count = mf("reviews", "rating_count");
  if (rating && count) {
    const r = JSON.parse(rating) as { value: string; scale_min: string; scale_max: string };
    reviews = JSON.stringify({ rating: { scale_min: r.scale_min, scale_max: r.scale_max, value: ratingText(Number(r.value)) }, rating_count: Number(count) });
  }
  const looxRating = mf("loox", "avg_rating");
  const looxCount = mf("loox", "num_reviews");
  const categories = (product.collections as { title: string }[])
    .filter(Boolean)
    .map((c) => c.title)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const img = product.featured_image;
  let imageUrl = "";
  if (img) {
    const plain = String(img.r.name);
    const dot = plain.lastIndexOf(".");
    imageUrl = `${s.origin}/cdn/shop/${img.r.folder}/${encodeFileName(dot > 0 ? `${plain.slice(0, dot)}_grande${plain.slice(dot)}` : plain)}${img.r.version ? `?v=${img.r.version}` : ""}`;
  }
  return `<script id="viewed_product">
      if (item == null) {
        var _learnq = _learnq || [];

        var MetafieldReviews = null
        var MetafieldYotpoRating = null
        var MetafieldYotpoCount = null
        var MetafieldLooxRating = null
        var MetafieldLooxCount = null
        var okendoProduct = null
        var okendoProductReviewCount = null
        var okendoProductReviewAverageValue = null
        try {
          // The following fields are used for Customer Hub recently viewed in order to add reviews.
          // This information is not part of __kla_viewed. Instead, it is part of __kla_viewed_reviewed_items
          MetafieldReviews = ${reviews};
          MetafieldYotpoRating = null
          MetafieldYotpoCount = null
          MetafieldLooxRating = ${looxRating === null ? "null" : str(looxRating)}
          MetafieldLooxCount = ${looxCount === null ? "null" : Number(looxCount)}

          okendoProduct = null
          // If the okendo metafield is not legacy, it will error, which then requires the new json formatted data
          if (okendoProduct && 'error' in okendoProduct) {
            okendoProduct = null
          }
          okendoProductReviewCount = okendoProduct ? okendoProduct.reviewCount : null
          okendoProductReviewAverageValue = okendoProduct ? okendoProduct.reviewAverageValue : null
        } catch (error) {
          console.error('Error in Klaviyo onsite reviews tracking:', error);
        }

        var item = {
          Name: ${str(product.title)},
          ProductID: ${product.id},
          Categories: [${categories.map(str).join(",")}],
          ImageURL: ${str(imageUrl)},
          URL: ${str(s.origin + product.url)},
          Brand: ${str(product.vendor)},
          Price: ${str(money(product.price))},
          Value: ${str(amount(product.price))},
          CompareAtPrice: ${str(money(product.compare_at_price_max || 0))}
        };
        _learnq.push(['track', 'Viewed Product', item]);
        _learnq.push(['trackViewedItem', {
          Title: item.Name,
          ItemId: item.ProductID,
          Categories: item.Categories,
          ImageUrl: item.ImageURL,
          Url: item.URL,
          Metadata: {
            Brand: item.Brand,
            Price: item.Price,
            Value: item.Value,
            CompareAtPrice: item.CompareAtPrice
          },
          metafields:{
            reviews: MetafieldReviews,
            yotpo:{
              rating: MetafieldYotpoRating,
              count: MetafieldYotpoCount,
            },
            loox:{
              rating: MetafieldLooxRating,
              count: MetafieldLooxCount,
            },
            okendo: {
              rating: okendoProductReviewAverageValue,
              count: okendoProductReviewCount,
            }
          }
        }]);
      }
    </script>`;
}

/** Shopify places the theme's custom CSS (theme settings → Custom CSS) at the end of <body>. */
export function bodyEndHtml(env: PageEnv): string {
  const css = settingsData().customCss;
  const out: string[] = [];
  if (css.length) out.push(`<style> ${css.join(" ")} </style>`);
  out.push(languageSwitcherHtml(env));
  return out.join("\n");
}
