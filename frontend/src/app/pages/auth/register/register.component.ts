import {
  Component,
  ElementRef,
  inject,
  NgZone,
  QueryList,
  signal,
  computed,
  ViewChildren,
  HostBinding,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Country, UserRegister } from '../../../core/models';
import { environment } from '../../../../environments/environment';
import { getPhoneRule } from '../../../shared/utils/phone';
import {
  debounceTime,
  switchMap,
  map,
  catchError,
  of,
  distinctUntilChanged,
  Subject,
  takeUntil,
  tap,
} from 'rxjs';
import {
  SearchableSelectComponent,
  SelectOption,
} from '../../../shared/components/searchable-select/searchable-select.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    SearchableSelectComponent,
  ],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent {
  registerForm!: FormGroup;
  otpForm!: FormGroup;

  loading             = signal(false);
  otpError            = signal(false);
  showPassword        = signal(false);
  usernameChecking    = signal(false);
  devOtp              = signal<string | null>(null);
  otpCountdown        = signal('5:00');
  resendCooldown      = signal(0);
  tooManyAttemptsAlert = signal(false);
  /** 'verifying' while OTP call is in-flight; 'registering' while register call is in-flight */
  registeringStage    = signal<'verifying' | 'registering' | ''>('');
  showSuccessModal    = signal(false);
  mobileAlreadyExists = signal(false);

  // ── Google OAuth signals ──────────────────────────────────────────────────
  googleLoading           = signal(false);
  googleNeedsUsername     = signal(false);
  googleSuggestedUsername = signal('');
  usernameModalValue      = signal('');
  usernameModalChecking   = signal(false);
  usernameModalTaken      = signal(false);
  private googleCredential  = signal('');
  private googleCountryId   = signal<number | null>(null);
  private googleBtnInitialized = false;

  /**
   * True only when a real (non-placeholder) Google Client ID is present.
   * When false the OR divider and Google button are hidden entirely.
   */
  get googleConfigured(): boolean {
    const id = environment.googleClientId;
    return !!id && id !== 'YOUR_GOOGLE_CLIENT_ID';
  }

  private countdownInterval?: ReturnType<typeof setInterval>;
  private resendInterval?:    ReturnType<typeof setInterval>;

  /** Updated by password valueChanges so computed() can track it. */
  private passwordValue = signal('');

  passwordStrength = computed(() => {
    const pw = this.passwordValue();
    const criteria = {
      minLength: pw.length >= 8,
      uppercase: /[A-Z]/.test(pw),
      lowercase: /[a-z]/.test(pw),
      number:    /[0-9]/.test(pw),
      special:   /[^A-Za-z0-9]/.test(pw),
    };
    return {
      ...criteria,
      score: Object.values(criteria).filter(Boolean).length,
    };
  });

  countries: Country[] = [];
  countryOptions: SelectOption[] = [];
  step = signal<'form' | 'otp'>('form');

  private destroy$  = new Subject<void>();
  private usernameModalCheck$ = new Subject<string>();
  private platformId = inject(PLATFORM_ID) as object;
  private ngZone     = inject(NgZone);

  @ViewChildren('otpBox') otpBoxes!: QueryList<ElementRef<HTMLInputElement>>;

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

  get selectedCountry(): Country | undefined {
    const id = this.registerForm?.getRawValue().countryID;
    return this.countries.find(c => c.id == id);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  constructor(
    private fb:           FormBuilder,
    private authService:  AuthService,
    private toastService: ToastService,
    private router:       Router,
  ) {}

  ngOnInit() {
    this.loadTheme();
    this.initializeForm();
    this.loadCountries();

    // Re-run mobile validation whenever country changes
    this.registerForm.get('countryID')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.onCountryChange());

    // Keep passwordValue signal in sync for computed strength
    this.registerForm.get('password')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.passwordValue.set(v ?? ''));

    // Clear the "mobile already exists" flag as soon as the user edits the field
    this.registerForm.get('mobile')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.mobileAlreadyExists.set(false));

    // Async username availability check
    this.registerForm.get('userName')?.valueChanges.pipe(
      map(value => (value ?? '').replace(/[^a-zA-Z0-9_]/g, '')),
      tap(() => this.usernameChecking.set(false)),
      debounceTime(500),
      distinctUntilChanged(),
      tap(username => {
        if (username && username.length >= 3) {
          this.usernameChecking.set(true);
        }
      }),
      switchMap(username => {
        if (!username || username.length < 3) return of(null);
        return this.authService.checkUsername(username).pipe(
          catchError(() => of(null)),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe((res: any) => {
      this.usernameChecking.set(false);
      const control = this.registerForm.get('userName');
      if (!control) return;
      // Preserve existing sync errors; only manage usernameTaken key
      const existing = { ...(control.errors ?? {}) };
      delete existing['usernameTaken'];
      if (res?.exists) {
        control.setErrors({ ...existing, usernameTaken: true });
      } else {
        control.setErrors(Object.keys(existing).length ? existing : null);
      }
    });

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

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopCountdown();
    this.stopResendCooldown();
  }

  ngAfterViewInit() {
    if (this.step() === 'otp') {
      setTimeout(() => this.otpBoxes?.first?.nativeElement.focus());
    }
    this.initGoogleButton();
  }

  // ── Form setup ─────────────────────────────────────────────────────────────

  initializeForm() {
    this.registerForm = this.fb.group(
      {
        userName:        ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20), Validators.pattern(/^[a-zA-Z0-9_]+$/)]],
        displayName:     ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50), Validators.pattern(/^[A-Za-z][A-Za-z '\-]*$/)]],
        countryID:       [null, Validators.required],
        mobile:          ['', [Validators.required, Validators.maxLength(15), this.mobileValidator()]],
        password:        ['', [Validators.required, Validators.minLength(8), Validators.maxLength(64), this.strongPasswordValidator()]],
        confirmPassword: ['', [Validators.required, Validators.maxLength(64)]],
      },
      { validators: this.passwordMatchValidator },
    );

    this.otpForm = this.fb.group({
      otp: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],
    });
  }

  // ── Validators ─────────────────────────────────────────────────────────────

  strongPasswordValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value: string = control.value ?? '';
      if (!value) return null;
      const errors: ValidationErrors = {};
      if (value.length < 8)            errors['minLength'] = true;
      if (!/[A-Z]/.test(value))        errors['uppercase'] = true;
      if (!/[a-z]/.test(value))        errors['lowercase'] = true;
      if (!/[0-9]/.test(value))        errors['number']    = true;
      if (!/[^A-Za-z0-9]/.test(value)) errors['special']   = true;
      return Object.keys(errors).length ? errors : null;
    };
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password        = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    if (!password || !confirmPassword) return null;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  mobileValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      // Strip to digits only; empty field is handled by Validators.required
      const digits = (control.value ?? '').replace(/\D/g, '');
      if (!digits) return null;

      const parent = control.parent;
      if (!parent || !this.countries.length) return null;

      const countryId = parent.get('countryID')?.value;
      if (!countryId) return null;

      const country = this.countries.find(c => c.id == countryId);
      if (!country) return null;

      const rule  = getPhoneRule(country.dial_code);
      const valid =
        digits.length >= rule.minLen &&
        digits.length <= rule.maxLen &&
        (rule.pattern ? rule.pattern.test(digits) : true);

      // phoneInvalid carries the human-readable hint from the rule table
      return valid ? null : { phoneInvalid: rule.hint };
    };
  }

  // ── Input helpers ──────────────────────────────────────────────────────────

  sanitizeUsername(event: any) {
    const value = (event.target.value as string).replace(/[^a-zA-Z0-9_]/g, '');
    event.target.value = value;
    this.registerForm.get('userName')?.setValue(value, { emitEvent: false });
  }

  sanitizeMobile(event: any) {
    const value = (event.target.value as string).replace(/[^0-9]/g, '');
    event.target.value = value;
    this.registerForm.get('mobile')?.setValue(value, { emitEvent: false });
  }

  trimDisplayName() {
    const ctrl = this.registerForm.get('displayName');
    if (ctrl) ctrl.setValue((ctrl.value ?? '').trim(), { emitEvent: false });
  }

  onCountryChange() {
    this.registerForm.get('mobile')?.updateValueAndValidity();
  }

  getFlagEmoji(countryCode: string): string {
    return countryCode
      .toUpperCase()
      .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)));
  }

  loadCountries() {
    this.authService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.countries = res.data;
        this.countryOptions = this.countries.map(c => ({
          value: c.id,
          label: `${c.flag_emoji || this.getFlagEmoji(c.iso2)} ${c.dial_code}`,
        }));
        const defaultCountry = this.countries.find(c => c.name === 'India');
        if (defaultCountry) {
          this.registerForm.patchValue({ countryID: defaultCountry.id });
          this.registerForm.get('mobile')?.updateValueAndValidity();
        }
      },
      error: () => this.toastService.error('Failed to load countries'),
    });
  }

  get f1() {
    return this.registerForm.controls;
  }

  // ── Submit flow ────────────────────────────────────────────────────────────

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.mobileAlreadyExists.set(false);
    const mobile = this.getFullPhoneNumber();

    this.authService.sendOtp({ mobile }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.loading.set(false);
        this.toastService.success('OTP sent successfully');
        if (res?.devOtp) this.devOtp.set(res.devOtp);
        this.step.set('otp');
        this.startCountdown();
        this.startResendCooldown();
        this.registerForm.disable();
        setTimeout(() => this.otpBoxes?.first?.nativeElement.focus(), 50);
      },
      error: (err: any) => {
        this.loading.set(false);
        if (err?.status === 409) {
          // Mobile number is taken — clear the field and show inline error
          this.registerForm.get('mobile')?.setValue('');
          this.registerForm.get('mobile')?.markAsTouched();
          this.mobileAlreadyExists.set(true);
        } else {
          this.toastService.error(err?.error?.message || 'Failed to send OTP');
        }
      },
    });
  }

  getFullPhoneNumber(): string {
    const raw     = this.registerForm.getRawValue();
    const country = this.countries.find(c => c.id == raw.countryID);
    if (!country) return '';
    return `${country.dial_code}${raw.mobile}`;
  }

  verifyOtp(): void {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      this.otpError.set(true);
      return;
    }

    this.loading.set(true);
    this.registeringStage.set('verifying');
    this.otpError.set(false);
    const mobile = this.getFullPhoneNumber();
    const otp    = this.otpForm.value.otp;

    this.authService.verifyOtp({ mobile, otp }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        // Safety net: backend returns 400 on failure, but guard here too
        if (!res?.success) {
          this.loading.set(false);
          this.otpError.set(true);
          this.toastService.error(res?.message || 'Invalid OTP');
          return;
        }
        this.registerUser();
      },
      error: (err: any) => {
        // errorInterceptor already shows the toast — only update local state
        this.loading.set(false);
        this.registeringStage.set('');
        const serverMsg: string = err?.error?.message ?? '';
        if (serverMsg.toLowerCase().includes('too many')) {
          // Full reset — start a completely fresh registration attempt
          this.stopCountdown();
          this.stopResendCooldown();
          this.registerForm.enable();
          this.registerForm.reset();
          this.otpForm.reset();
          this.devOtp.set(null);
          this.otpDigits = ['', '', '', '', '', ''];
          const defaultCountry = this.countries.find(c => c.name === 'India');
          if (defaultCountry) {
            this.registerForm.patchValue({ countryID: defaultCountry.id });
          }
          this.otpError.set(false);
          this.tooManyAttemptsAlert.set(true);
          this.step.set('form');
        } else {
          this.otpError.set(true);
        }
      },
    });
  }

  registerUser() {
    const raw     = this.registerForm.getRawValue();
    const payload = this.mapToPayload(raw);
    this.registeringStage.set('registering');

    this.authService.register(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.loading.set(false);
        this.registeringStage.set('');
        this.showSuccessModal.set(true);
        setTimeout(() => this.router.navigate(['/user/dashboard']), 3000);
      },
      error: (err) => {
        this.loading.set(false);
        this.registeringStage.set('');
        this.toastService.error(err?.error?.message || 'Registration failed');
      },
    });
  }

  private mapToPayload(raw: any): UserRegister {
    return {
      user_name:    raw.userName,
      display_name: raw.displayName,
      phone_no:     this.getFullPhoneNumber(),
      password:     raw.password,
      country_id:   raw.countryID,
    };
  }

  // ── Countdown timer ────────────────────────────────────────────────────────

  private startCountdown(): void {
    this.stopCountdown();
    let seconds = 5 * 60;
    this.otpCountdown.set('5:00');
    this.countdownInterval = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        this.otpCountdown.set('0:00');
        this.stopCountdown();
        return;
      }
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      this.otpCountdown.set(`${m}:${s.toString().padStart(2, '0')}`);
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownInterval !== undefined) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = undefined;
    }
  }

  // ── Resend OTP cooldown ─────────────────────────────────────────────────────

  private startResendCooldown(): void {
    this.stopResendCooldown();
    this.resendCooldown.set(30);
    this.resendInterval = setInterval(() => {
      const current = this.resendCooldown();
      if (current <= 1) {
        this.resendCooldown.set(0);
        this.stopResendCooldown();
      } else {
        this.resendCooldown.set(current - 1);
      }
    }, 1000);
  }

  private stopResendCooldown(): void {
    if (this.resendInterval !== undefined) {
      clearInterval(this.resendInterval);
      this.resendInterval = undefined;
    }
  }

  onResendOtp(): void {
    if (this.resendCooldown() > 0) return;
    const mobile = this.getFullPhoneNumber();
    this.authService.sendOtp({ mobile }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.toastService.success('OTP resent successfully');
        if (res?.devOtp) this.devOtp.set(res.devOtp);
        this.otpError.set(false);
        this.clearOtpBoxes();
        this.startCountdown();
        this.startResendCooldown();
        setTimeout(() => this.otpBoxes?.first?.nativeElement.focus(), 50);
      },
      error: () => { /* errorInterceptor handles toast */ },
    });
  }

  // ── OTP box helpers ────────────────────────────────────────────────────────

  otpDigits: string[] = ['', '', '', '', '', ''];

  onOtpInput(event: Event, index: number): void {
    const input           = event.target as HTMLInputElement;
    const val             = input.value.replace(/[^0-9]/g, '');
    input.value           = val.slice(-1);
    this.otpDigits[index] = input.value;
    this.syncOtpFormValue();
    this.otpError.set(false);
    if (input.value && index < 5) {
      this.otpBoxes.toArray()[index + 1].nativeElement.focus();
    }
  }

  onOtpKeydown(event: KeyboardEvent, index: number): void {
    const input = event.target as HTMLInputElement;
    if (event.key === 'Backspace') {
      if (!input.value && index > 0) {
        const boxes = this.otpBoxes.toArray();
        boxes[index - 1].nativeElement.focus();
        boxes[index - 1].nativeElement.value = '';
        this.otpDigits[index - 1] = '';
        this.syncOtpFormValue();
      } else {
        this.otpDigits[index] = '';
        this.syncOtpFormValue();
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      this.otpBoxes.toArray()[index - 1].nativeElement.focus();
    } else if (event.key === 'ArrowRight' && index < 5) {
      this.otpBoxes.toArray()[index + 1].nativeElement.focus();
    }
  }

  onOtpPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') ?? '';
    const digits = pasted.replace(/[^0-9]/g, '').slice(0, 6).split('');
    const boxes  = this.otpBoxes.toArray();
    digits.forEach((d, i) => {
      this.otpDigits[i] = d;
      boxes[i].nativeElement.value = d;
    });
    this.syncOtpFormValue();
    boxes[Math.min(digits.length, 5)].nativeElement.focus();
  }

  private syncOtpFormValue(): void {
    this.otpForm.get('otp')!.setValue(this.otpDigits.join(''));
  }

  clearOtpBoxes(): void {
    this.otpDigits = ['', '', '', '', '', ''];
    this.otpForm.get('otp')!.setValue('');
    setTimeout(() => {
      const boxes = this.otpBoxes?.toArray();
      if (boxes?.length) {
        boxes.forEach(b => (b.nativeElement.value = ''));
        boxes[0].nativeElement.focus();
      }
    }, 0);
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────

  initGoogleButton(): void {
    if (this.googleBtnInitialized) return;
    if (!isPlatformBrowser(this.platformId)) return;

    // Skip silently if not configured — `googleConfigured` hides the button in HTML
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
      const container = document.getElementById('google-btn-container');
      if (!container) {
        setTimeout(tryRender, 100);
        return;
      }
      this.googleBtnInitialized = true;
      win.google.accounts.id.initialize({
        client_id: environment.googleClientId,
        callback: (response: any) => {
          this.ngZone.run(() => this.handleGoogleCredential(response.credential));
        },
        ux_mode: 'popup',
      });
      const btnWidth = Math.min(container.offsetWidth || 420, 420);
      win.google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: btnWidth,
      });
    };

    setTimeout(tryRender, 0);
  }

  handleGoogleCredential(credential: string): void {
    const countryId: number | undefined = this.registerForm.get('countryID')?.value ?? undefined;
    this.googleCountryId.set(countryId ?? null);
    this.googleLoading.set(true);
    this.authService.googleInitiate({ credential, countryId, allowExistingLogin: false }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.googleLoading.set(false);
        if (res.needsUsername) {
          this.googleCredential.set(credential);
          this.googleSuggestedUsername.set(res.suggestedUsername ?? '');
          this.usernameModalValue.set(res.suggestedUsername ?? '');
          this.usernameModalTaken.set(false);
          this.googleNeedsUsername.set(true);
        } else if (!res.isNewUser) {
          // Account already exists — do NOT log them in from the register page
          this.toastService.error('This Google account is already registered. Please sign in instead.');
          setTimeout(() => this.router.navigate(['/auth/login']), 2000);
        } else {
          // Tokens already stored by authService tap — go to dashboard
          this.showSuccessModal.set(true);
          setTimeout(() => this.router.navigate(['/user/dashboard']), 3000);
        }
      },
      error: (err: any) => {
        this.googleLoading.set(false);
        // errorInterceptor handles 4xx toasts; show one manually for 5xx / network errors
        if (!err?.status || err.status >= 500) {
          this.toastService.error('Google sign-in is currently unavailable. Please try the normal registration instead.');
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
    this.authService.googleComplete({ credential: this.googleCredential(), username, countryId: this.googleCountryId() ?? undefined })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.googleLoading.set(false);
          this.googleNeedsUsername.set(false);
          if (!res.isNewUser) {
            this.toastService.error('This Google account is already registered. Please sign in instead.');
            setTimeout(() => this.router.navigate(['/auth/login']), 2000);
          } else {
            this.showSuccessModal.set(true);
            setTimeout(() => this.router.navigate(['/user/dashboard']), 3000);
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
    this.googleCountryId.set(null);
    this.usernameModalValue.set('');
    this.usernameModalChecking.set(false);
    this.usernameModalTaken.set(false);
  }
}
