import { Component, HostBinding, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService } from '../../../core/services/theme.service';
import { LanguageService } from '../../../core/services/language.service';
import { LanguageToggleComponent } from '../../../shared/components/language-toggle/language-toggle.component';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, LanguageToggleComponent],
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.scss'],
})
export class AdminLoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private themeService = inject(ThemeService);
  private languageService = inject(LanguageService);
  private router = inject(Router);

  loading = signal(false);
  showPassword = signal(false);

  // ── Theme — delegates to the shared ThemeService (see theme.service.ts);
  // this page still binds its own host attribute since _auth-shared.scss's
  // --auth-* palette is :host[data-theme]-scoped. ────────────────────────
  get currentTheme(): 'dark' | 'light' { return this.themeService.theme(); }

  @HostBinding('attr.data-theme')
  get theme(): string { return this.currentTheme; }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  // ── Language — owned by the shared LanguageService; this page only needs
  // the host attribute since _auth-shared.scss's Tamil metric tweaks are
  // :host[lang]-scoped. ─────────────────────────────────────────────────────
  @HostBinding('attr.lang')
  get langAttr(): string { return this.languageService.currentLang(); }

  adminLoginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    this.themeService.applyDefaultIfUnset('dark');
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
        this.toastService.success('auth.adminLogin.toastLoginSuccess');
        this.router.navigate(['/admin/dashboard']);
      },
      error: () => {
        this.loading.set(false);
        // The raw server message is English-only; the interceptor already
        // surfaces a translated one, so fall back to our own copy here.
        this.toastService.error('auth.adminLogin.toastLoginFailed');
      },
    });
  }

  get f() {
    return this.adminLoginForm.controls;
  }
}
