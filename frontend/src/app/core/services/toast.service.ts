import { Injectable, inject, signal } from '@angular/core';
import { InterpolationParameters, TranslateService } from '@ngx-translate/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private translate = inject(TranslateService);

  toasts = signal<Toast[]>([]);

  private nextId = 0;
  private readonly DURATION = 4000;

  success(message: string, params?: InterpolationParameters): void {
    this.show(message, 'success', params);
  }

  error(message: string, params?: InterpolationParameters): void {
    this.show(message, 'error', params);
  }

  warning(message: string, params?: InterpolationParameters): void {
    this.show(message, 'warning', params);
  }

  info(message: string, params?: InterpolationParameters): void {
    this.show(message, 'info', params);
  }

  remove(id: number): void {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }

  private show(message: string, type: Toast['type'], params?: InterpolationParameters): void {
    const id = this.nextId++;
    const toast: Toast = { id, message: this.resolve(message, params), type };

    this.toasts.update((current) => [...current, toast]);

    setTimeout(() => this.remove(id), this.DURATION);
  }

  /**
   * Accepts either a catalog key (`toast.jobs.saved`) or literal text.
   * ngx-translate hands unknown keys back unchanged, so call sites that still
   * pass raw English keep working and can be migrated to keys one file at a
   * time. Interpolation params are forwarded for keys like
   * `"{{count}} items approved"`.
   */
  private resolve(message: string, params?: InterpolationParameters): string {
    const translated = this.translate.instant(message, params);
    return typeof translated === 'string' ? translated : message;
  }
}
