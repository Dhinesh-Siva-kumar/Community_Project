import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.scss'],
})
export class AdminLoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  loading = signal(false);

  adminLoginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  onSubmit(): void {
    if (this.adminLoginForm.invalid) {
      this.adminLoginForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { email, password } = this.adminLoginForm.value;

    this.authService.adminLogin(email, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.toastService.success('Admin login successful!');
        this.router.navigate(['/admin/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        this.toastService.error(err?.error?.message || 'Admin login failed. Please check your credentials.');
      },
    });
  }

  get f() {
    return this.adminLoginForm.controls;
  }
}
