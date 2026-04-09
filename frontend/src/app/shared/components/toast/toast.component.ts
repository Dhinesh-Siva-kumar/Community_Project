import { Component, inject } from '@angular/core';
import { ToastService, Toast } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss'],
})
export class ToastComponent {
  toastService = inject(ToastService);

  getIcon(type: Toast['type']): string {
    const icons: Record<Toast['type'], string> = {
      success: 'bi-check-circle-fill',
      error: 'bi-x-circle-fill',
      warning: 'bi-exclamation-triangle-fill',
      info: 'bi-info-circle-fill',
    };
    return icons[type];
  }

  getBgClass(type: Toast['type']): string {
    const classes: Record<Toast['type'], string> = {
      success: 'toast-success',
      error: 'toast-error',
      warning: 'toast-warning',
      info: 'toast-info',
    };
    return classes[type];
  }

  dismiss(id: number): void {
    this.toastService.remove(id);
  }
}
