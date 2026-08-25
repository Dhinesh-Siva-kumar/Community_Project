import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { EnumGroup, enumLabelKey } from '../constants/enum-labels';

/**
 * Renders a stored enum value in the reader's language:
 * `{{ job.jobType | enumLabel:'jobType' }}` → "Full-time" / "முழுநேரம்".
 *
 * The stored value is untouched — only its display is translated. Values
 * outside the group fall through unchanged, so API additions show up as
 * themselves rather than vanishing.
 *
 * Impure because the language can change without the value changing.
 */
@Pipe({ name: 'enumLabel', standalone: true, pure: false })
export class EnumLabelPipe implements PipeTransform {
  private translate = inject(TranslateService);

  transform(value: string | null | undefined, group: EnumGroup): string {
    const key = enumLabelKey(group, value);
    if (!key) return '';
    const text = this.translate.instant(key);
    return typeof text === 'string' ? text : key;
  }
}
