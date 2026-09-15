import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Small inline "busy" indicator for content that's translating/refreshing in
 * place — visual language ported from `.uc-load-more-spinner` (border-ring
 * spin), pulled into a shared component since this feature needs it in ~10
 * places. Uses `currentColor` so it inherits whatever text color it's dropped
 * into rather than hardcoding a palette value.
 */
@Component({
  selector: 'app-inline-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="inline-spinner"
    [class.inline-spinner--md]="size() === 'md'"
    role="status"
    [attr.aria-label]="label() || null"
  ></span>`,
  styleUrl: './inline-spinner.component.scss',
})
export class InlineSpinnerComponent {
  size = input<'sm' | 'md'>('sm');
  label = input<string>('');
}
