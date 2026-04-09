import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { User } from '../../../core/models';

type ProfileTab = 'personal' | 'admin-info';

@Component({
  selector: 'app-admin-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class AdminProfileComponent implements OnInit {
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  // State
  user = signal<User | null>(null);
  loading = signal(true);
  saving = signal(false);
  activeTab = signal<ProfileTab>('personal');
  editMode = signal(false);

  // Avatar
  avatarFile = signal<File | null>(null);
  avatarPreview = signal<string | null>(null);

  // Interests
  newInterest = signal('');

  // Forms
  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  showPasswordSection = signal(false);
  changingPassword = signal(false);

  // Computed
  fullName = computed(() => {
    const u = this.user();
    return u ? (u.displayName || u.userName || '') : '';
  });

  profileCompletion = computed(() => this.user()?.profileCompletion ?? 0);

  professionalCategories = [
    'Technology', 'Healthcare', 'Education', 'Finance', 'Legal',
    'Marketing', 'Design', 'Engineering', 'Sales', 'Construction',
    'Hospitality', 'Retail', 'Real Estate', 'Other',
  ];

  ngOnInit(): void {
    this.initForms();
    this.loadProfile();
  }

  private initForms(): void {
    this.profileForm = this.fb.group({
      displayName: ['', Validators.required],
      email: [{ value: '', disabled: true }],
      phoneNo: [''],
      bio: [''],
      country: [''],
      location: [''],
      pincode: [''],
      professionalCategory: [''],
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
    });
  }

  loadProfile(): void {
    this.loading.set(true);
    this.userService.getProfile().subscribe({
      next: (user) => {
        this.user.set(user);
        this.patchProfileForm(user);
        this.loading.set(false);
      },
      error: () => {
        const currentUser = this.authService.currentUser();
        if (currentUser) {
          this.user.set(currentUser);
          this.patchProfileForm(currentUser);
        }
        this.loading.set(false);
      },
    });
  }

  private patchProfileForm(user: User): void {
    this.profileForm.patchValue({
      displayName: user.displayName,
      email: user.email,
      phoneNo: user.phoneNo || '',
      bio: user.bio || '',
      country: user.country || '',
      location: user.location || '',
      pincode: user.pincode || '',
      professionalCategory: user.professionalCategory || '',
    });
  }

  setTab(tab: ProfileTab): void {
    this.activeTab.set(tab);
  }

  toggleEdit(): void {
    this.editMode.update((v) => !v);
    if (!this.editMode()) {
      const u = this.user();
      if (u) this.patchProfileForm(u);
    }
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    this.avatarFile.set(file);

    const reader = new FileReader();
    reader.onload = () => this.avatarPreview.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  addInterest(): void {
    const interest = this.newInterest().trim();
    if (!interest) return;
    this.user.update((u) => {
      if (!u) return u;
      return { ...u, interests: [...u.interests, interest] };
    });
    this.newInterest.set('');
  }

  removeInterest(index: number): void {
    this.user.update((u) => {
      if (!u) return u;
      return { ...u, interests: u.interests.filter((_, i) => i !== index) };
    });
  }

  onInterestInput(event: Event): void {
    this.newInterest.set((event.target as HTMLInputElement).value);
  }

  onInterestKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addInterest();
    }
  }

  saveProfile(): void {
    if (this.profileForm.invalid) return;
    this.saving.set(true);

    const data: Record<string, any> = {
      ...this.profileForm.getRawValue(),
      interests: this.user()?.interests ?? [],
    };
    delete data['email'];

    const avatar = this.avatarFile() ?? undefined;

    this.userService.updateProfile(data, avatar).subscribe({
      next: (user) => {
        this.user.set(user);
        this.authService.currentUser.set(user);
        this.editMode.set(false);
        this.avatarFile.set(null);
        this.avatarPreview.set(null);
        this.toast.success('Profile updated successfully');
        this.saving.set(false);
      },
      error: () => {
        this.toast.error('Failed to update profile');
        this.saving.set(false);
      },
    });
  }

  togglePasswordSection(): void {
    this.showPasswordSection.update((v) => !v);
    this.passwordForm.reset();
  }

  changePassword(): void {
    if (this.passwordForm.invalid) return;

    const { newPassword, confirmPassword } = this.passwordForm.value;
    if (newPassword !== confirmPassword) {
      this.toast.error('Passwords do not match');
      return;
    }

    this.changingPassword.set(true);
    this.userService.updateProfile({ password: newPassword }).subscribe({
      next: () => {
        this.toast.success('Password changed successfully');
        this.showPasswordSection.set(false);
        this.passwordForm.reset();
        this.changingPassword.set(false);
      },
      error: () => {
        this.toast.error('Failed to change password');
        this.changingPassword.set(false);
      },
    });
  }

  getProgressBarClass(): string {
    const pct = this.profileCompletion();
    if (pct >= 80) return 'bg-success';
    if (pct >= 50) return 'bg-info';
    if (pct >= 30) return 'bg-warning';
    return 'bg-danger';
  }

  getAvatarUrl(): string {
    if (this.avatarPreview()) return this.avatarPreview()!;
    return this.user()?.avatar || '';
  }
}
