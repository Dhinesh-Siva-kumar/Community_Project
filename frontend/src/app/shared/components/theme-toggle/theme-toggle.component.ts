import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { ThemeService } from '../../../core/services/theme.service';

/** App-wide light/dark toggle for the user/admin layout headers — a small
 * icon button matching the header's other icon buttons (e.g. the
 * notification bell), wired to the shared ThemeService. */
@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="theme-toggle-btn"
      (click)="themeService.toggleTheme()"
      [attr.aria-label]="themeService.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
      [attr.title]="themeService.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    >
      <i class="bi" [class.bi-sun-fill]="themeService.theme() === 'dark'" [class.bi-moon-fill]="themeService.theme() === 'light'" aria-hidden="true"></i>
    </button>
  `,
  styleUrl: './theme-toggle.component.scss',
})
export class ThemeToggleComponent {
  themeService = inject(ThemeService);
}
