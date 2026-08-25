import { Injectable, isDevMode } from '@angular/core';
import { MissingTranslationHandler, MissingTranslationHandlerParams } from '@ngx-translate/core';

/**
 * Matches a catalog key (`admin.jobs.title`) but not a literal English
 * sentence. `ToastService` deliberately runs every message through
 * `translate.instant()` so not-yet-migrated call sites can keep passing raw
 * text; those must not produce warnings, only genuinely missing keys should.
 */
const KEY_PATTERN = /^[a-zA-Z][\w-]*(\.[\w-]+)+$/;

@Injectable({ providedIn: 'root' })
export class WarnMissingTranslationHandler implements MissingTranslationHandler {
  handle(params: MissingTranslationHandlerParams): string {
    if (isDevMode() && KEY_PATTERN.test(params.key)) {
      console.warn(`[i18n] Missing translation: ${params.key}`);
    }
    // Returning the key keeps raw-text call sites rendering their own text.
    return params.key;
  }
}
