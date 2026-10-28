// Replacement for Shopify's shopify_common.js (used by the customer addresses page).
export const SHOPIFY_COMMON_JS = `(function(){
var Shopify = window.Shopify = window.Shopify || {};
Shopify.bind = function(fn, scope){ return function(){ return fn.apply(scope, arguments); }; };
Shopify.setSelectorByValue = function(selector, value){
  for (var i = 0; i < selector.options.length; i++) {
    var option = selector.options[i];
    if (value == option.value || value == option.innerHTML) { selector.selectedIndex = i; return i; }
  }
};
Shopify.addListener = function(target, eventName, callback){ target.addEventListener(eventName, callback, false); };
Shopify.postLink = function(path, options){
  options = options || {};
  var method = options.method || 'post';
  var params = options.parameters || {};
  var form = document.createElement('form');
  form.setAttribute('method', method);
  form.setAttribute('action', path);
  for (var key in params) {
    var field = document.createElement('input');
    field.setAttribute('type', 'hidden');
    field.setAttribute('name', key);
    field.setAttribute('value', params[key]);
    form.appendChild(field);
  }
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
};
Shopify.CountryProvinceSelector = function(country_domid, province_domid, options){
  this.countryEl = document.getElementById(country_domid);
  this.provinceEl = document.getElementById(province_domid);
  this.provinceContainer = document.getElementById((options && options.hideElement) || province_domid);
  if (!this.countryEl) return;
  Shopify.addListener(this.countryEl, 'change', Shopify.bind(this.countryHandler, this));
  this.initCountry();
  this.initProvince();
};
Shopify.CountryProvinceSelector.prototype = {
  initCountry: function(){ var value = this.countryEl.getAttribute('data-default'); Shopify.setSelectorByValue(this.countryEl, value); this.countryHandler(); },
  initProvince: function(){ if (!this.provinceEl) return; var value = this.provinceEl.getAttribute('data-default'); if (value && this.provinceEl.options.length > 0) Shopify.setSelectorByValue(this.provinceEl, value); },
  countryHandler: function(){
    if (!this.provinceEl) return;
    var opt = this.countryEl.options[this.countryEl.selectedIndex];
    var raw = opt ? opt.getAttribute('data-provinces') : '[]';
    var provinces = [];
    try { provinces = JSON.parse(raw || '[]'); } catch (e) {}
    this.clearOptions(this.provinceEl);
    if (provinces && provinces.length === 0) { if (this.provinceContainer) this.provinceContainer.style.display = 'none'; }
    else {
      for (var i = 0; i < provinces.length; i++) { var o = document.createElement('option'); o.value = provinces[i][0]; o.innerHTML = provinces[i][1]; this.provinceEl.appendChild(o); }
      if (this.provinceContainer) this.provinceContainer.style.display = '';
    }
  },
  clearOptions: function(selector){ while (selector.firstChild) selector.removeChild(selector.firstChild); }
};
Shopify.CustomerAddress = {
  toggleForm: function(id){ var el = document.getElementById('edit_address_' + id); if (el) el.style.display = el.style.display == 'none' ? '' : 'none'; return false; },
  toggleNewForm: function(){ var el = document.getElementById('add_address'); if (el) el.style.display = el.style.display == 'none' ? '' : 'none'; return false; },
  destroy: function(id, confirm_msg){
    if (confirm(confirm_msg || 'Are you sure you wish to delete this address?')) {
      var root = (Shopify.routes && Shopify.routes.root) || '/';
      Shopify.postLink(root.replace(/\\/$/, '') + '/account/addresses/' + id, { parameters: { _method: 'delete' } });
    }
  }
};
})();`;
