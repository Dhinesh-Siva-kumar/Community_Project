import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * http(s)-only URL validator — extracted from the identical local copies in
 * job-form-modal.component.ts and business-form-modal.component.ts (both
 * used `new URL(v)` + a protocol check already) so Events' Booking URL and
 * Meeting/Stream Link fields validate the same way instead of the looser
 * `Validators.pattern(/^https?:\/\/.+/)` regex, which accepts strings like
 * `https://x` that aren't real URLs.
 */
export function urlValidator(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  if (!v) return null;
  return isHttpUrl(v) ? null : { invalidUrl: true };
}

/** Plain boolean form of the same http(s)-only check, for display-side
 * gating (e.g. "only show the Book Now / Join Meeting CTA and QR code for a
 * genuinely valid URL") where a FormControl ValidatorFn doesn't apply —
 * defends against a legacy/malformed persisted value, not just new input. */
export function isHttpUrl(v: string | null | undefined): boolean {
  if (!v) return false;
  try {
    const url = new URL(v);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
