import { Component, ElementRef, inject, QueryList, signal, ViewChildren, HostBinding, PLATFORM_ID } from '@angular/core';
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
import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import { AsyncValidatorFn } from '@angular/forms';
import { debounceTime, switchMap, map, catchError, of, distinctUntilChanged, Subject } from 'rxjs';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent {
  registerForm!: FormGroup;
  otpForm!: FormGroup;
  loading = signal(false);
  otpError = signal(false);
  showPassword = signal(false);

  countries: Country[] = [];
  step = signal<'form' | 'otp'>('form');

  private destroy$ = new Subject<void>();
  private platformId = inject(PLATFORM_ID) as object;
  @ViewChildren('otpBox') otpBoxes!: QueryList<ElementRef<HTMLInputElement>>;

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

  constructor(
    private fb : FormBuilder,
    private authService : AuthService,
    private toastService :ToastService,
    private router : Router
  )
  { }

ngOnInit(){
  this.loadTheme();
  this.initializeForm();
  this.loadCountries();
  this.registerForm.get('userName')?.valueChanges.pipe(
  debounceTime(500),

  // ✅ CLEAN VALUE HERE
  map(value => value?.replace(/\s/g, '')), 

  distinctUntilChanged(),

  switchMap(username => {
    if (!username || username.length < 3) return of(null);
    return this.authService.checkUsername(username);
  })
).subscribe((res: any) => {
  const control = this.registerForm.get('userName');

  if (res?.exists) {
    control?.setErrors({ usernameTaken: true });
  } else {
    if (control?.hasError('usernameTaken')) {
      control.setErrors(null);
    }
  }
});
}

ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}

ngAfterViewInit() {
  if (this.step() === 'otp') {
    setTimeout(() => {
      this.otpBoxes?.first?.nativeElement.focus();
    });
  }
}

initializeForm(){
  this.registerForm = this.fb.group(
    {
      userName: ['', [Validators.required, Validators.minLength(3),Validators.maxLength(15),Validators.pattern(/^[a-zA-Z0-9._]+$/)]],
      displayName: ['', [Validators.required, Validators.minLength(3),Validators.maxLength(30),Validators.pattern(/^[A-Za-z ]+$/)]],
      countryID: [null, Validators.required],
      mobile: ['', [Validators.required, Validators.maxLength(15)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(20)]],
      confirmPassword: ['', [Validators.required, Validators.maxLength(20)]],
    },
    { validators: this.passwordMatchValidator }
  );
  
  this.otpForm = this.fb.group({
    otp: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
  });
}

sanitizeUsername(event: any) {
  const value = event.target.value;
  event.target.value = value.replace(/[^a-zA-Z0-9._]/g, '');
  this.registerForm.get('userName')?.setValue(event.target.value, { emitEvent: false });
}

sanitizeMobile(event: any) {
  const value = event.target.value.replace(/[^0-9]/g, '');
  event.target.value = value;
  this.registerForm.get('mobile')?.setValue(value, { emitEvent: false });
}

onCountryChange() {
  this.registerForm.get('mobile')?.updateValueAndValidity();
}

mobileValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;

    const parent = control.parent;
    if (!parent) return null;

    const countryId = parent.get('countryID')?.value;

    if (!countryId) return null;
    if (!this.countries.length) return null; // ✅ important

    const country = this.countries.find(
      c => c.country_id == countryId
    );

    if (!country) return { mobile: true };

    try {
      const phone = parsePhoneNumberFromString(
        control.value,
        country.country_flag.toUpperCase() as CountryCode
      );

      return phone && phone.isValid() ? null : { mobile: true };

    } catch {
      return { mobile: true };
    }
  };
}

getFlagEmoji(countryCode: string) {
  return countryCode
    .toUpperCase()
    .replace(/./g, char =>
      String.fromCodePoint(127397 + char.charCodeAt(0))
    );
}

loadCountries() {
  this.authService.getCountries().subscribe({
    next: (res) => {
      this.countries = res.data;
      const defaultCountry = this.countries.find(c => c.country_name === 'India');
      if (defaultCountry) {
        this.registerForm.patchValue({
          countryID: defaultCountry.country_id
        });
        this.registerForm.get('mobile')?.updateValueAndValidity();
      }
    },
    error: () => {
      this.toastService.error('Failed to load countries');
    }
  });
}

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  if (!password || !confirmPassword) return null;

  return password === confirmPassword
    ? null
    : { passwordMismatch: true };
}
  get f1() {
    return this.registerForm.controls;
  }

 onSubmit(): void {
  if (this.registerForm.invalid) {
    this.registerForm.markAllAsTouched();
    return;
  }

  this.loading.set(true);

  const mobile = this.getFullPhoneNumber();

  this.authService.sendOtp({ mobile }).subscribe({
    next: () => {
      this.loading.set(false);
      this.toastService.success('OTP sent successfully');

      // ✅ move to OTP step
      this.step.set('otp');
      this.registerForm.disable();
    },
    error: (err) => {
      this.loading.set(false);
      this.toastService.error(err?.error?.message || 'Failed to send OTP');
    }
  });

  
}
getFullPhoneNumber(): string {
  const country = this.countries.find(
    c => c.country_id == this.registerForm.value.countryID
  );

  if (!country) return '';

  return `${country.country_code}${this.registerForm.value.mobile}`;
}

verifyOtp(): void {
  if (this.otpForm.invalid) {
    this.otpForm.markAllAsTouched();
    this.otpError.set(true);
    return;
  }

  this.loading.set(true);
  this.otpError.set(false);
  const mobile = this.getFullPhoneNumber();
  const otp = this.otpForm.value.otp; // ✅ FIX HERE

  this.authService.verifyOtp({ mobile, otp }).subscribe({
    next: () => {
      this.registerUser(); // ✅ final step
    },
    error: () => {
      this.loading.set(false);
      this.otpError.set(true);
      this.toastService.error('Invalid OTP');
    }
  });
}

registerUser() {
  const userData = { ...this.registerForm.value };
  delete userData.confirmPassword;

  const payload = this.mapToPayload(userData);

  this.authService.register(payload).subscribe({
    next: () => {
      this.loading.set(false);
      this.toastService.success('Account created successfully!');
      this.router.navigate(['/user/dashboard']);
    },
    error: (err) => {
      this.loading.set(false);
      this.toastService.error(err?.error?.message || 'Registration failed');
    }
  });
}

otpDigits: string[] = ['', '', '', '', '', ''];

onOtpInput(event: Event, index: number): void {
        const input = event.target as HTMLInputElement;
        const val = input.value.replace(/[^0-9]/g, '');
        input.value = val.slice(-1);
        this.otpDigits[index] = input.value;
        this.syncOtpFormValue();
        this.otpError.set(false);
        if (input.value && index < 5) {
            const boxes = this.otpBoxes.toArray();
            boxes[index + 1].nativeElement.focus();
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
        const boxes = this.otpBoxes.toArray();
        digits.forEach((d, i) => {
            this.otpDigits[i] = d;
            boxes[i].nativeElement.value = d;
        });
        this.syncOtpFormValue();
        const nextFocus = Math.min(digits.length, 5);
        boxes[nextFocus].nativeElement.focus();
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
                boxes.forEach(b => b.nativeElement.value = '');
                boxes[0].nativeElement.focus();
            }
        }, 0);
    }

  private mapToPayload(form: any): UserRegister {
  return {
    user_name: form.userName,
    display_name: form.displayName,
    phone_no: form.mobile,
    password: form.password,
    country_id: form.countryID
  };
}
}
