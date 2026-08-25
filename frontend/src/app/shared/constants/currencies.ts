// ─────────────────────────────────────────────────────────────
// CENTRALIZED CURRENCY MASTER DATA
// Import from here throughout the application
// ─────────────────────────────────────────────────────────────

export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
}

// `label` holds a catalog key — the symbol and ISO code are international
// notation and stay verbatim inside the translation, only the currency name
// changes. Consumers render it through `| translate`.
export const CURRENCIES: CurrencyOption[] = [
  { code: 'INR', symbol: '₹',   label: 'currency.INR' },
  { code: 'GBP', symbol: '£',   label: 'currency.GBP' },
  { code: 'USD', symbol: '$',   label: 'currency.USD' },
  { code: 'EUR', symbol: '€',   label: 'currency.EUR' },
  { code: 'AED', symbol: 'AED', label: 'currency.AED' },
  { code: 'SGD', symbol: 'S$',  label: 'currency.SGD' },
  { code: 'CAD', symbol: 'C$',  label: 'currency.CAD' },
  { code: 'AUD', symbol: 'A$',  label: 'currency.AUD' },
];

/** Returns the currency symbol for a given currency code, e.g. 'INR' → '₹' */
export function getCurrencySymbol(code: string | undefined): string {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? '';
}

/** Returns SelectOption array compatible with SearchableSelectComponent */
export function getCurrencySelectOptions() {
  return CURRENCIES.map(c => ({ value: c.code, label: c.label }));
}
