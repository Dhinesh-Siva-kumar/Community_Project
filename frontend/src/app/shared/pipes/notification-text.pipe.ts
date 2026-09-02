import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { Notification } from '../../core/models';

/**
 * Renders a notification in the reader's language.
 *
 * The backend stores both a composed English `message` and, since the params
 * migration, the interpolation values that produced it. When `params` is
 * present the text is rebuilt from the `notification.<TYPE>` catalog entry;
 * older rows have no params, so their stored `message` is shown as-is.
 *
 * Impure because the language can change without the notification changing.
 * Impure alone is not enough inside an OnPush component — see EnumLabelPipe for
 * why the `onLangChange` + `markForCheck()` pairing is also needed.
 */
@Pipe({ name: 'notificationText', standalone: true, pure: false })
export class NotificationTextPipe implements PipeTransform, OnDestroy {
  private translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);
  private sub: Subscription = this.translate.onLangChange.subscribe(() => this.cdr.markForCheck());

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  transform(notification: Notification | null | undefined): string {
    if (!notification) return '';
    if (!notification.params) return notification.message;

    const key = `notification.${notification.type}`;
    const text = this.translate.instant(key, notification.params);
    // instant() hands back the key when it is missing from the catalog.
    return typeof text === 'string' && text !== key ? text : notification.message;
  }
}
