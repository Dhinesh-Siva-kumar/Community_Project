// =============================================================================
// Phone Validators — reactive-form group-level ValidatorFn factories
// =============================================================================
//
// Usage:
//   const group = fb.group({
//     dialCode: ['+91'],
//     phone:    ['', Validators.required],
//   }, { validators: makePhoneGroupValidator('dialCode', 'phone') });
//
// =============================================================================

import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { getPhoneRule } from './phone-rules';

// ---------------------------------------------------------------------------
// Internal helper — safely removes the `phoneInvalid` error from a control
// without triggering a redundant `setErrors` call when no error is present.
// ---------------------------------------------------------------------------
function clearPhoneInvalidError(phoneCtrl: AbstractControl): void {
  if (!phoneCtrl.hasError('phoneInvalid')) return;

  const errors = { ...(phoneCtrl.errors ?? {}) };
  delete errors['phoneInvalid'];
  phoneCtrl.setErrors(
    Object.keys(errors).length ? errors : null,
    { emitEvent: false },
  );
}

// ---------------------------------------------------------------------------
// Internal helper — marks the phone control with `phoneInvalid` if not
// already set, preventing redundant `setErrors` + status recalculations.
// ---------------------------------------------------------------------------
function markPhoneInvalid(phoneCtrl: AbstractControl, hint: string): void {
  if (phoneCtrl.hasError('phoneInvalid')) return;

  const errors = { ...(phoneCtrl.errors ?? {}), phoneInvalid: hint };
  phoneCtrl.setErrors(errors, { emitEvent: false });
}

// ---------------------------------------------------------------------------
// Core validation logic (shared between required and optional variants)
// ---------------------------------------------------------------------------
function runPhoneValidation(
  group:       AbstractControl,
  dialCodeKey: string,
  phoneKey:    string,
): ValidationErrors | null {
  const dialCodeCtrl = (group as FormGroup).get(dialCodeKey);
  const phoneCtrl    = (group as FormGroup).get(phoneKey);

  if (!dialCodeCtrl || !phoneCtrl) return null;

  const dialCode = (dialCodeCtrl.value ?? '').trim();
  const digits   = (phoneCtrl.value  ?? '').replace(/\D/g, '');

  // No dial code yet — nothing to validate against.
  if (!dialCode) {
    clearPhoneInvalidError(phoneCtrl);
    return null;
  }

  const rule  = getPhoneRule(dialCode);
  const valid =
    digits.length >= rule.minLen &&
    digits.length <= rule.maxLen &&
    (rule.pattern ? rule.pattern.test(digits) : true);

  if (valid) {
    clearPhoneInvalidError(phoneCtrl);
    return null;
  }

  markPhoneInvalid(phoneCtrl, rule.hint);
  // Also return a group-level error so the form's status becomes INVALID.
  return { phoneInvalid: rule.hint };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Factory that returns a group-level `ValidatorFn`.
 *
 * The validator:
 * 1. Reads `group.get(dialCodeKey)` and `group.get(phoneKey)`.
 * 2. Strips non-digits from the phone value.
 * 3. Looks up the country rule via `getPhoneRule(dialCode)`.
 * 4. On failure, sets `{ phoneInvalid: hint }` on the phone control
 *    (so the field border turns red) **and** returns the same error at
 *    the group level (so `form.invalid` is `true`).
 *
 * @param dialCodeKey  Name of the dial-code control inside the group.
 * @param phoneKey     Name of the phone-number control inside the group.
 */
export function makePhoneGroupValidator(
  dialCodeKey: string,
  phoneKey:    string,
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const phoneCtrl = (group as FormGroup).get(phoneKey);
    if (!phoneCtrl) return null;

    const digits = (phoneCtrl.value ?? '').replace(/\D/g, '');

    // Empty — required validator handles this; don't double-error.
    if (!digits) {
      clearPhoneInvalidError(phoneCtrl);
      return null;
    }

    return runPhoneValidation(group, dialCodeKey, phoneKey);
  };
}

/**
 * Same as `makePhoneGroupValidator` but treats an **empty** phone field
 * as valid.  Use when the phone number is optional on the form.
 *
 * @param dialCodeKey  Name of the dial-code control inside the group.
 * @param phoneKey     Name of the phone-number control inside the group.
 */
export function makeOptionalPhoneGroupValidator(
  dialCodeKey: string,
  phoneKey:    string,
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const phoneCtrl = (group as FormGroup).get(phoneKey);
    if (!phoneCtrl) return null;

    const digits = (phoneCtrl.value ?? '').replace(/\D/g, '');

    // Optional — skip all validation when the field is empty.
    if (!digits) {
      clearPhoneInvalidError(phoneCtrl);
      return null;
    }

    return runPhoneValidation(group, dialCodeKey, phoneKey);
  };
}
