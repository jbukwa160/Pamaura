// Header language switcher (replaces the Translation Lab app embed): a flag + language code in
// `.localization-form__header`, a dropdown of the shop's languages, submitting /localization.
import { escapeHtml } from "./filters";
import type { PageEnv } from "./render";
import { SWITCHER_CSS } from "./switcher-css";
import { returnTo } from "./state";

const FLAGS: Record<string, string> = {
  bg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><g fill-rule="evenodd" stroke-width="1pt"><path fill="#d62612" d="M0 320h640v160H0z"/><path fill="#fff" d="M0 0h640v160H0z"/><path fill="#00966e" d="M0 160h640v160H0z"/></g></svg>',
  ro: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><g fill-rule="evenodd" stroke-width="1pt"><path fill="#00319c" d="M0 0h213.3v480H0z"/><path fill="#ffde00" d="M213.3 0h213.4v480H213.3z"/><path fill="#de2110" d="M426.7 0H640v480H426.7z"/></g></svg>',
};

export function flagSvg(code: string): string | null {
  return FLAGS[code] ?? null;
}

function flag(env: PageEnv, lang: string, alt: string) {
  return `<img class="tl-flag" loading="lazy" width="20" height="18" alt="${escapeHtml(alt)}" src="//${env.s.host}/cdn/shopifycloud/assets/flags/${lang}.svg">`;
}

export function languageSwitcherHtml(env: PageEnv): string {
  const s = env.s;
  const markets = s.catalog.markets.filter((m) => m.enabled);
  if (markets.length < 2) return "";
  const cur = s.market;
  const action = `/${cur.path}/localization`;
  const options = markets
    .map(
      (m) =>
        `<li class="tl-option ${m.language === cur.language ? "active" : ""}" role="option" tabindex="-1" aria-selected="${m.language === cur.language}" data-value="${m.language}">${flag(env, m.language, `Language dropdown option country flag for ${m.language_name}`)}<span class="tl-label tl-name">${escapeHtml(m.language_name)}</span></li>`,
    )
    .join("");
  const template = `<div class="tl-switcher-container hidden "><div class="tl-switcher tl-language"><form method="post" action="${action}" accept-charset="UTF-8" class="shopify-localization-form" enctype="multipart/form-data"><input type="hidden" name="form_type" value="localization" /><input type="hidden" name="utf8" value="✓" /><input type="hidden" name="_method" value="put" /><input type="hidden" name="return_to" value="${escapeHtml(returnTo(s))}" /><div class="tl-select" role="button" tabindex="0" aria-haspopup="listbox" aria-expanded="false">${flag(env, cur.language, `Language switcher country flag for ${cur.language_name}`)}<span class="tl-label tl-code">${cur.language}</span></div><ul class="tl-options " role="listbox" aria-label="Language">${options}</ul><input type="hidden" name="country_code" value="${cur.country}"><input type="hidden" name="language_code" value="${cur.language}"></form></div></div>`;
  return `<style>${SWITCHER_CSS}</style>
<script type="text/template" id="tl-switcher-template">${template}</script>
<script>
(function(){
  function init(){
    var tpl = document.getElementById('tl-switcher-template');
    if (!tpl) return;
    document.querySelectorAll('.localization-form__header').forEach(function(ref){
      if (ref.querySelector('.tl-switcher-container')) return;
      var wrap = document.createElement('div');
      wrap.innerHTML = tpl.innerHTML.trim();
      var box = wrap.firstElementChild;
      box.classList.remove('hidden');
      box.classList.add('desktop');
      ref.insertBefore(box, ref.firstChild);
      var select = box.querySelector('.tl-select'), list = box.querySelector('.tl-options'), form = box.querySelector('form');
      function toggle(open){ var o = open === undefined ? !list.classList.contains('open') : open; list.classList.toggle('open', o); select.classList.toggle('open', o); select.setAttribute('aria-expanded', String(o)); }
      select.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); toggle(); });
      select.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } if (e.key === 'Escape') toggle(false); });
      box.querySelectorAll('.tl-option').forEach(function(opt){
        function choose(){ if (opt.classList.contains('active')) { toggle(false); return; } form.querySelector('[name=language_code]').value = opt.getAttribute('data-value'); form.querySelector('[name=country_code]').value = ''; form.submit(); }
        opt.addEventListener('click', choose);
        opt.addEventListener('keydown', function(e){ if (e.key === 'Enter') choose(); });
      });
      document.addEventListener('click', function(e){ if (!box.contains(e.target)) toggle(false); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
</script>`;
}
