import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './shared/components/toast/toast.component';
import { UnsavedChangesDialogComponent } from './shared/components/unsaved-changes-dialog/unsaved-changes-dialog.component';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastComponent, UnsavedChangesDialogComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  private authService = inject(AuthService);

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.authService.getCurrentUser().subscribe();
    }
  }
}
