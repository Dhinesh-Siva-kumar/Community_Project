// =============================================================================
// Phone Rules — country-specific validation table
// =============================================================================
//
// To add a new country, append an entry to PHONE_RULES:
//   PHONE_RULES['+<dialCode>'] = { minLen, maxLen, pattern, hint };
//
// To disable the pattern check for a specific country (rare), set
//   pattern: undefined  — the length check will still apply.
//
// =============================================================================

export interface PhoneRule {
  minLen:  number;
  maxLen:  number;
  /** Regex the stripped digit string must match. */
  pattern: RegExp | undefined;
  /** Human-readable description shown in error messages. */
  hint:    string;
}

// -----------------------------------------------------------------------------
// Country table (dial code → rule)
// -----------------------------------------------------------------------------

export const PHONE_RULES: Record<string, PhoneRule> = {
  '+91':  { minLen: 10, maxLen: 10, pattern: /^[6-9]\d{9}$/,    hint: '10 digits starting with 6–9 (India)' },
  '+1':   { minLen: 10, maxLen: 10, pattern: /^\d{10}$/,         hint: '10 digits (US / Canada)' },
  '+44':  { minLen: 10, maxLen: 11, pattern: /^7\d{9}$/,         hint: '10 digits starting with 7 (UK mobile)' },
  '+61':  { minLen:  9, maxLen:  9, pattern: /^[4]\d{8}$/,       hint: '9 digits starting with 4 (Australia)' },
  '+971': { minLen:  9, maxLen:  9, pattern: /^[5]\d{8}$/,       hint: '9 digits starting with 5 (UAE)' },
  '+234': { minLen: 10, maxLen: 11, pattern: /^[7-9]\d{9,10}$/,  hint: '10–11 digits starting with 7–9 (Nigeria)' },
  '+254': { minLen:  9, maxLen:  9, pattern: /^[7]\d{8}$/,       hint: '9 digits starting with 7 (Kenya)' },
  '+27':  { minLen:  9, maxLen:  9, pattern: /^[6-8]\d{8}$/,     hint: '9 digits starting with 6–8 (South Africa)' },
  '+49':  { minLen: 10, maxLen: 12, pattern: /^\d{10,12}$/,      hint: '10–12 digits (Germany)' },
  '+33':  { minLen:  9, maxLen:  9, pattern: /^[6-7]\d{8}$/,     hint: '9 digits starting with 6–7 (France)' },
};

/**
 * Fallback rule used for any dial code not listed in PHONE_RULES.
 * Covers the ITU-T E.164 maximum length (15 digits).
 */
export const FALLBACK_PHONE_RULE: PhoneRule = {
  minLen:  5,
  maxLen: 15,
  pattern: /^\d{5,15}$/,
  hint:    '5–15 digits',
};

/**
 * Returns the PhoneRule for the given dial code.
 * Falls back to FALLBACK_PHONE_RULE if the dial code is not in the table.
 */
export function getPhoneRule(dialCode: string): PhoneRule {
  return PHONE_RULES[dialCode] ?? FALLBACK_PHONE_RULE;
}
