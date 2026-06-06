// =============================================================================
// splitPhone — splits a full E.164-style number into dial code + subscriber
// =============================================================================
//
// Example:
//   splitPhone('+919876543210') → { dialCode: '+91', phone: '9876543210' }
//   splitPhone('+18681234567')  → { dialCode: '+1868', phone: '1234567' }
//   splitPhone('+447911123456') → { dialCode: '+44',  phone: '7911123456' }
//   splitPhone('9876543210')    → null  (no leading '+')
//
// Strategy — dial codes are tried longest-first so '+1868' wins over '+1'.
//
// =============================================================================

import { PHONE_RULES } from './phone-rules';

// Build a sorted list once at module load time.
// Longest dial codes must be tested first to prevent '+1' swallowing '+1868'.
const KNOWN_DIAL_CODES: readonly string[] = Object.keys(PHONE_RULES).sort(
  (a, b) => b.length - a.length,
);

export interface SplitPhoneResult {
  dialCode: string;
  phone:    string;
}

/**
 * Splits a full phone string (e.g. `"+919876543210"`) into its dial code
 * and subscriber number.
 *
 * - Known dial codes (from `PHONE_RULES`) are tried longest-first.
 * - If no known code matches, falls back to the first 1–4 digit prefix
 *   after the `+` sign (covers any ITU-T E.164 number).
 * - Returns `null` if the string does not start with `+`.
 *
 * @param full  Full phone string, with or without spaces/dashes.
 */
export function splitPhone(full: string): SplitPhoneResult | null {
  if (!full || !full.startsWith('+')) return null;

  // 1. Try every known dial code (longest first).
  for (const code of KNOWN_DIAL_CODES) {
    if (full.startsWith(code)) {
      return { dialCode: code, phone: full.slice(code.length) };
    }
  }

  // 2. Generic fallback — capture '+' plus 1–4 leading digits.
  const match = full.match(/^(\+\d{1,4})(.*)/);
  if (match) {
    return { dialCode: match[1], phone: match[2] };
  }

  return null;
}
