import { Component, inject, signal, HostBinding, PLATFORM_ID, OnInit } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID) as object;

  loading = signal(false);
  showPassword = signal(false);

  // ── Theme ──
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

  ngOnInit(): void {
    this.loadTheme();
  }

  private usernameOrEmailValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const usernameRegex = /^[a-zA-Z0-9._\-]+$/ ///^[a-zA-Z0-9._\-]{3,}$/;
    return emailRegex.test(value) || usernameRegex.test(value) ? null : { invalidUsernameOrEmail: true };
  }

  forgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }

  loginForm: FormGroup = this.fb.group({
    identifier: ['', [Validators.required, this.usernameOrEmailValidator.bind(this)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { identifier, password } = this.loginForm.value;

    this.authService.login(identifier, password).subscribe({
      next: (resp: any) => {
        if(resp.user.roleLevel >= 50) {
          this.router.navigate(['/admin/dashboard']);
          this.toastService.success('Admin login successful! Welcome back.');
          return;
        }
        this.loading.set(false);
        this.toastService.success('Login successful! Welcome back.');
        this.router.navigate(['/user/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        this.toastService.error(err?.error?.message || 'Login failed. Please check your credentials.');
      },
    });
  }

  get f() {
    return this.loginForm.controls;
  }
}
