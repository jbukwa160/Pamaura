# PAMAURA — own backend for the Shopify theme

pamaura.com without Shopify. The Shopify theme (`theme/`, the export) is used **unchanged**: our own Liquid
engine renders it page by page the way Shopify does, from our own database. Around it:

- checkout with courier offices and lockers;
- orders, customers and e-mails;
- an admin panel in Bulgarian (`/admin`).

Stack: Next.js 16 (App Router), React 19, SQLite (better-sqlite3), LiquidJS, sharp, nodemailer, Tailwind 4 (admin only).

## Running it

```bash
npm install
cp .env.example .env.local        # fill in SITE_URL, SMTP_*, courier logins
npm run admin:user -- --user admin   # prints a password for /admin
npm run dev                       # http://localhost:3005
# production
npm run build && npm run start    # port 3005, put a reverse proxy (nginx / Caddy) with HTTPS in front
```

Data lives outside the code in `DATA_DIR` (default `../pamaura-data`). That folder holds:

- `store.db`: the database (catalog, orders, customers, settings);
- `files/`: pictures and videos;
- `fonts/`;
- `outbox/`: e-mails when SMTP is not set;
- `cache/`: resized images.

Back up the whole folder. Use `sqlite3 store.db ".backup …"` for a consistent copy of the database while the server runs.

## What is where

| Address | What |
| --- | --- |
| `/bg-bg/…`, `/ro-ro/…` | The shop (theme), Bulgaria in EUR and Romania in RON, as on Shopify Markets. `/` redirects by market. |
| `/checkouts/<cart>` | Checkout: contact, delivery (Econt / BOX NOW office or locker, address), cash on delivery or bank transfer, discount code. |
| `/checkouts/order/<token>` | Order status page; the link is in the confirmation e-mail. |
| `/admin` | Admin panel. |
| `/cdn/…` | Pictures, videos, fonts and theme assets (resized on demand, like Shopify's CDN). |
| `/api/…` | Checkout prices, courier offices, reviews. |

Shopify's own storefront URLs keep working the same way, so the theme's JavaScript needs no changes:

- Ajax cart: `/cart/add.js`, `/cart/change.js`, `/cart.js`;
- search suggestions: `/search/suggest`;
- recommendations: `/recommendations/products`;
- the Section Rendering API (`?section_id=`, `?sections=`);
- `/products/<handle>.js`;
- customer accounts, newsletter and contact forms, sitemaps and robots.txt.

### Admin panel (`/admin`)

| Section | What it does |
| --- | --- |
| Табло | Orders today / 7 / 30 days, orders waiting, low stock, e-mail and courier warnings. |
| Поръчки | Status changes with e-mail to the customer and restocking on cancel, paid / unpaid, tracking number, Econt / Speedy / BOX NOW waybill and label (needs the courier logins), internal notes, history. |
| Клиенти, Абонати | Customer accounts and newsletter subscribers (CSV export). |
| Продукти, Колекции | Texts BG / RO, prices (RON preview), stock, variants and options, pictures, metafields, upsells, SEO; changing an address adds a 301 redirect. |
| Отстъпки | Discount codes (END10 is carried over from the store). |
| Отзиви | Approve / hide reviews; customers can write reviews on product pages. |
| Страници, Блог, Меню | Content pages, blog articles (with redirects when an address changes), the header and footer menus with RO titles. |
| Текстове в сайта | Every heading, paragraph and button of the theme's sections, BG / RO, without touching the theme files. |
| Доставка и плащане | Delivery methods and prices, free-delivery threshold, cash on delivery, bank transfer, courier status. |
| Настройки | Shop details, RON exchange rate, VAT, verification / Klaviyo codes, e-mail status. |

## Data from Shopify

The catalog was copied from the live store's public pages:

- products, variants, prices, pictures and videos;
- collections, pages, the blog, menus and theme texts;
- the Romanian translations, product metafields and upsells;
- 212 Judge.me reviews with their photos.

Verification: every page in both languages was rendered here and compared with the live page, section by section. The only differences are the replaced apps listed below.

```bash
npm run import:all      # import → align (metafields, videos) → reviews → theme texts
```

Run it only once, before going live. `--replace` overwrites products, collections, pages, the blog and menus with what Shopify has. Changes made in the admin to those would be lost. Orders, customers, settings, discount codes, admin edits of theme texts and reviews are kept.

Not available from Shopify's public pages, so not migrated:

- past orders;
- customer accounts and newsletter subscribers;
- exact stock levels: estimated from the products CSV, otherwise 100;
- Shopify's discount codes, except END10, which the announcement bar shows.

## Shopify apps → replacements

| On Shopify | Here |
| --- | --- |
| Judge.me reviews | Own review widget, badge and shop rating (same look), reviews imported, new reviews moderated in the admin. |
| Shopify Checkout, Shop Pay | Own checkout: cash on delivery, optional bank transfer. No card payments. |
| izprati.bg (couriers in the cart) | Econt / Speedy / BOX NOW offices and lockers in our checkout; waybills from the admin. |
| T-Lab language switcher | Same switcher, own code; Romanian texts imported. |
| Shopify Markets (RON) | Markets with an exchange rate set in the admin (no daily automatic rate). |
| Klaviyo, Instafeed | Kept: their public scripts load as before (Klaviyo forms only work on the real domain). |
| Dealeasy, Essential Countdown | Removed (not used by the visible pages). |

## Known content issues carried over from the live store

- Delivery texts in the theme say "Безплатна доставка над 50 лв." and the RO announcement says "peste 25 €". The theme setting and the checkout use €35. Align them in Текстове в сайта, and the threshold in Доставка и плащане.
- The theme shows the variant metafields `custom.price_text` / `compare_at_price_text` next to the variant prices. Several still say "19 лв." from before the euro switch. They are copied as the live store has them and are not editable in the admin yet.

## Environment

See `.env.example`. Courier variables are explained in `src/lib/shipping/couriers/ENV.md`. Without SMTP settings, e-mails are written to `DATA_DIR/outbox`. Without courier logins, Econt and BOX NOW offices still show in the checkout, but waybills must be made in the courier's own system. Speedy stays hidden until its login is set.

## Code map

- `theme/`: the Shopify theme export (do not edit for content; use the admin).
- `src/lib/liquid/`: Liquid engine with Shopify's objects, filters and tags, Ruby number semantics and section rendering.
- `src/lib/storefront/`: request routing, Shopify-compatible endpoints, static files.
- `src/lib/catalog.ts`, `src/lib/db.ts`: database schema and the in-memory catalog (reloaded when the admin changes something).
- `src/lib/checkout.ts`, `src/app/checkouts/`: checkout.
- `src/lib/shipping/`: delivery prices and the courier integrations.
- `src/app/admin/`, `src/components/admin/`, `src/lib/admin/`: admin panel.
- `scripts/`: one-time import from Shopify, `admin-user.ts`.
# Pamaura
