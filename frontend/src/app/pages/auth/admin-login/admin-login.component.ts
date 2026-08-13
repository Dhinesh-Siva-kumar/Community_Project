import { Component, HostBinding, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
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
  private platformId = inject(PLATFORM_ID) as object;

  loading = signal(false);
  showPassword = signal(false);

  // ── Theme ──────────────────────────────────────────────────────────────────
  currentTheme: 'dark' | 'light' = 'dark';

  @HostBinding('attr.data-theme')
  get theme(): string { return this.currentTheme; }

  toggleTheme(): void {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('landing-theme', this.currentTheme);
    }
  }

  private loadTheme(): void {
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem('landing-theme') as 'dark' | 'light' | null;
      if (saved) this.currentTheme = saved;
    }
  }

  adminLoginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    this.loadTheme();
  }

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
