// Replacements for the Shopify apps the theme embeds as app blocks / app embeds.
// Judge.me → our own reviews; Klaviyo and Instafeed keep their public scripts; the rest
// (Dealeasy, Essential Countdown, izprati.bg, T-Lab) is replaced by this backend.
import { convertSetting, type BlockDrop, type Env } from "./settings";
import { reviewBadgeHtml, reviewWidgetHtml, shopRatingHtml } from "../reviews-render";
import { ProductDrop } from "./drops/catalog";

function appKey(type: string): string {
  const m = type.match(/^shopify:\/\/apps\/([^/]+)\/blocks\/([^/]+)/);
  return m ? `${m[1]}/${m[2]}` : type;
}

function blockDomId(env: Env, block: BlockDrop) {
  // Shopify: shopify-block-<app hash>__<block key>
  return `shopify-block-A${Buffer.from(block.sectionId).toString("base64url").slice(0, 16)}__${block.key}`;
}

export function renderAppBlock(env: Env, block: BlockDrop): string {
  const key = appKey(block.appType);
  const product = env.globals.product instanceof ProductDrop ? (env.globals.product as ProductDrop) : null;
  let inner = "";
  switch (key) {
    case "judge-me-reviews/preview_badge":
      inner = product ? reviewBadgeHtml(env, product) : "";
      break;
    case "judge-me-reviews/review_widget":
      inner = product ? reviewWidgetHtml(env, product) : "";
      break;
    case "judge-me-reviews/medals":
    case "judge-me-reviews/all_reviews_counter":
      inner = shopRatingHtml(env);
      break;
    case "instafeed/app-block":
      inner = instafeedHtml(env, block);
      break;
    case "klaviyo-email-marketing-sms/form-embed-block": {
      const formId = String((block.data.settings || {}).formId ?? (block.data.settings || {}).form_id ?? "");
      inner = `<div class="klaviyo-form-${formId}"></div>`;
      break;
    }
    default:
      inner = "";
  }
  return `<div id="${blockDomId(env, block)}" class="shopify-block shopify-app-block">${inner}</div>`;
}

function instafeedHtml(env: Env, block: BlockDrop) {
  // the block's title setting, translated like other theme texts (per block on the live store)
  const raw = String((block.data.settings || {}).title ?? "");
  const fallback = env.s.locale === "ro" ? "Urmărește-ne" : "Последвайте ни";
  const title = raw ? String(convertSetting(env, { type: "text", id: "title" }, raw, {}, `${block.sectionId}.blocks.${block.key}.title`)) : fallback;
  const src = process.env.INSTAFEED_SCRIPT || "https://cdn.nfcube.com/instafeed-69f2271ec63086b05e36ba9aca21979e.js";
  return `
  <style>
    div[id*="instafeed_app_block"] { width: 100%; }
    div.shopify-section:has(> [id*="instafeed_app_block"]) { width: 100%; }
    body #insta-feed { margin-bottom: 0px!important; }
    body #insta-feed h2 { text-align: center; }
  </style>
  <div id="insta-feed"></div>
  <script>
    if (typeof instafeedLocalTitle === 'undefined') var instafeedLocalTitle = ${JSON.stringify(title)};
  </script>
  <!-- BEGIN app snippet: storefront-script --><script>
    var instafeedScriptSrc = ${JSON.stringify(src).replace(/\//g, "\\/")};
    !function(e){if(!window.instafeedStorefrontScheduled&&(window.instafeedStorefrontScheduled=!0,e)){function r(e){return String(e).split("?")[0]}function a(){if(!function(){for(var n=document.getElementsByTagName("script"),t=r(e),o=0;o!==n.length;o++)if(r(n[o].src)===t)return!0;return!1}()){var n=document.createElement("script");n.async=!0,n.src=e,document.body.appendChild(n)}}"loading"===document.readyState?document.addEventListener("DOMContentLoaded",a):a()}}(instafeedScriptSrc);
  </script>
<!-- END app snippet -->
`;
}
