import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts = signal<Toast[]>([]);

  private nextId = 0;
  private readonly DURATION = 4000;

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  warning(message: string): void {
    this.show(message, 'warning');
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  remove(id: number): void {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }

  private show(message: string, type: Toast['type']): void {
    const id = this.nextId++;
    const toast: Toast = { id, message, type };

    this.toasts.update((current) => [...current, toast]);

    setTimeout(() => this.remove(id), this.DURATION);
  }
}
