import { Component, HostBinding, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService } from '../../../core/services/theme.service';

type Lang = 'en' | 'ta';

const TRANSLATIONS = {
  en: {
    switchToTamil: 'Switch to Tamil',
    switchToEnglish: 'Switch to English',
    switchToLight: 'Switch to light mode',
    switchToDark: 'Switch to dark mode',
    portalTitle: 'Admin Portal',
    portalSubtitle: 'Authorized personnel only',
    emailLabel: 'Admin Email',
    emailPlaceholder: 'admin@example.com',
    errEmailRequired: 'Email is required.',
    errEmailInvalid: 'Please enter a valid email address.',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter admin password',
    errPasswordRequired: 'Password is required.',
    errPasswordMinlength: 'Password must be at least 6 characters.',
    togglePasswordVisibility: 'Toggle password visibility',
    authenticating: 'Authenticating...',
    signInAsAdmin: 'Sign In as Admin',
    backToUserLogin: 'Back to User Login',
    toastLoginSuccess: 'Admin login successful!',
    toastLoginFailed: 'Admin login failed. Please check your credentials.',
  },
  ta: {
    switchToTamil: 'தமிழுக்கு மாறவும்',
    switchToEnglish: 'ஆங்கிலத்திற்கு மாறவும்',
    switchToLight: 'லைட் மோடிற்கு மாறவும்',
    switchToDark: 'டார்க் மோடிற்கு மாறவும்',
    portalTitle: 'நிர்வாக போர்டல்',
    portalSubtitle: 'அங்கீகரிக்கப்பட்ட நபர்களுக்கு மட்டும்',
    emailLabel: 'நிர்வாக மின்னஞ்சல்',
    emailPlaceholder: 'admin@example.com',
    errEmailRequired: 'மின்னஞ்சல் தேவை.',
    errEmailInvalid: 'சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்.',
    passwordLabel: 'கடவுச்சொல்',
    passwordPlaceholder: 'நிர்வாக கடவுச்சொல்லை உள்ளிடவும்',
    errPasswordRequired: 'கடவுச்சொல் தேவை.',
    errPasswordMinlength: 'கடவுச்சொல் குறைந்தது 6 எழுத்துகள் இருக்க வேண்டும்.',
    togglePasswordVisibility: 'கடவுச்சொல் காட்சியை மாற்று',
    authenticating: 'சரிபார்க்கிறது...',
    signInAsAdmin: 'நிர்வாகியாக உள்நுழைக',
    backToUserLogin: 'பயனர் உள்நுழைவுக்குத் திரும்பு',
    toastLoginSuccess: 'நிர்வாக உள்நுழைவு வெற்றி!',
    toastLoginFailed: 'நிர்வாக உள்நுழைவு தோல்வியடைந்தது. உங்கள் விவரங்களைச் சரிபார்க்கவும்.',
  },
};

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
  private themeService = inject(ThemeService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID) as object;

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

  // ── Language ───────────────────────────────────────────────────────────────
  currentLang: Lang = 'en';

  get t() {
    return this.currentLang === 'en' ? TRANSLATIONS.en : TRANSLATIONS.ta;
  }

  toggleLanguage(): void {
    this.currentLang = this.currentLang === 'en' ? 'ta' : 'en';
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('landing-lang', this.currentLang);
    }
  }

  private loadLanguage(): void {
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem('landing-lang') as Lang | null;
      if (saved === 'en' || saved === 'ta') this.currentLang = saved;
    }
  }

  adminLoginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    this.themeService.applyDefaultIfUnset('dark');
    this.loadLanguage();
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
        this.toastService.success(this.t.toastLoginSuccess);
        this.router.navigate(['/admin/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        this.toastService.error(err?.error?.message || this.t.toastLoginFailed);
      },
    });
  }

  get f() {
    return this.adminLoginForm.controls;
  }
}
