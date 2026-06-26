import { Component, Output, EventEmitter, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { UserService, AdminCreateUserPayload } from '../../../../../core/services/user.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { SearchableSelectComponent, SelectOption } from '../../../../../shared/components/searchable-select/searchable-select.component';

@Component({
  selector: 'app-add-user-drawer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SearchableSelectComponent],
  templateUrl: './add-user-drawer.component.html',
  styleUrls: ['./add-user-drawer.component.scss'],
})
export class AddUserDrawerComponent implements OnInit {
  @Output() close       = new EventEmitter<void>();
  @Output() userCreated = new EventEmitter<void>();

  private fb          = inject(FormBuilder);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private toast       = inject(ToastService);

  form!: FormGroup;
  submitting    = signal(false);
  usernameState = signal<'idle' | 'checking' | 'available' | 'taken'>('idle');
  showPassword  = signal(false);
  showConfirm   = signal(false);

  toggleShowPassword(): void { this.showPassword.update((v) => !v); }
  toggleShowConfirm():  void { this.showConfirm.update((v) => !v); }

  countries       = signal<{ id: number; name: string }[]>([]);
  countryOptions  = computed<SelectOption[]>(() =>
    this.countries().map((c) => ({ value: c.id, label: c.name }))
  );

  ngOnInit(): void {
    this.form = this.fb.group({
      displayName: ['', [Validators.required, Validators.minLength(2)]],
      userName:    ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^[a-zA-Z0-9_]+$/)]],
      email:       ['', [Validators.email]],
      phoneNo:     [''],
      password:    ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
      role:        ['USER', Validators.required],
      countryId:   [null],
    }, { validators: this.passwordsMatch });

    // Debounced username check
    this.form.get('userName')!.valueChanges.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap((val: string) => {
        if (!val || val.length < 3) { this.usernameState.set('idle'); return of(null); }
        this.usernameState.set('checking');
        return this.authService.checkUsername(val);
      }),
    ).subscribe((res: any) => {
      if (res === null) return;
      this.usernameState.set(res?.exist ? 'taken' : 'available');
      if (res?.exist === true) {
        this.form.get('userName')!.setErrors({ taken: true });
      }
    });

    this.authService.getCountries().subscribe({
      next: (data: any) => this.countries.set(data?.data || []),
      error: () => {},
    });
  }

  private passwordsMatch(g: AbstractControl) {
    const p = g.get('password')?.value;
    const c = g.get('confirmPassword')?.value;
    return p && c && p !== c ? { mismatch: true } : null;
  }

  passwordStrength(): { label: string; level: number; color: string } {
    const p = this.form.get('password')?.value || '';
    let score = 0;
    if (p.length >= 8)             score++;
    if (/[A-Z]/.test(p))           score++;
    if (/[0-9]/.test(p))           score++;
    if (/[^A-Za-z0-9]/.test(p))   score++;
    const map = [
      { label: 'Too short', level: 0, color: '#e5e7eb' },
      { label: 'Weak',      level: 1, color: '#ef4444' },
      { label: 'Fair',      level: 2, color: '#f59e0b' },
      { label: 'Good',      level: 3, color: '#3b82f6' },
      { label: 'Strong',    level: 4, color: '#22c55e' },
    ];
    return p.length < 8 ? map[0] : map[score];
  }

  submit(): void {
    if (this.form.invalid || this.usernameState() === 'taken') return;
    this.submitting.set(true);

    const v = this.form.getRawValue();
    const payload: AdminCreateUserPayload = {
      userName:    v.userName,
      displayName: v.displayName,
      password:    v.password,
      role:        v.role,
      email:       v.email || undefined,
      phoneNo:     v.phoneNo || undefined,
      countryId:   v.countryId || undefined,
    };

    this.userService.adminCreateUser(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.userCreated.emit();
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'Failed to create user');
        this.submitting.set(false);
      },
    });
  }

  hasError(field: string, error: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.touched && ctrl?.hasError(error));
  }
}
