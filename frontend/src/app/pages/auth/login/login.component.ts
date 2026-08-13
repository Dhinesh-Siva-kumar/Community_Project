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

  // ── Theme ──────────────────────────────────────────────────────────────────
  currentTheme: 'dark' | 'light' = 'dark';

  @HostBinding('attr.data-theme')
  get theme(): string { return this.currentTheme; }

  toggleTheme(): void {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('landing-theme', this.currentTheme);
    }
    if (this.googleBtnEl) {
      this.renderGoogleButton(this.googleBtnEl);
    }
  }

  private loadTheme(): void {
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem('landing-theme') as 'dark' | 'light' | null;
      if (saved) this.currentTheme = saved;
    }
  }

  private destroy$            = new Subject<void>();
  private usernameModalCheck$ = new Subject<string>();

  ngOnInit(): void {
    this.loadTheme();

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
    const usernameRegex = /^[a-zA-Z0-9._\-]+$/;
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
            this.toastService.success('Admin login successful! Welcome back.');
          } else {
            this.toastService.success('Signed in with Google! Welcome back.');
            this.router.navigate(['/user/dashboard']);
          }
        }
      },
      error: (err: any) => {
        this.googleLoading.set(false);
        // errorInterceptor handles 4xx toasts; show one manually for 5xx / network errors
        if (!err?.status || err.status >= 500) {
          this.toastService.error('Google sign-in is currently unavailable. Please try signing in manually.');
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
            this.toastService.success('Admin login successful! Welcome back.');
          } else {
            this.toastService.success('Account created! Welcome to Community.');
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
            this.toastService.error('Something went wrong. Please close this dialog and try again.');
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
