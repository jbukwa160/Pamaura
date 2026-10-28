// Shopify money formats ("€{{amount_with_comma_separator}}"). No server imports: also used in the browser.
export function formatMoney(cents: number, format: string): string {
  const n = Math.round(cents);
  const fmt = (precision: number, thousands: string, decimal: string) => {
    const neg = n < 0;
    const abs = Math.abs(n) / 100;
    const fixed = abs.toFixed(precision);
    const [whole, frac] = fixed.split(".");
    const int = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
    return (neg ? "-" : "") + int + (frac ? decimal + frac : "");
  };
  return format.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    switch (key) {
      case "amount":
        return fmt(2, ",", ".");
      case "amount_no_decimals":
        return fmt(0, ",", ".");
      case "amount_with_comma_separator":
        return fmt(2, ".", ",");
      case "amount_no_decimals_with_comma_separator":
        return fmt(0, ".", ",");
      case "amount_with_apostrophe_separator":
        return fmt(2, "'", ".");
      case "amount_no_decimals_with_space_separator":
        return fmt(0, " ", ".");
      case "amount_with_space_separator":
        return fmt(2, " ", ",");
      case "amount_with_period_and_space_separator":
        return fmt(2, " ", ".");
      default:
        return _m;
    }
  });
}
