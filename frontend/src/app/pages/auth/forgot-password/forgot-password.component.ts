import { Component, inject, signal, ViewChildren, QueryList, ElementRef, AfterViewInit, HostBinding, PLATFORM_ID, OnInit } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

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
    imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterLink
    ],
    templateUrl: './forgot-password.component.html',
    styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent implements OnInit {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private toastService = inject(ToastService);
    private router = inject(Router);
    private platformId = inject(PLATFORM_ID) as object;

    @ViewChildren('otpBox') otpBoxes!: QueryList<ElementRef<HTMLInputElement>>;

    step = signal<'form' | 'otp'>('form');
    loading = signal(false);
    otpError = signal(false);
    showPassword = signal(false);
    maskedPhone = '';
    otpDigits = ['', '', '', '', '', ''];

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

    resetForm: FormGroup = this.fb.group({
        usernameOrEmail: ['', [Validators.required, usernameOrEmailValidator]],
        phoneNumber: ['', [Validators.required, Validators.pattern(/^\+?[0-9]{7,15}$/)]],
        newPassword: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
    },
        { validators: this.passwordMatchValidator }
    );

    otpForm: FormGroup = this.fb.group({
        otp: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6), Validators.pattern(/^[0-9]+$/)]],
    });

    passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
        const password = control.get('newPassword');
        const confirmPassword = control.get('confirmPassword');
        if (password && confirmPassword && password.value !== confirmPassword.value) {
            confirmPassword?.setErrors({ passwordMismatch: true });
            return { passwordMismatch: true };
        }
        return null;
    }

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

    onSendOtp(): void {
        if (this.resetForm.invalid) {
            this.resetForm.markAllAsTouched();
            return;
        }

        this.loading.set(true);
        const phone: string = this.resetForm.value.phoneNumber || '';
        this.maskedPhone = phone.slice(0, -4).replace(/./g, '*') + phone.slice(-4);
        const { usernameOrEmail, phoneNumber } = this.resetForm.value;
        this.authService.forgotPasswordSendOTP({ usernameOrEmail, phoneNumber }).subscribe({
            next: () => {
                this.loading.set(false);
                this.step.set('otp');
                this.toastService.success('OTP sent to your phone number.');
                this.resetForm.disable();
            },
            error: (err) => {
                this.loading.set(false);
                this.toastService.error(err?.error?.message || 'Failed to send OTP. Please try again.');
            },
        });
    }

    onVerifyOtp(): void {
        if (this.otpForm.invalid) {
            this.otpForm.markAllAsTouched();
            this.otpError.set(true);
            return;
        }

        this.loading.set(true);
        this.otpError.set(false);
        const { otp } = this.otpForm.value;
        const { usernameOrEmail, phoneNumber, newPassword } = this.resetForm.value;

        this.authService.verifyResetOtp({ usernameOrEmail, phoneNumber, otp, newPassword }).subscribe({
            next: () => {
                this.loading.set(false);
                this.toastService.success('Password reset successful! Please sign in.');
                this.router.navigate(['/auth/login']);
            },
            error: (err) => {
                this.loading.set(false);
                const msg: string = err?.error?.message || '';
                if (msg.toLowerCase().includes('otp') || err?.status === 400 || err?.status === 401) {
                    this.otpError.set(true);
                    this.clearOtpBoxes();
                } else {
                    this.toastService.error(msg || 'Verification failed. Please try again.');
                }
            },
        });
    }

    goBack(): void {
        this.router.navigate(['/auth/login']);
    }

    get f() {
        return this.resetForm.controls;
    }

    get fo() {
        return this.otpForm.controls;
    }
}
