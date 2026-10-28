// Texts that Shopify itself supplies (not the theme's locale files): sort options, filter labels.
// Values copied from the live pamaura.com storefront for each language.
const STRINGS: Record<string, Record<string, string>> = {
  bg: {
    "sort.manual": "Препоръчани",
    "sort.most-relevant": "Най-подходящи",
    "sort.best-selling": "Най-продавани",
    "sort.title-ascending": "По азбучен ред, A – Z",
    "sort.title-descending": "По азбучен ред, Z – A",
    "sort.price-ascending": "Цена, от ниска към висока",
    "sort.price-descending": "Цена, от висока към ниска",
    "sort.created-ascending": "Дата, от стара към нова",
    "sort.created-descending": "Дата, от нова към стара",
    "filter.availability": "Availability",
    "filter.availability.in": "В наличност",
    "filter.availability.out": "Изчерпано количество",
    "filter.price": "Price",
  },
  ro: {
    "sort.manual": "Recomandat",
    "sort.most-relevant": "Cele mai relevante",
    "sort.best-selling": "Cel mai bine vândut",
    "sort.title-ascending": "Alfabetic, A-Z",
    "sort.title-descending": "Alfabetic, Z-A",
    "sort.price-ascending": "Preț, de la mic la mare",
    "sort.price-descending": "Preț, de la mare la mic",
    "sort.created-ascending": "Data, de la vechi la nou",
    "sort.created-descending": "Data, de la nou la vechi",
    "filter.availability": "Disponibilitate",
    "filter.availability.in": "În stoc",
    "filter.availability.out": "Stoc epuizat",
    "filter.price": "Preț",
  },
  en: {
    "sort.manual": "Featured",
    "sort.most-relevant": "Most relevant",
    "sort.best-selling": "Best selling",
    "sort.title-ascending": "Alphabetically, A-Z",
    "sort.title-descending": "Alphabetically, Z-A",
    "sort.price-ascending": "Price, low to high",
    "sort.price-descending": "Price, high to low",
    "sort.created-ascending": "Date, old to new",
    "sort.created-descending": "Date, new to old",
    "filter.availability": "Availability",
    "filter.availability.in": "In stock",
    "filter.availability.out": "Out of stock",
    "filter.price": "Price",
  },
};

export function shopifyText(locale: string, key: string): string {
  return STRINGS[locale]?.[key] ?? STRINGS.en[key] ?? key;
}

export const SORT_VALUES = [
  "manual",
  "most-relevant",
  "best-selling",
  "title-ascending",
  "title-descending",
  "price-ascending",
  "price-descending",
  "created-ascending",
  "created-descending",
];
