import {
  Component,
  ElementRef,
  inject,
  signal,
  computed,
  ViewChildren,
  QueryList,
  HostBinding,
  PLATFORM_ID,
  OnInit,
  OnDestroy,
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
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { getPhoneRule } from '../../../shared/utils/phone';
import { computePasswordStrength } from '../../../shared/utils/password-strength';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
  of,
  takeUntil,
  tap,
} from 'rxjs';

function usernameOrEmailValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (!value) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const usernameRegex = /^[a-zA-Z0-9._\-஀-௿]{3,}$/;
  return emailRegex.test(value) || usernameRegex.test(value) ? null : { invalidUsernameOrEmail: true };
}

type Lang = 'en' | 'ta';

const TRANSLATIONS = {
  en: {
    switchToTamil: 'Switch to Tamil',
    switchToEnglish: 'Switch to English',
    switchToLight: 'Switch to light mode',
    switchToDark: 'Switch to dark mode',
    formHeadlinePre: 'Reset your',
    formHeadlineSub: 'password safely.',
    formBrandDesc: 'Find your account, verify your phone, and set a new password. The whole process takes under a minute.',
    formFeature1: 'Instant account lookup by username or email',
    formFeature2: 'OTP sent to your registered phone',
    formFeature3: 'Your account remains secure',
    otpHeadlinePre: 'One last step!',
    otpHeadlineSub: 'Verify your identity.',
    otpBrandDesc: 'Enter the OTP we sent to your phone to confirm your password reset.',
    otpFeature1: 'Check your SMS inbox',
    otpFeature2: 'OTP is valid for 5 minutes only',
    otpFeature3: 'Never share your OTP with anyone',
    cardTitleForm: 'Reset password',
    cardSubtitleForm: 'Find your account to get started',
    cardTitleOtp: 'Verify OTP',
    otpSentTo: 'OTP sent to',
    tooManyAttempts: 'Too many failed attempts. Please start again.',
    dismiss: 'Dismiss',
    identifierLabel: 'Username or Email',
    identifierPlaceholder: 'username or user@email.com',
    errIdentifierRequired: 'Username or email is required.',
    errIdentifierInvalid: 'Please enter a valid username or email address.',
    accountFound: 'Account found',
    accountNotFound: 'No account found with this username or email.',
    phoneLabel: 'Phone Number',
    phonePlaceholder: 'Enter local number',
    phoneHintIdle: 'Enter your username or email above to unlock this field.',
    phoneHintLoading: 'Looking up your account…',
    errPhoneRequired: 'Phone number is required.',
    newPasswordLabel: 'New Password',
    newPasswordPlaceholder: 'At least 8 characters',
    errPasswordRequired: 'Password is required.',
    errPasswordMinlength: 'Password must be at least 8 characters.',
    errPasswordUppercase: 'Add at least one uppercase letter.',
    errPasswordLowercase: 'Add at least one lowercase letter.',
    errPasswordNumber: 'Add at least one number.',
    errPasswordSpecial: 'Add at least one special character.',
    criteriaMinLength: 'At least 8 characters',
    criteriaUppercase: 'Uppercase letter',
    criteriaLowercase: 'Lowercase letter',
    criteriaNumber: 'Number (0–9)',
    criteriaSpecial: 'Special character',
    confirmPasswordLabel: 'Confirm Password',
    confirmPasswordPlaceholder: 'Confirm your new password',
    errConfirmRequired: 'Please confirm your password.',
    errPasswordMismatch: 'Passwords do not match.',
    togglePasswordVisibility: 'Toggle password visibility',
    sendingOtp: 'Sending OTP…',
    sendOtp: 'Send OTP',
    goBackTo: 'Go back to',
    signIn: 'Sign in',
    otpLabel: 'One-Time Password',
    otpDigitAria: (n: number) => `Digit ${n} of 6`,
    otpExpiresIn: 'OTP expires in',
    devOtpLabel: 'Dev OTP',
    otpIncorrect: 'OTP is incorrect. Please try again.',
    verifying: 'Verifying…',
    verifyAndReset: 'Verify & Reset Password',
    resendOtpIn: (s: number) => `Resend OTP in ${s}s`,
    resendOtp: 'Resend OTP',
    toastPasswordReset: 'Password reset! Please sign in with your new password.',
  },
  ta: {
    switchToTamil: 'தமிழுக்கு மாறவும்',
    switchToEnglish: 'ஆங்கிலத்திற்கு மாறவும்',
    switchToLight: 'லைட் மோடிற்கு மாறவும்',
    switchToDark: 'டார்க் மோடிற்கு மாறவும்',
    formHeadlinePre: 'உங்கள் கடவுச்சொல்லை',
    formHeadlineSub: 'பாதுகாப்பாக மீட்டமைக்கவும்.',
    formBrandDesc: 'உங்கள் கணக்கைக் கண்டறிந்து, உங்கள் தொலைபேசியை சரிபார்த்து, புதிய கடவுச்சொல்லை அமைக்கவும். இது ஒரு நிமிடத்திற்குள் முடியும்.',
    formFeature1: 'பயனர் பெயர் அல்லது மின்னஞ்சல் மூலம் உடனடி கணக்கு தேடல்',
    formFeature2: 'உங்கள் பதிவுசெய்யப்பட்ட தொலைபேசிக்கு OTP அனுப்பப்படும்',
    formFeature3: 'உங்கள் கணக்கு பாதுகாப்பாக இருக்கும்',
    otpHeadlinePre: 'கடைசி படி!',
    otpHeadlineSub: 'உங்கள் அடையாளத்தை சரிபார்க்கவும்.',
    otpBrandDesc: 'உங்கள் கடவுச்சொல் மீட்டமைப்பை உறுதிப்படுத்த உங்கள் தொலைபேசிக்கு அனுப்பிய OTP-ஐ உள்ளிடவும்.',
    otpFeature1: 'உங்கள் SMS இன்பாக்ஸைச் சரிபார்க்கவும்',
    otpFeature2: 'OTP 5 நிமிடங்களுக்கு மட்டுமே செல்லுபடியாகும்',
    otpFeature3: 'உங்கள் OTP-ஐ யாருடனும் பகிர வேண்டாம்',
    cardTitleForm: 'கடவுச்சொல்லை மீட்டமைக்கவும்',
    cardSubtitleForm: 'தொடங்க உங்கள் கணக்கைக் கண்டறியவும்',
    cardTitleOtp: 'OTP-ஐ சரிபார்க்கவும்',
    otpSentTo: 'OTP அனுப்பப்பட்டது',
    tooManyAttempts: 'பல தோல்வியுற்ற முயற்சிகள். மீண்டும் தொடங்கவும்.',
    dismiss: 'நிராகரி',
    identifierLabel: 'பயனர் பெயர் அல்லது மின்னஞ்சல்',
    identifierPlaceholder: 'பயனர்பெயர் அல்லது user@email.com',
    errIdentifierRequired: 'பயனர் பெயர் அல்லது மின்னஞ்சல் தேவை.',
    errIdentifierInvalid: 'சரியான பயனர் பெயர் அல்லது மின்னஞ்சல் முகவரியை உள்ளிடவும்.',
    accountFound: 'கணக்கு கிடைத்தது',
    accountNotFound: 'இந்த பயனர் பெயர் அல்லது மின்னஞ்சலுடன் கணக்கு எதுவும் இல்லை.',
    phoneLabel: 'தொலைபேசி எண்',
    phonePlaceholder: 'உள்ளூர் எண்ணை உள்ளிடவும்',
    phoneHintIdle: 'இந்த புலத்தைத் திறக்க மேலே உங்கள் பயனர் பெயர் அல்லது மின்னஞ்சலை உள்ளிடவும்.',
    phoneHintLoading: 'உங்கள் கணக்கைத் தேடுகிறது…',
    errPhoneRequired: 'தொலைபேசி எண் தேவை.',
    newPasswordLabel: 'புதிய கடவுச்சொல்',
    newPasswordPlaceholder: 'குறைந்தது 8 எழுத்துகள்',
    errPasswordRequired: 'கடவுச்சொல் தேவை.',
    errPasswordMinlength: 'கடவுச்சொல் குறைந்தது 8 எழுத்துகள் இருக்க வேண்டும்.',
    errPasswordUppercase: 'குறைந்தது ஒரு பெரிய எழுத்தைச் சேர்க்கவும்.',
    errPasswordLowercase: 'குறைந்தது ஒரு சிறிய எழுத்தைச் சேர்க்கவும்.',
    errPasswordNumber: 'குறைந்தது ஒரு எண்ணைச் சேர்க்கவும்.',
    errPasswordSpecial: 'குறைந்தது ஒரு சிறப்பு எழுத்தைச் சேர்க்கவும்.',
    criteriaMinLength: 'குறைந்தது 8 எழுத்துகள்',
    criteriaUppercase: 'பெரிய எழுத்து',
    criteriaLowercase: 'சிறிய எழுத்து',
    criteriaNumber: 'எண் (0–9)',
    criteriaSpecial: 'சிறப்பு எழுத்து',
    confirmPasswordLabel: 'கடவுச்சொல்லை உறுதிப்படுத்தவும்',
    confirmPasswordPlaceholder: 'உங்கள் புதிய கடவுச்சொல்லை உறுதிப்படுத்தவும்',
    errConfirmRequired: 'உங்கள் கடவுச்சொல்லை உறுதிப்படுத்தவும்.',
    errPasswordMismatch: 'கடவுச்சொற்கள் பொருந்தவில்லை.',
    togglePasswordVisibility: 'கடவுச்சொல் காட்சியை மாற்று',
    sendingOtp: 'OTP அனுப்புகிறது…',
    sendOtp: 'OTP அனுப்பு',
    goBackTo: 'திரும்பிச் செல்லவும்',
    signIn: 'உள்நுழைக',
    otpLabel: 'ஒரு முறை கடவுச்சொல்',
    otpDigitAria: (n: number) => `இலக்கம் ${n} / 6`,
    otpExpiresIn: 'OTP காலாவதியாகும் நேரம்',
    devOtpLabel: 'டெவ் OTP',
    otpIncorrect: 'OTP தவறானது. மீண்டும் முயற்சிக்கவும்.',
    verifying: 'சரிபார்க்கிறது…',
    verifyAndReset: 'சரிபார்த்து கடவுச்சொல்லை மீட்டமைக்கவும்',
    resendOtpIn: (s: number) => `${s} வினாடியில் OTP-ஐ மீண்டும் அனுப்பு`,
    resendOtp: 'OTP-ஐ மீண்டும் அனுப்பு',
    toastPasswordReset: 'கடவுச்சொல் மீட்டமைக்கப்பட்டது! உங்கள் புதிய கடவுச்சொல்லுடன் உள்நுழையவும்.',
  },
};

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent implements OnInit, OnDestroy {
  private fb           = inject(FormBuilder);
  private authService  = inject(AuthService);
  private toastService = inject(ToastService);
  private router       = inject(Router);
  private platformId   = inject(PLATFORM_ID) as object;

  @ViewChildren('otpBox') otpBoxes!: QueryList<ElementRef<HTMLInputElement>>;

  step                 = signal<'form' | 'otp'>('form');
  loading              = signal(false);
  otpError             = signal(false);
  showPassword         = signal(false);
  devOtp               = signal<string | null>(null);
  otpCountdown         = signal('5:00');
  resendCooldown       = signal(0);
  tooManyAttemptsAlert = signal(false);
  maskedPhone          = '';

  /** Debounced lookup state for the username/email field */
  lookupState     = signal<'idle' | 'loading' | 'found' | 'not-found'>('idle');
  foundDialCode   = signal('');
  foundCountryName = signal('');

  /** Locked-in at OTP send time so recomputing never produces a wrong key. */
  private savedPhone      = '';
  private savedIdentifier = '';

  /** Updated by newPassword valueChanges so computed() can track it. */
  private passwordValue = signal('');
  passwordStrength = computed(() => computePasswordStrength(this.passwordValue()));

  private countdownInterval?: ReturnType<typeof setInterval>;
  private resendInterval?:    ReturnType<typeof setInterval>;
  private destroy$            = new Subject<void>();

  otpDigits: string[] = ['', '', '', '', '', ''];

  // ── Forms ────────────────────────────────────────────────────────────────────
  fpForm!: FormGroup;
  otpForm!: FormGroup;

  // ── Theme ────────────────────────────────────────────────────────────────────
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

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadTheme();
    this.loadLanguage();
    this.initForms();
    this.setupLookup();

    this.fpForm.get('newPassword')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.passwordValue.set(v ?? ''));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopCountdown();
    this.stopResendCooldown();
  }

  // ── Form setup ───────────────────────────────────────────────────────────────
  private initForms(): void {
    this.fpForm = this.fb.group(
      {
        usernameOrEmail: ['', [Validators.required, usernameOrEmailValidator]],
        phoneDigits:     [{ value: '', disabled: true }, [Validators.required, this.phoneDigitsValidator()]],
        newPassword:     ['', [Validators.required, Validators.minLength(8), this.strongPasswordValidator()]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator },
    );

    this.otpForm = this.fb.group({
      otp: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],
    });
  }

  // ── Validators ───────────────────────────────────────────────────────────────
  private phoneDigitsValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const digits = (control.value ?? '').replace(/\D/g, '');
      if (!digits) return null;
      const dialCode = this.foundDialCode();
      if (!dialCode) return null;
      const rule  = getPhoneRule(dialCode);
      const valid =
        digits.length >= rule.minLen &&
        digits.length <= rule.maxLen &&
        (rule.pattern ? rule.pattern.test(digits) : true);
      return valid ? null : { phoneInvalid: rule.hint };
    };
  }

  private strongPasswordValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value: string = control.value ?? '';
      if (!value) return null;
      const errors: ValidationErrors = {};
      if (value.length < 8)                errors['minLength'] = true;
      if (!/[A-Z஀-௿]/.test(value))         errors['uppercase'] = true;
      if (!/[a-z஀-௿]/.test(value))         errors['lowercase'] = true;
      if (!/[0-9]/.test(value))            errors['number']    = true;
      if (!/[^A-Za-z0-9஀-௿]/.test(value))  errors['special']   = true;
      return Object.keys(errors).length ? errors : null;
    };
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const pw  = control.get('newPassword')?.value;
    const cpw = control.get('confirmPassword')?.value;
    if (!pw || !cpw) return null;
    return pw === cpw ? null : { passwordMismatch: true };
  }

  // ── Lookup ───────────────────────────────────────────────────────────────────
  private setupLookup(): void {
    this.fpForm.get('usernameOrEmail')?.valueChanges.pipe(
      tap(value => {
        const q = (value ?? '').trim();
        // Immediately reset phone state on every keystroke
        this.foundDialCode.set('');
        this.foundCountryName.set('');
        this.fpForm.get('phoneDigits')?.disable({ emitEvent: false });
        this.lookupState.set(q.length >= 3 ? 'loading' : 'idle');
      }),
      debounceTime(600),
      distinctUntilChanged(),
      switchMap(value => {
        const q = (value ?? '').trim();
        if (q.length < 3) return of(null);
        return this.authService.lookupUser(q).pipe(catchError(() => of(null)));
      }),
      takeUntil(this.destroy$),
    ).subscribe((res: any) => {
      // Guard: if query is now too short (user cleared field during debounce), bail out
      const q = ((this.fpForm.get('usernameOrEmail')?.value) ?? '').trim();
      if (q.length < 3) return;

      if (!res) {
        if (this.lookupState() === 'loading') this.lookupState.set('idle');
        return;
      }
      if (res.found) {
        this.lookupState.set('found');
        this.foundDialCode.set(res.dialCode ?? '');
        this.foundCountryName.set(res.countryName ?? '');
        const phoneCtrl = this.fpForm.get('phoneDigits');
        phoneCtrl?.enable({ emitEvent: false });
        phoneCtrl?.updateValueAndValidity();
      } else {
        this.lookupState.set('not-found');
      }
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  get f()  { return this.fpForm.controls; }
  get fo() { return this.otpForm.controls; }

  private getFullPhone(): string {
    const digits = (this.fpForm.getRawValue().phoneDigits ?? '').replace(/\D/g, '');
    return `${this.foundDialCode()}${digits}`;
  }

  sanitizePhoneDigits(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9]/g, '');
    input.value = value;
    this.fpForm.get('phoneDigits')?.setValue(value, { emitEvent: false });
    this.fpForm.get('phoneDigits')?.updateValueAndValidity();
  }

  // ── Submit — Step 1: Send OTP ────────────────────────────────────────────────
  onSendOtp(): void {
    if (this.fpForm.invalid || this.lookupState() !== 'found') {
      this.fpForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.tooManyAttemptsAlert.set(false);

    const raw         = this.fpForm.getRawValue();
    const phoneNumber = this.getFullPhone();
    const digits      = (raw.phoneDigits ?? '').replace(/\D/g, '');
    const masked      = digits.slice(0, -4).replace(/./g, '*') + digits.slice(-4);
    this.maskedPhone  = `${this.foundDialCode()} ${masked}`;

    // Save both values now — fpForm.disable() will fire valueChanges which
    // clears foundDialCode via the lookup tap; savedPhone/savedIdentifier
    // are the stable source of truth for verify + resend.
    this.savedPhone      = phoneNumber;
    this.savedIdentifier = raw.usernameOrEmail;

    this.authService.forgotPasswordSendOTP({ usernameOrEmail: this.savedIdentifier, phoneNumber: this.savedPhone })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.loading.set(false);
          if (res?.devOtp) this.devOtp.set(res.devOtp);
          this.step.set('otp');
          this.startCountdown();
          this.startResendCooldown();
          // emitEvent: false — prevents valueChanges on usernameOrEmail from
          // triggering the lookup tap that would clear foundDialCode/savedPhone.
          this.fpForm.disable({ emitEvent: false });
          setTimeout(() => this.otpBoxes?.first?.nativeElement.focus(), 50);
        },
        error: () => {
          this.loading.set(false);
          // errorInterceptor handles toast
        },
      });
  }

  // ── Submit — Step 2: Verify OTP + Reset ─────────────────────────────────────
  onVerifyOtp(): void {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      this.otpError.set(true);
      return;
    }

    this.loading.set(true);
    this.otpError.set(false);

    const { otp } = this.otpForm.value;
    const raw     = this.fpForm.getRawValue();

    this.authService.verifyResetOtp({
      usernameOrEmail: this.savedIdentifier,
      phoneNumber:     this.savedPhone,
      otp,
      newPassword:     raw.newPassword,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.loading.set(false);
        this.toastService.success(this.t.toastPasswordReset);
        this.router.navigate(['/auth/login']);
      },
      error: (err: any) => {
        this.loading.set(false);
        const serverMsg: string = err?.error?.message ?? '';
        if (serverMsg.toLowerCase().includes('too many')) {
          // Full reset — start a completely fresh attempt
          this.stopCountdown();
          this.stopResendCooldown();
          this.fpForm.enable({ emitEvent: false });
          this.fpForm.reset({}, { emitEvent: false });
          this.fpForm.get('phoneDigits')?.disable({ emitEvent: false });
          this.lookupState.set('idle');
          this.foundDialCode.set('');
          this.foundCountryName.set('');
          this.otpForm.reset();
          this.devOtp.set(null);
          this.otpDigits = ['', '', '', '', '', ''];
          this.otpError.set(false);
          this.tooManyAttemptsAlert.set(true);
          this.step.set('form');
        } else {
          this.otpError.set(true);
          this.clearOtpBoxes();
        }
      },
    });
  }

  // ── Resend OTP ───────────────────────────────────────────────────────────────
  onResendOtp(): void {
    if (this.resendCooldown() > 0) return;
    this.authService.forgotPasswordSendOTP({ usernameOrEmail: this.savedIdentifier, phoneNumber: this.savedPhone })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
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

  // ── Countdown timer ──────────────────────────────────────────────────────────
  private startCountdown(): void {
    this.stopCountdown();
    let seconds = 5 * 60;
    this.otpCountdown.set('5:00');
    this.countdownInterval = setInterval(() => {
      seconds--;
      if (seconds <= 0) { this.otpCountdown.set('0:00'); this.stopCountdown(); return; }
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

  // ── Resend cooldown ──────────────────────────────────────────────────────────
  private startResendCooldown(): void {
    this.stopResendCooldown();
    this.resendCooldown.set(30);
    this.resendInterval = setInterval(() => {
      const c = this.resendCooldown();
      if (c <= 1) { this.resendCooldown.set(0); this.stopResendCooldown(); }
      else { this.resendCooldown.set(c - 1); }
    }, 1000);
  }

  private stopResendCooldown(): void {
    if (this.resendInterval !== undefined) {
      clearInterval(this.resendInterval);
      this.resendInterval = undefined;
    }
  }

  // ── OTP box helpers ──────────────────────────────────────────────────────────
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
}
