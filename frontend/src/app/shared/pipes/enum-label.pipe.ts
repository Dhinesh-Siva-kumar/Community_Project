import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { EnumGroup, enumLabelKey } from '../constants/enum-labels';

/**
 * Renders a stored enum value in the reader's language:
 * `{{ job.jobType | enumLabel:'jobType' }}` → "Full-time" / "முழுநேரம்".
 *
 * The stored value is untouched — only its display is translated. Values
 * outside the group fall through unchanged, so API additions show up as
 * themselves rather than vanishing.
 *
 * Impure because the language can change without the value changing. Impure
 * alone is not enough inside an OnPush component: with no dirty marking that
 * component's change detection never runs, so the pipe is never re-invoked and
 * the label sticks in the previous language. Subscribing to `onLangChange` and
 * calling `markForCheck()` is what ngx-translate's own TranslatePipe does.
 */
@Pipe({ name: 'enumLabel', standalone: true, pure: false })
export class EnumLabelPipe implements PipeTransform, OnDestroy {
  private translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);
  private sub: Subscription = this.translate.onLangChange.subscribe(() => this.cdr.markForCheck());

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  transform(value: string | null | undefined, group: EnumGroup): string {
    const key = enumLabelKey(group, value);
    if (!key) return '';
    const text = this.translate.instant(key);
    return typeof text === 'string' ? text : key;
  }
}
