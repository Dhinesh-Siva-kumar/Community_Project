import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as QRCode from 'qrcode';

/**
 * Renders a QR code for `value` as a PNG data URI, generated entirely
 * client-side (no image is uploaded or stored — the Booking URL itself is
 * the only thing persisted; the QR is just a rendering of it).
 */
@Component({
  selector: 'app-qr-code',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dataUrl()) {
      <img [src]="dataUrl()" [attr.width]="size()" [attr.height]="size()" class="qrc-img" [alt]="ariaLabel() || 'QR code'" />
    } @else if (loading()) {
      <div class="qrc-placeholder" [style.width.px]="size()" [style.height.px]="size()">
        <span class="spinner-border spinner-border-sm"></span>
      </div>
    }
  `,
  styleUrls: ['./qr-code.component.scss'],
})
export class QrCodeComponent {
  readonly value      = input<string>('');
  readonly size        = input<number>(160);
  readonly ariaLabel   = input<string>('');

  protected dataUrl = signal<string | null>(null);
  protected loading = signal(false);

  constructor() {
    effect(() => {
      const value = this.value();
      const size = this.size();
      if (!value) { this.dataUrl.set(null); this.loading.set(false); return; }

      this.loading.set(true);
      QRCode.toDataURL(value, {
        width: size,
        margin: 1,
        color: { dark: '#1c1917', light: '#ffffff' },
      })
        .then((url) => { this.dataUrl.set(url); this.loading.set(false); })
        .catch(() => { this.dataUrl.set(null); this.loading.set(false); });
    });
  }
}
