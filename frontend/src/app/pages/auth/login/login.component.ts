import {
  Component,
  inject,
  signal,
  HostBinding,
  PLATFORM_ID,
  OnInit,
  AfterViewInit,
  OnDestroy,
  NgZone,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { A11yModule } from '@angular/cdk/a11y';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService } from '../../../core/services/theme.service';
import { environment } from '../../../../environments/environment';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
  of,
  takeUntil,
} from 'rxjs';

type Lang = 'en' | 'ta';

const TRANSLATIONS = {
  en: {
    switchToTamil: 'Switch to Tamil',
    switchToEnglish: 'Switch to English',
    switchToLight: 'Switch to light mode',
    switchToDark: 'Switch to dark mode',
    backToHome: 'Back to home',
    headlinePre: 'Welcome back!',
    headlineSub: 'Reconnect with your Tamil community.',
    brandDesc: 'Sign in to reconnect with your communities, catch up on discussions, and keep the conversation going.',
    feature1: '10,000+ active members across the UK',
    feature2: '500+ communities across every topic',
    feature3: 'Free to Join — No Credit Card Required',
    avatarRowText: 'Join thousands already connected',
    cardTitle: 'Sign in to your account',
    cardSubtitle: '',
    usernameLabel: 'User Name',
    usernamePlaceholder: 'User name',
    errIdentifierRequired: 'Username is required.',
    errIdentifierInvalid: 'Please enter a valid username.',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    errPasswordRequired: 'Password is required.',
    errPasswordMinlength: 'Password must be at least 6 characters.',
    togglePasswordVisibility: 'Toggle password visibility',
    forgotPassword: 'Forgot password?',
    signingIn: 'Signing in...',
    signIn: 'Sign In',
    orContinueWith: 'or continue with',
    noAccount: "Don't have an account?",
    createOne: 'Create one free',
    googleSigningIn: 'Signing in with Google...',
    modalTitle: 'Choose a Username',
    modalDesc: 'Your suggested username is already taken. Pick a unique username to complete sign-in.',
    modalUsernameLabel: 'Username',
    modalClose: 'Close',
    checkingAvailability: 'Checking availability...',
    usernameTaken: 'Username already taken. Please choose another.',
    usernameAvailable: 'Username is available',
    creatingAccount: 'Creating account...',
    confirmUsername: 'Confirm Username',
    toastAdminLoginSuccess: 'Admin login successful! Welcome back.',
    toastLoginSuccess: 'Login successful! Welcome back.',
    toastLoginFailed: 'Login failed. Please check your credentials.',
    toastGoogleAdminSuccess: 'Admin login successful! Welcome back.',
    toastGoogleSuccess: 'Signed in with Google! Welcome back.',
    toastGoogleAccountCreated: 'Account created! Welcome to Community.',
    toastGoogleUnavailable: 'Google sign-in is currently unavailable. Please try signing in manually.',
    toastGoogleSomethingWrong: 'Something went wrong. Please close this dialog and try again.',
  },
  ta: {
    switchToTamil: 'தமிழுக்கு மாறவும்',
    switchToEnglish: 'ஆங்கிலத்திற்கு மாறவும்',
    switchToLight: 'லைட் மோடிற்கு மாறவும்',
    switchToDark: 'டார்க் மோடிற்கு மாறவும்',
    backToHome: 'முகப்புக்குச் செல்ல',
    headlinePre: 'மீண்டும் வரவேற்கிறோம்!',
    headlineSub: 'உங்கள் தமிழ் சமூகத்துடன் மீண்டும் இணையுங்கள்.',
    brandDesc: 'உங்கள் சமூகங்களுடன் மீண்டும் இணைந்து, விவாதங்களைப் பின்தொடர, உள்நுழையுங்கள்.',
    feature1: 'UK முழுவதும் 10,000+ செயலில் உள்ள உறுப்பினர்கள்',
    feature2: 'ஒவ்வொரு தலைப்பிலும் 500+ சமூகங்கள்',
    feature3: 'இலவசமாக இணையுங்கள் — கிரெடிட் கார்டு தேவையில்லை',
    avatarRowText: 'ஆயிரக்கணக்கானோர் ஏற்கனவே இணைந்துள்ளனர்',
    cardTitle: 'உங்கள் கணக்கில் உள்நுழைக',
    cardSubtitle: '',
    usernameLabel: 'பயனர் பெயர்',
    usernamePlaceholder: 'பயனர் பெயர்',
    errIdentifierRequired: 'பயனர் பெயர்.',
    errIdentifierInvalid: 'சரியான பயனர் பெயர் உள்ளிடவும்.',
    passwordLabel: 'கடவுச்சொல்',
    passwordPlaceholder: 'உங்கள் கடவுச்சொல்லை உள்ளிடவும்',
    errPasswordRequired: 'கடவுச்சொல் தேவை.',
    errPasswordMinlength: 'கடவுச்சொல் குறைந்தது 6 எழுத்துகள் இருக்க வேண்டும்.',
    togglePasswordVisibility: 'கடவுச்சொல் காட்சியை மாற்று',
    forgotPassword: 'கடவுச்சொல் மறந்துவிட்டதா?',
    signingIn: 'உள்நுழைகிறது...',
    signIn: 'உள்நுழைக',
    orContinueWith: 'அல்லது இதன் மூலம் தொடரவும்',
    noAccount: 'கணக்கு இல்லையா?',
    createOne: 'இலவசமாக ஒன்றை உருவாக்குங்கள்',
    googleSigningIn: 'Google மூலம் உள்நுழைகிறது...',
    modalTitle: 'பயனர் பெயரைத் தேர்ந்தெடுக்கவும்',
    modalDesc: 'உங்கள் பரிந்துரைக்கப்பட்ட பயனர் பெயர் ஏற்கனவே எடுக்கப்பட்டுள்ளது. உள்நுழைவை முடிக்க தனித்துவமான பயனர் பெயரைத் தேர்ந்தெடுக்கவும்.',
    modalUsernameLabel: 'பயனர் பெயர்',
    modalClose: 'மூடு',
    checkingAvailability: 'கிடைக்கிறதா என சரிபார்க்கிறது...',
    usernameTaken: 'பயனர் பெயர் ஏற்கனவே உள்ளது. வேறு ஒன்றைத் தேர்ந்தெடுக்கவும்.',
    usernameAvailable: 'பயனர் பெயர் கிடைக்கிறது',
    creatingAccount: 'கணக்கு உருவாக்கப்படுகிறது...',
    confirmUsername: 'பயனர் பெயரை உறுதிசெய்',
    toastAdminLoginSuccess: 'நிர்வாக உள்நுழைவு வெற்றி! மீண்டும் வரவேற்கிறோம்.',
    toastLoginSuccess: 'உள்நுழைவு வெற்றி! மீண்டும் வரவேற்கிறோம்.',
    toastLoginFailed: 'உள்நுழைவு தோல்வியடைந்தது. உங்கள் விவரங்களைச் சரிபார்க்கவும்.',
    toastGoogleAdminSuccess: 'நிர்வாக உள்நுழைவு வெற்றி! மீண்டும் வரவேற்கிறோம்.',
    toastGoogleSuccess: 'Google மூலம் உள்நுழைந்தீர்கள்! மீண்டும் வரவேற்கிறோம்.',
    toastGoogleAccountCreated: 'கணக்கு உருவாக்கப்பட்டது! Community-க்கு வரவேற்கிறோம்.',
    toastGoogleUnavailable: 'Google உள்நுழைவு தற்போது கிடைக்கவில்லை. கைமுறையாக உள்நுழைய முயற்சிக்கவும்.',
    toastGoogleSomethingWrong: 'ஏதோ தவறு நடந்தது. இந்த சாளரத்தை மூடிவிட்டு மீண்டும் முயற்சிக்கவும்.',
  },
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    A11yModule,
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, AfterViewInit, OnDestroy {
  private fb           = inject(FormBuilder);
  private authService  = inject(AuthService);
  private toastService = inject(ToastService);
  private themeService = inject(ThemeService);
  private router       = inject(Router);
  private platformId   = inject(PLATFORM_ID) as object;
  private ngZone       = inject(NgZone);

  loading      = signal(false);
  showPassword = signal(false);

  // ── Google OAuth signals ──────────────────────────────────────────────────
  googleLoading         = signal(false);
  googleNeedsUsername   = signal(false);
  usernameModalValue    = signal('');
  usernameModalChecking = signal(false);
  usernameModalTaken    = signal(false);
  private googleCredential     = signal('');
  private googleBtnInitialized = false;
  private googleBtnEl: HTMLElement | null = null;
  private googleBtnResizeObserver?: ResizeObserver;

  /**
   * True only when a real (non-placeholder) Google Client ID is present.
   * When false the OR divider and Google button are hidden entirely.
   */
  get googleConfigured(): boolean {
    const id = environment.googleClientId;
    return !!id && id !== 'YOUR_GOOGLE_CLIENT_ID';
  }

  // ── Theme — delegates to the shared ThemeService (see theme.service.ts);
  // this page still binds its own host attribute since _auth-shared.scss's
  // --auth-* palette is :host[data-theme]-scoped. ────────────────────────
  get currentTheme(): 'dark' | 'light' { return this.themeService.theme(); }

  @HostBinding('attr.data-theme')
  get theme(): string { return this.currentTheme; }

  toggleTheme(): void {
    this.themeService.toggleTheme();
    if (this.googleBtnEl) {
      this.renderGoogleButton(this.googleBtnEl);
    }
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

  private destroy$            = new Subject<void>();
  private usernameModalCheck$ = new Subject<string>();

  ngOnInit(): void {
    this.themeService.applyDefaultIfUnset('dark');
    this.loadLanguage();

    // Google username modal — debounced availability check
    this.usernameModalCheck$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(username => {
        if (!username || username.length < 3) return of(null);
        return this.authService.checkUsername(username).pipe(catchError(() => of(null)));
      }),
      takeUntil(this.destroy$),
    ).subscribe((res: any) => {
      this.usernameModalChecking.set(false);
      this.usernameModalTaken.set(!!res?.exists);
    });
  }

  ngAfterViewInit(): void {
    this.initGoogleButton();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.googleBtnResizeObserver?.disconnect();
  }

  private usernameOrEmailValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) return null;
    const emailRegex    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const usernameRegex = /^[a-zA-Z0-9._\-஀-௿]+$/;
    return emailRegex.test(value) || usernameRegex.test(value) ? null : { invalidUsernameOrEmail: true };
  }

  forgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }

  loginForm: FormGroup = this.fb.group({
    identifier: ['', [Validators.required, this.usernameOrEmailValidator.bind(this)]],
    password:   ['', [Validators.required, Validators.minLength(6)]],
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
        if (resp.user.roleLevel >= 50) {
          this.router.navigate(['/admin/dashboard']);
          this.toastService.success(this.t.toastAdminLoginSuccess);
          return;
        }
        this.loading.set(false);
        this.toastService.success(this.t.toastLoginSuccess);
        this.router.navigate(['/user/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        this.toastService.error(err?.error?.message || this.t.toastLoginFailed);
      },
    });
  }

  get f() {
    return this.loginForm.controls;
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────

  initGoogleButton(): void {
    if (this.googleBtnInitialized) return;
    if (!isPlatformBrowser(this.platformId)) return;

    if (!this.googleConfigured) {
      console.warn(
        '[Google OAuth] googleClientId is not set.\n' +
        '  → Set it in frontend/src/environments/environment.ts\n' +
        '  → Set GOOGLE_CLIENT_ID in backend/.env\n' +
        '  → See Google Cloud Console → APIs & Services → Credentials'
      );
      return;
    }

    const tryRender = () => {
      const win = window as any;
      if (!win.google?.accounts?.id) {
        setTimeout(tryRender, 200);
        return;
      }
      const container = document.getElementById('google-btn-login');
      if (!container) {
        setTimeout(tryRender, 100);
        return;
      }
      this.googleBtnInitialized = true;
      this.googleBtnEl = container;
      win.google.accounts.id.initialize({
        client_id: environment.googleClientId,
        callback: (response: any) => {
          this.ngZone.run(() => this.handleGoogleCredential(response.credential));
        },
        ux_mode: 'popup',
      });
      // GSI renders at a fixed pixel width and doesn't reflow on its own, and
      // a synchronous offsetWidth read here can race layout (container-query
      // resolution, font load) and land on the `|| 420` fallback. Let
      // ResizeObserver drive every render instead — it always reports a
      // settled post-layout size, including its guaranteed initial callback,
      // so there's no separate "first render" path to get wrong.
      if (typeof ResizeObserver !== 'undefined') {
        const observeTarget = (container.closest('.auth-card') as HTMLElement) ?? container;
        let debounce: ReturnType<typeof setTimeout> | undefined;
        this.googleBtnResizeObserver = new ResizeObserver(() => {
          clearTimeout(debounce);
          debounce = setTimeout(() => this.renderGoogleButton(container), 60);
        });
        this.googleBtnResizeObserver.observe(observeTarget);
      } else {
        this.renderGoogleButton(container);
      }
    };

    setTimeout(tryRender, 0);
  }

  // GSI's own `renderButton` has no live theme prop — swapping app themes
  // means clearing the container and redrawing with the matching GSI theme.
  private renderGoogleButton(container: HTMLElement): void {
    const win = window as any;
    if (!win.google?.accounts?.id) return;
    container.innerHTML = '';
    // `container` is a flex item with no explicit width of its own — once
    // cleared it has no content, so its offsetWidth reads ~0 and silently
    // hits the `|| 420` fallback every render. Measure the wrapper
    // (`.google-btn-container`, which does have a real width) instead.
    const measureEl = container.parentElement ?? container;
    const btnWidth = Math.min(measureEl.clientWidth || 420, 420);
    // 'large' is the only GSI size that reliably keeps the G logo visible —
    // 'medium'/'small' silently drop it once width gets tight. The actual
    // fit comes from `width` tracking the card's real available space.
    win.google.accounts.id.renderButton(container, {
      type:  'standard',
      theme: this.currentTheme === 'dark' ? 'filled_black' : 'outline',
      size:  'large',
      text:  btnWidth < 230 ? 'signin' : 'continue_with',
      shape: 'rectangular',
      width: btnWidth,
    });
  }

  handleGoogleCredential(credential: string): void {
    this.googleLoading.set(true);
    this.authService.googleInitiate({ credential }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.googleLoading.set(false);
        if (res.needsUsername) {
          this.googleCredential.set(credential);
          this.usernameModalValue.set(res.suggestedUsername ?? '');
          this.usernameModalTaken.set(false);
          this.googleNeedsUsername.set(true);
        } else {
          if (res.user?.roleLevel >= 50) {
            this.router.navigate(['/admin/dashboard']);
            this.toastService.success(this.t.toastGoogleAdminSuccess);
          } else {
            this.toastService.success(this.t.toastGoogleSuccess);
            this.router.navigate(['/user/dashboard']);
          }
        }
      },
      error: (err: any) => {
        this.googleLoading.set(false);
        // errorInterceptor handles 4xx toasts; show one manually for 5xx / network errors
        if (!err?.status || err.status >= 500) {
          this.toastService.error(this.t.toastGoogleUnavailable);
        }
      },
    });
  }

  onGoogleUsernameInput(value: string): void {
    const clean = value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
    this.usernameModalValue.set(clean);
    this.usernameModalTaken.set(false);
    if (clean.length >= 3) {
      this.usernameModalChecking.set(true);
      this.usernameModalCheck$.next(clean);
    } else {
      this.usernameModalChecking.set(false);
    }
  }

  onGoogleComplete(): void {
    const username = this.usernameModalValue();
    if (username.length < 3 || this.usernameModalTaken() || this.usernameModalChecking()) return;

    this.googleLoading.set(true);
    this.authService.googleComplete({ credential: this.googleCredential(), username })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.googleLoading.set(false);
          this.googleNeedsUsername.set(false);
          if (res.user?.roleLevel >= 50) {
            this.router.navigate(['/admin/dashboard']);
            this.toastService.success(this.t.toastGoogleAdminSuccess);
          } else {
            this.toastService.success(this.t.toastGoogleAccountCreated);
            this.router.navigate(['/user/dashboard']);
          }
        },
        error: (err: any) => {
          this.googleLoading.set(false);
          const msg: string = err?.error?.message ?? '';
          if (msg.toLowerCase().includes('username')) {
            this.usernameModalTaken.set(true);
          }
          // errorInterceptor handles 4xx toasts; handle 5xx manually
          if (!err?.status || err.status >= 500) {
            this.toastService.error(this.t.toastGoogleSomethingWrong);
          }
        },
      });
  }

  closeGoogleModal(): void {
    this.googleNeedsUsername.set(false);
    this.googleCredential.set('');
    this.usernameModalValue.set('');
    this.usernameModalChecking.set(false);
    this.usernameModalTaken.set(false);
  }
}
