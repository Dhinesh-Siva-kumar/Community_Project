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
import { A11yModule } from '@angular/cdk/a11y';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService } from '../../../core/services/theme.service';
import { OnboardingService } from '../../../core/services/onboarding.service';
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
import { computePasswordStrength } from '../../../shared/utils/password-strength';

type Lang = 'en' | 'ta';

const TRANSLATIONS = {
  en: {
    switchToTamil: 'Switch to Tamil',
    switchToEnglish: 'Switch to English',
    switchToLight: 'Switch to light mode',
    switchToDark: 'Switch to dark mode',
    backToHome: 'Back to home',
    formHeadlinePre: 'Start your journey',
    formHeadlineSub: "today. It's free.",
    formBrandDesc: 'Create your account in seconds and join thousands of passionate people building meaningful connections.',
    formFeature1: '10,000+ active members across the UK',
    formFeature2: '500+ communities across every topic',
    formFeature3: 'Free forever — no credit card needed',
    avatarRowText: 'Join thousands already connected',
    otpHeadlinePre: 'One last step!',
    otpHeadlineSub: 'Verify your identity.',
    otpBrandDesc: 'Enter the OTP we sent to your phone number to confirm your identity.',
    otpFeature1: 'Check your SMS inbox',
    otpFeature2: 'OTP is valid for 5 minutes only',
    otpFeature3: 'Never share your OTP with anyone',
    cardTitleForm: 'Create your account',
    cardSubtitleForm: 'Fill in your details to get started for free',
    cardTitleOtp: 'Verify OTP',
    cardSubtitleOtp: 'Last step to register',
    tooManyAttempts: 'Too many incorrect attempts. Please register again to request a new code.',
    usernameLabel: 'User Name',
    usernamePlaceholder: 'username',
    errUsernameRequired: 'Username is required.',
    errUsernameMinlength: 'Minimum 3 characters.',
    errUsernameMaxlength: 'Maximum 20 characters allowed.',
    errUsernamePattern: 'Only letters, numbers, and underscores.',
    errUsernameTaken: 'Username already taken.',
    displayNameLabel: 'Display Name',
    displayNamePlaceholder: 'Your display name',
    errDisplayNameRequired: 'Display name is required.',
    errDisplayNameMinlength: 'Minimum 3 characters.',
    errDisplayNameMaxlength: 'Maximum 50 characters allowed.',
    errDisplayNamePattern: 'Must start with a letter; letters, spaces, hyphens, apostrophes only.',
    countryLabel: 'Country',
    countryPlaceholder: 'Select country',
    mobileLabel: 'Mobile Number',
    mobilePlaceholder: 'Enter mobile number',
    errMobileTaken: 'This mobile number is already registered with another account.',
    errMobileRequired: 'Mobile number is required.',
    passwordLabel: 'Password',
    passwordPlaceholder: 'At least 8 characters',
    errPasswordRequired: 'Password is required.',
    criteriaMinLength: 'At least 8 characters',
    criteriaUppercase: 'Uppercase letter',
    criteriaLowercase: 'Lowercase letter',
    criteriaNumber: 'Number (0–9)',
    criteriaSpecial: 'Special character',
    confirmPasswordLabel: 'Confirm Password',
    confirmPasswordPlaceholder: 'Re-enter your password',
    errConfirmRequired: 'Please confirm your password.',
    errPasswordMismatch: 'Passwords do not match.',
    togglePasswordVisibility: 'Toggle password visibility',
    sendingOtp: 'Sending OTP...',
    register: 'Register',
    or: 'or',
    otpHint: 'Enter the 6-digit code sent to your phone',
    codeExpiresIn: 'Code expires in',
    devOtpLabel: 'Dev OTP',
    otpIncorrect: 'OTP is incorrect. Please try again.',
    resendOtpIn: (s: number) => `Resend OTP in ${s}s`,
    resendOtp: 'Resend OTP',
    creatingAccount: 'Creating account...',
    verifyingOtp: 'Verifying OTP...',
    verifyOtp: 'Verify OTP',
    alreadyHaveAccount: 'Already have an account?',
    signIn: 'Sign in',
    googleSigningIn: 'Signing in with Google...',
    creatingYourAccount: 'Creating your account...',
    successTitle: "You're Successfully Registered!",
    successSub: 'Welcome to Community. Taking you to your dashboard…',
    modalClose: 'Close',
    modalTitle: 'Choose a Username',
    modalDesc: 'Your suggested username is already taken. Pick a unique username to complete your registration.',
    modalUsernameLabel: 'Username',
    checkingAvailability: 'Checking availability...',
    usernameTaken: 'Username already taken. Please choose another.',
    usernameAvailable: 'Username is available',
    confirmUsername: 'Confirm Username',
    toastCountriesFailed: 'Failed to load countries',
    toastOtpSent: 'OTP sent successfully',
    toastOtpSendFailed: 'Failed to send OTP',
    toastOtpResent: 'OTP resent successfully',
    toastInvalidOtp: 'Invalid OTP',
    toastRegistrationFailed: 'Registration failed',
    toastGoogleAlreadyRegistered: 'This Google account is already registered. Please sign in instead.',
    toastGoogleUnavailable: 'Google sign-in is currently unavailable. Please try the normal registration instead.',
    toastGoogleSomethingWrong: 'Something went wrong. Please close this dialog and try again.',
  },
  ta: {
    switchToTamil: 'தமிழுக்கு மாறவும்',
    switchToEnglish: 'ஆங்கிலத்திற்கு மாறவும்',
    switchToLight: 'லைட் மோடிற்கு மாறவும்',
    switchToDark: 'டார்க் மோடிற்கு மாறவும்',
    backToHome: 'முகப்புக்குச் செல்ல',
    formHeadlinePre: 'உங்கள் பயணத்தைத்',
    formHeadlineSub: 'தொடங்குங்கள். இது இலவசம்.',
    formBrandDesc: 'சில வினாடிகளில் உங்கள் கணக்கை உருவாக்கி, அர்த்தமுள்ள தொடர்புகளை உருவாக்கும் ஆயிரக்கணக்கானோருடன் இணையுங்கள்.',
    formFeature1: 'UK முழுவதும் 10,000+ செயலில் உள்ள உறுப்பினர்கள்',
    formFeature2: 'ஒவ்வொரு தலைப்பிலும் 500+ சமூகங்கள்',
    formFeature3: 'எப்போதும் இலவசம் — கிரெடிட் கார்டு தேவையில்லை',
    avatarRowText: 'ஆயிரக்கணக்கானோர் ஏற்கனவே இணைந்துள்ளனர்',
    otpHeadlinePre: 'கடைசி படி!',
    otpHeadlineSub: 'உங்கள் அடையாளத்தை சரிபார்க்கவும்.',
    otpBrandDesc: 'உங்கள் அடையாளத்தை உறுதிப்படுத்த உங்கள் தொலைபேசி எண்ணுக்கு அனுப்பிய OTP-ஐ உள்ளிடவும்.',
    otpFeature1: 'உங்கள் SMS இன்பாக்ஸைச் சரிபார்க்கவும்',
    otpFeature2: 'OTP 5 நிமிடங்களுக்கு மட்டுமே செல்லுபடியாகும்',
    otpFeature3: 'உங்கள் OTP-ஐ யாருடனும் பகிர வேண்டாம்',
    cardTitleForm: 'உங்கள் கணக்கை உருவாக்குங்கள்',
    cardSubtitleForm: 'இலவசமாகத் தொடங்க உங்கள் விவரங்களை நிரப்பவும்',
    cardTitleOtp: 'OTP-ஐ சரிபார்க்கவும்',
    cardSubtitleOtp: 'பதிவு செய்ய கடைசி படி',
    tooManyAttempts: 'பல தவறான முயற்சிகள். புதிய குறியீட்டைப் பெற மீண்டும் பதிவு செய்யவும்.',
    usernameLabel: 'பயனர் பெயர்',
    usernamePlaceholder: 'பயனர்பெயர்',
    errUsernameRequired: 'பயனர் பெயர் தேவை.',
    errUsernameMinlength: 'குறைந்தபட்சம் 3 எழுத்துகள்.',
    errUsernameMaxlength: 'அதிகபட்சம் 20 எழுத்துகள் அனுமதிக்கப்படும்.',
    errUsernamePattern: 'எழுத்துகள், எண்கள் மற்றும் அடிக்கோடு மட்டும்.',
    errUsernameTaken: 'பயனர் பெயர் ஏற்கனவே உள்ளது.',
    displayNameLabel: 'காட்சிப் பெயர்',
    displayNamePlaceholder: 'உங்கள் காட்சிப் பெயர்',
    errDisplayNameRequired: 'காட்சிப் பெயர் தேவை.',
    errDisplayNameMinlength: 'குறைந்தபட்சம் 3 எழுத்துகள்.',
    errDisplayNameMaxlength: 'அதிகபட்சம் 50 எழுத்துகள் அனுமதிக்கப்படும்.',
    errDisplayNamePattern: 'ஒரு எழுத்துடன் தொடங்க வேண்டும்; எழுத்துகள், இடைவெளிகள், ஹைபன், அபாஸ்ட்ரபி மட்டும்.',
    countryLabel: 'நாடு',
    countryPlaceholder: 'நாட்டைத் தேர்ந்தெடுக்கவும்',
    mobileLabel: 'மொபைல் எண்',
    mobilePlaceholder: 'மொபைல் எண்ணை உள்ளிடவும்',
    errMobileTaken: 'இந்த மொபைல் எண் ஏற்கனவே மற்றொரு கணக்குடன் பதிவு செய்யப்பட்டுள்ளது.',
    errMobileRequired: 'மொபைல் எண் தேவை.',
    passwordLabel: 'கடவுச்சொல்',
    passwordPlaceholder: 'குறைந்தது 8 எழுத்துகள்',
    errPasswordRequired: 'கடவுச்சொல் தேவை.',
    criteriaMinLength: 'குறைந்தது 8 எழுத்துகள்',
    criteriaUppercase: 'பெரிய எழுத்து',
    criteriaLowercase: 'சிறிய எழுத்து',
    criteriaNumber: 'எண் (0–9)',
    criteriaSpecial: 'சிறப்பு எழுத்து',
    confirmPasswordLabel: 'கடவுச்சொல்லை உறுதிப்படுத்தவும்',
    confirmPasswordPlaceholder: 'உங்கள் கடவுச்சொல்லை மீண்டும் உள்ளிடவும்',
    errConfirmRequired: 'உங்கள் கடவுச்சொல்லை உறுதிப்படுத்தவும்.',
    errPasswordMismatch: 'கடவுச்சொற்கள் பொருந்தவில்லை.',
    togglePasswordVisibility: 'கடவுச்சொல் காட்சியை மாற்று',
    sendingOtp: 'OTP அனுப்புகிறது...',
    register: 'பதிவு செய்யவும்',
    or: 'அல்லது',
    otpHint: 'உங்கள் தொலைபேசிக்கு அனுப்பிய 6-இலக்க குறியீட்டை உள்ளிடவும்',
    codeExpiresIn: 'குறியீடு காலாவதியாகும் நேரம்',
    devOtpLabel: 'டெவ் OTP',
    otpIncorrect: 'OTP தவறானது. மீண்டும் முயற்சிக்கவும்.',
    resendOtpIn: (s: number) => `${s} வினாடியில் OTP-ஐ மீண்டும் அனுப்பு`,
    resendOtp: 'OTP-ஐ மீண்டும் அனுப்பு',
    creatingAccount: 'கணக்கு உருவாக்கப்படுகிறது...',
    verifyingOtp: 'OTP சரிபார்க்கிறது...',
    verifyOtp: 'OTP-ஐ சரிபார்க்கவும்',
    alreadyHaveAccount: 'ஏற்கனவே கணக்கு உள்ளதா?',
    signIn: 'உள்நுழைக',
    googleSigningIn: 'Google மூலம் உள்நுழைகிறது...',
    creatingYourAccount: 'உங்கள் கணக்கு உருவாக்கப்படுகிறது...',
    successTitle: 'நீங்கள் வெற்றிகரமாக பதிவு செய்யப்பட்டீர்கள்!',
    successSub: 'Community-க்கு வரவேற்கிறோம். உங்கள் டாஷ்போர்டுக்கு அழைத்துச் செல்கிறோம்…',
    modalClose: 'மூடு',
    modalTitle: 'பயனர் பெயரைத் தேர்ந்தெடுக்கவும்',
    modalDesc: 'உங்கள் பரிந்துரைக்கப்பட்ட பயனர் பெயர் ஏற்கனவே எடுக்கப்பட்டுள்ளது. உங்கள் பதிவை முடிக்க தனித்துவமான பயனர் பெயரைத் தேர்ந்தெடுக்கவும்.',
    modalUsernameLabel: 'பயனர் பெயர்',
    checkingAvailability: 'கிடைக்கிறதா என சரிபார்க்கிறது...',
    usernameTaken: 'பயனர் பெயர் ஏற்கனவே உள்ளது. வேறு ஒன்றைத் தேர்ந்தெடுக்கவும்.',
    usernameAvailable: 'பயனர் பெயர் கிடைக்கிறது',
    confirmUsername: 'பயனர் பெயரை உறுதிசெய்',
    toastCountriesFailed: 'நாடுகளை ஏற்ற முடியவில்லை',
    toastOtpSent: 'OTP வெற்றிகரமாக அனுப்பப்பட்டது',
    toastOtpSendFailed: 'OTP அனுப்ப முடியவில்லை',
    toastOtpResent: 'OTP மீண்டும் வெற்றிகரமாக அனுப்பப்பட்டது',
    toastInvalidOtp: 'தவறான OTP',
    toastRegistrationFailed: 'பதிவு தோல்வியடைந்தது',
    toastGoogleAlreadyRegistered: 'இந்த Google கணக்கு ஏற்கனவே பதிவு செய்யப்பட்டுள்ளது. உள்நுழையவும்.',
    toastGoogleUnavailable: 'Google உள்நுழைவு தற்போது கிடைக்கவில்லை. வழக்கமான பதிவை முயற்சிக்கவும்.',
    toastGoogleSomethingWrong: 'ஏதோ தவறு நடந்தது. இந்த சாளரத்தை மூடிவிட்டு மீண்டும் முயற்சிக்கவும்.',
  },
};

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    SearchableSelectComponent,
    A11yModule,
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

  private countdownInterval?: ReturnType<typeof setInterval>;
  private resendInterval?:    ReturnType<typeof setInterval>;

  /** Updated by password valueChanges so computed() can track it. */
  private passwordValue = signal('');

  passwordStrength = computed(() => computePasswordStrength(this.passwordValue()));

  countries: Country[] = [];
  countryOptions: SelectOption[] = [];
  step = signal<'form' | 'otp'>('form');

  private destroy$  = new Subject<void>();
  private usernameModalCheck$ = new Subject<string>();
  private platformId = inject(PLATFORM_ID) as object;
  private ngZone     = inject(NgZone);

  @ViewChildren('otpBox') otpBoxes!: QueryList<ElementRef<HTMLInputElement>>;

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

  get selectedCountry(): Country | undefined {
    const id = this.registerForm?.getRawValue().countryID;
    return this.countries.find(c => c.id == id);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  constructor(
    private fb:               FormBuilder,
    private authService:      AuthService,
    private toastService:     ToastService,
    private onboardingService: OnboardingService,
    private themeService:     ThemeService,
    private router:           Router,
  ) {}

  ngOnInit() {
    this.themeService.applyDefaultIfUnset('dark');
    this.loadLanguage();
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
      map(value => (value ?? '').replace(/[^a-zA-Z0-9_஀-௿]/g, '')),
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
    this.googleBtnResizeObserver?.disconnect();
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
        userName:        ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20), Validators.pattern(/^[a-zA-Z0-9_஀-௿]+$/)]],
        displayName:     ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50), Validators.pattern(/^[A-Za-z஀-௿][A-Za-z஀-௿ '\-]*$/)]],
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
      if (value.length < 8)                errors['minLength'] = true;
      if (!/[A-Z஀-௿]/.test(value))         errors['uppercase'] = true;
      if (!/[a-z஀-௿]/.test(value))         errors['lowercase'] = true;
      if (!/[0-9]/.test(value))            errors['number']    = true;
      if (!/[^A-Za-z0-9஀-௿]/.test(value))  errors['special']   = true;
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
    // While an IME composition is in progress (e.g. typing Tamil via a
    // transliteration keyboard), the browser owns the input's value —
    // overwriting it mid-composition fights the IME and can freeze the page.
    // Let composition finish; `compositionend` re-fires this to sanitize.
    if (event.isComposing) return;
    const value = (event.target.value as string).replace(/[^a-zA-Z0-9_஀-௿]/g, '');
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
      error: () => this.toastService.error(this.t.toastCountriesFailed),
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
        this.toastService.success(this.t.toastOtpSent);
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
          this.toastService.error(err?.error?.message || this.t.toastOtpSendFailed);
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
          this.toastService.error(res?.message || this.t.toastInvalidOtp);
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
        this.markWelcomeBannerPending();
        setTimeout(() => this.router.navigate(['/user/dashboard']), 3000);
      },
      error: (err) => {
        this.loading.set(false);
        this.registeringStage.set('');
        this.toastService.error(err?.error?.message || this.t.toastRegistrationFailed);
      },
    });
  }

  /** Flags the one-time dashboard welcome banner to show on the next visit. */
  private markWelcomeBannerPending(): void {
    const userId = this.authService.currentUser()?.id;
    if (userId != null) this.onboardingService.markWelcomePending(userId);
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
        this.toastService.success(this.t.toastOtpResent);
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
      text:  'continue_with',
      shape: 'rectangular',
      width: btnWidth,
    });
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
          this.toastService.error(this.t.toastGoogleAlreadyRegistered);
          setTimeout(() => this.router.navigate(['/auth/login']), 2000);
        } else {
          // Tokens already stored by authService tap — go to dashboard
          this.showSuccessModal.set(true);
          this.markWelcomeBannerPending();
          setTimeout(() => this.router.navigate(['/user/dashboard']), 3000);
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
    this.authService.googleComplete({ credential: this.googleCredential(), username, countryId: this.googleCountryId() ?? undefined })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.googleLoading.set(false);
          this.googleNeedsUsername.set(false);
          if (!res.isNewUser) {
            this.toastService.error(this.t.toastGoogleAlreadyRegistered);
            setTimeout(() => this.router.navigate(['/auth/login']), 2000);
          } else {
            this.showSuccessModal.set(true);
            this.markWelcomeBannerPending();
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
            this.toastService.error(this.t.toastGoogleSomethingWrong);
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
