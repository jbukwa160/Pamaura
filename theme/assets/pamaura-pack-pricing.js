/*
  Pamaura — pack pricing in the cart
  ----------------------------------
  Packs on this store are plain variants ("1 БРОЙ" / "2 БРОЯ" / "3 БРОЯ"), so anything that
  adds a product outside the PDP variant picker lands on "1 БРОЙ" and the price is simply
  multiplied. This rewrites the cart after every mutation so the customer always ends up on
  the cheapest combination of pack variants for the number of units they want.

  e.g. Cocoa Glow: 2 × "1 БРОЙ" (39,98) becomes 1 × "2 БРОЯ" (37,38).

  Picks the combination by exact cost, never by pack size — if a pack happens to be priced
  above the singles it buys (Coconut Scrub 2 БРОЯ is 17,99 vs 2 × 8,99 = 17,98), the cart is
  left alone rather than made more expensive.

  Hooks window.fetch and repacks BEFORE the original promise resolves, so the theme's own
  re-render already paints the corrected prices — no flicker, no double render.
*/
(function () {
  if (window.__pamauraPackPricing) return;
  window.__pamauraPackPricing = true;

  // Only products whose single option is named one of these are treated as packs.
  // Add a name here if you ever rename the option on new products.
  var PACK_OPTION_NAMES = ['брой', 'броя', 'count', 'pack', 'quantity'];
  var MAX_UNITS = 60; // safety cap for the cost search

  var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  var nativeFetch = window.fetch.bind(window);
  var productCache = {};
  var busy = false;

  function url(path) {
    return root.replace(/\/$/, '') + path;
  }

  function isCartMutation(input) {
    var u = typeof input === 'string' ? input : (input && input.url) || '';
    return /\/cart\/(add|change|update)(\.js)?(\?|$)/.test(u);
  }

  // "2 БРОЯ" -> 2 ; anything without a leading integer -> null
  function packSize(value) {
    var m = String(value || '').trim().match(/^(\d+)\s*\D/);
    return m ? parseInt(m[1], 10) : null;
  }

  // Returns [{ size, id, price }, ...] sorted by size desc, or null if not a pack product.
  function getPacks(handle) {
    if (Object.prototype.hasOwnProperty.call(productCache, handle)) {
      return Promise.resolve(productCache[handle]);
    }
    return nativeFetch(url('/products/' + handle + '.js'))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (product) {
        var packs = null;
        if (
          product &&
          product.options &&
          product.options.length === 1 &&
          PACK_OPTION_NAMES.indexOf(String(product.options[0].name || '').trim().toLowerCase()) !== -1
        ) {
          packs = [];
          product.variants.forEach(function (v) {
            var n = packSize(v.option1);
            // Ignore unavailable variants so we never repack into something unbuyable.
            if (n && v.available) packs.push({ size: n, id: v.id, price: v.price });
          });
          packs.sort(function (a, b) { return b.size - a.size; });
          if (packs.length < 2) packs = null;
        }
        productCache[handle] = packs;
        return packs;
      })
      .catch(function () {
        productCache[handle] = null;
        return null;
      });
  }

  // Cheapest way to buy exactly `units`, by total price. Returns { <variantId>: qty } or null.
  // Ties go to the combination using the largest pack (packs are sorted size-desc).
  function cheapest(units, packs) {
    if (units > MAX_UNITS) return null;
    var INF = Infinity;
    var cost = [0];
    var pick = [null];
    for (var u = 1; u <= units; u++) {
      cost[u] = INF;
      pick[u] = null;
      for (var i = 0; i < packs.length; i++) {
        var p = packs[i];
        if (p.size > u || cost[u - p.size] === INF) continue;
        var c = cost[u - p.size] + p.price;
        if (c < cost[u]) {
          cost[u] = c;
          pick[u] = p;
        }
      }
    }
    if (cost[units] === INF) return null; // no combination adds up (e.g. no 1-pack)
    var out = {};
    for (var left = units; left > 0; ) {
      var chosen = pick[left];
      out[chosen.id] = (out[chosen.id] || 0) + 1;
      left -= chosen.size;
    }
    return { plan: out, total: cost[units] };
  }

  function repack() {
    return nativeFetch(url('/cart.js'), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        // Group cart lines by product, skipping anything with properties or a subscription —
        // /cart/update.js keyed by variant id can't address those safely.
        var byProduct = {};
        cart.items.forEach(function (item) {
          if (item.selling_plan_allocation) return;
          if (item.properties && Object.keys(item.properties).length) return;
          var g = byProduct[item.product_id] || (byProduct[item.product_id] = { handle: item.handle, items: [] });
          g.items.push(item);
        });

        var pids = Object.keys(byProduct);
        return Promise.all(pids.map(function (pid) { return getPacks(byProduct[pid].handle); }))
          .then(function (packsPerProduct) {
            var updates = {};
            var toCreate = [];

            pids.forEach(function (pid, i) {
              var packs = packsPerProduct[i];
              if (!packs) return;

              var group = byProduct[pid];
              var bySize = {};
              packs.forEach(function (p) { bySize[p.id] = p; });

              // Every line of this product must be a known pack variant, else skip it.
              var units = 0;
              var currentTotal = 0;
              var current = {};
              var ok = group.items.every(function (item) {
                var p = bySize[item.variant_id];
                if (!p) return false;
                units += p.size * item.quantity;
                currentTotal += p.price * item.quantity;
                current[p.id] = (current[p.id] || 0) + item.quantity;
                return true;
              });
              if (!ok || units === 0) return;

              var best = cheapest(units, packs);
              // Only ever act if it makes the cart strictly cheaper.
              if (!best || best.total >= currentTotal) return;

              packs.forEach(function (p) {
                var want = best.plan[p.id] || 0;
                var have = current[p.id] || 0;
                if (want === have) return;
                updates[p.id] = want;
                // /cart/update.js only updates existing lines — a brand new pack variant
                // has to be added first.
                if (want > 0 && have === 0) toCreate.push({ id: p.id, quantity: 1 });
              });
            });

            if (!Object.keys(updates).length) return false;

            var chain = toCreate.length
              ? nativeFetch(url('/cart/add.js'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                  body: JSON.stringify({ items: toCreate })
                })
              : Promise.resolve();

            return chain
              .then(function () {
                return nativeFetch(url('/cart/update.js'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                  body: JSON.stringify({ updates: updates })
                });
              })
              .then(function () { return true; });
          });
      })
      .catch(function (e) {
        console.warn('[pamaura pack pricing]', e);
        return false;
      });
  }

  window.fetch = function (input, init) {
    var mutating = !busy && isCartMutation(input);
    return nativeFetch(input, init).then(function (response) {
      if (!mutating || !response.ok) return response;
      busy = true;
      return repack().then(
        function () { busy = false; return response; },
        function () { busy = false; return response; }
      );
    });
  };

  // The cart page renders server-side, so fix a cart that was already wrong on arrival.
  var RELOAD_KEY = 'pamauraPackRepacked';
  function fixOnLoad() {
    if (!document.body || !document.body.classList.contains('template-cart')) return;
    busy = true;
    repack().then(
      function (didChange) {
        busy = false;
        if (!didChange) {
          try { sessionStorage.removeItem(RELOAD_KEY); } catch (e) {}
          return;
        }
        // The theme's own re-render — no page reload, no drawer popping open
        // (refreshCart guards the .show() call when the sidebar isn't rendered).
        if (typeof window.refreshCart === 'function') {
          window.refreshCart();
          return;
        }
        // Fallback only. Reload at most once in a row, so a cart that somehow never
        // settles can't put the page in a reload loop.
        try {
          if (sessionStorage.getItem(RELOAD_KEY)) return;
          sessionStorage.setItem(RELOAD_KEY, '1');
        } catch (e) {}
        window.location.reload();
      },
      function () { busy = false; }
    );
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixOnLoad);
  } else {
    fixOnLoad();
  }
})();
