// ─────────────────────────────────────────────────────────────
// CENTRALIZED CURRENCY MASTER DATA
// Import from here throughout the application
// ─────────────────────────────────────────────────────────────

export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'INR', symbol: '₹',   label: '₹ INR — Indian Rupee'      },
  { code: 'GBP', symbol: '£',   label: '£ GBP — British Pound'     },
  { code: 'USD', symbol: '$',   label: '$ USD — US Dollar'          },
  { code: 'EUR', symbol: '€',   label: '€ EUR — Euro'               },
  { code: 'AED', symbol: 'AED', label: 'AED — UAE Dirham'           },
  { code: 'SGD', symbol: 'S$',  label: 'S$ SGD — Singapore Dollar'  },
  { code: 'CAD', symbol: 'C$',  label: 'C$ CAD — Canadian Dollar'   },
  { code: 'AUD', symbol: 'A$',  label: 'A$ AUD — Australian Dollar' },
];

/** Returns the currency symbol for a given currency code, e.g. 'INR' → '₹' */
export function getCurrencySymbol(code: string | undefined): string {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? '';
}

/** Returns SelectOption array compatible with SearchableSelectComponent */
export function getCurrencySelectOptions() {
  return CURRENCIES.map(c => ({ value: c.code, label: c.label }));
}
