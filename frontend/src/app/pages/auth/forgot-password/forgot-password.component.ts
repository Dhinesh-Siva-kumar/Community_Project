import {
  Component,
  ElementRef,
  inject,
  signal,
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
  const usernameRegex = /^[a-zA-Z0-9._\-]{3,}$/;
  return emailRegex.test(value) || usernameRegex.test(value) ? null : { invalidUsernameOrEmail: true };
}

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

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadTheme();
    this.initForms();
    this.setupLookup();
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
      if (value.length < 8)             errors['minLength'] = true;
      if (!/[A-Z]/.test(value))         errors['uppercase'] = true;
      if (!/[a-z]/.test(value))         errors['lowercase'] = true;
      if (!/[0-9]/.test(value))         errors['number']    = true;
      if (!/[^A-Za-z0-9]/.test(value))  errors['special']   = true;
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
        this.toastService.success('Password reset! Please sign in with your new password.');
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
