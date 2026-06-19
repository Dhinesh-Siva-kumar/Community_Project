import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { User } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { ProfileHeaderComponent } from '../../../shared/components/profile-header/profile-header.component';
import { ProfileTabsComponent, ProfileTab } from '../../../shared/components/profile-tabs/profile-tabs.component';
import { ProfileInfoCardComponent } from '../../../shared/components/profile-info-card/profile-info-card.component';

@Component({
  selector: 'app-admin-profile',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, DatePipe,
    SearchableSelectComponent,
    ProfileHeaderComponent, ProfileTabsComponent, ProfileInfoCardComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class AdminProfileComponent implements OnInit {
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  user = signal<User | null>(null);
  loading = signal(true);
  saving = signal(false);
  activeTab = signal('personal');
  editMode = signal(false);

  avatarFile = signal<File | null>(null);
  newInterest = signal('');

  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  showPasswordSection = signal(false);
  changingPassword = signal(false);

  profileCompletion = computed(() => this.user()?.profileCompletion ?? 0);

  tabs: ProfileTab[] = [
    { id: 'personal',   label: 'Personal Info', icon: 'bi-person' },
    { id: 'admin-info', label: 'Admin Info',     icon: 'bi-shield' },
  ];

  profCatOptions: SelectOption[] = [
    'Technology', 'Healthcare', 'Education', 'Finance', 'Legal',
    'Marketing', 'Design', 'Engineering', 'Sales', 'Construction',
    'Hospitality', 'Retail', 'Real Estate', 'Other',
  ].map(c => ({ value: c, label: c }));

  ngOnInit(): void {
    this.profileForm = this.fb.group({
      displayName: ['', Validators.required],
      email: ['', [Validators.email]],
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

    this.loadProfile();
  }

  loadProfile(): void {
    this.loading.set(true);
    this.userService.getProfile().subscribe({
      next: (user) => { this.user.set(user); this.patchForm(user); this.loading.set(false); },
      error: () => {
        const u = this.authService.currentUser();
        if (u) { this.user.set(u); this.patchForm(u); }
        this.loading.set(false);
      },
    });
  }

  private patchForm(u: User): void {
    this.profileForm.patchValue({
      displayName: u.displayName, email: u.email,
      phoneNo: u.phoneNo || '', bio: u.bio || '',
      country: u.country || '', location: u.location || '',
      pincode: u.pincode || '', professionalCategory: u.professionalCategory || '',
    });
  }

  setTab(id: string): void { this.activeTab.set(id); }

  toggleEdit(): void { this.editMode.update(v => !v); if (!this.editMode()) { const u = this.user(); if (u) this.patchForm(u); } }
  cancelEdit(): void { this.editMode.set(false); const u = this.user(); if (u) this.patchForm(u); }

  onAvatarChange(files: File[]): void { this.avatarFile.set(files[0] ?? null); }

  addInterest(): void {
    const val = this.newInterest().trim();
    if (!val) return;
    this.user.update(u => u ? { ...u, interests: [...u.interests, val] } : u);
    this.newInterest.set('');
  }

  removeInterest(i: number): void {
    this.user.update(u => u ? { ...u, interests: u.interests.filter((_, idx) => idx !== i) } : u);
  }

  onInterestInput(e: Event): void { this.newInterest.set((e.target as HTMLInputElement).value); }
  onInterestKeydown(e: KeyboardEvent): void { if (e.key === 'Enter') { e.preventDefault(); this.addInterest(); } }

  saveProfile(): void {
    if (this.profileForm.invalid) return;
    this.saving.set(true);
    const data: Record<string, any> = { ...this.profileForm.getRawValue(), interests: this.user()?.interests ?? [] };
    if (this.user()?.email || !data['email']) delete data['email'];

    this.userService.updateProfile(data, this.avatarFile() ?? undefined).subscribe({
      next: (user) => {
        this.user.set(user); this.authService.currentUser.set(user);
        this.editMode.set(false); this.avatarFile.set(null);
        this.toast.success('Profile updated successfully'); this.saving.set(false);
      },
      error: () => { this.toast.error('Failed to update profile'); this.saving.set(false); },
    });
  }

  togglePasswordSection(): void { this.showPasswordSection.update(v => !v); this.passwordForm.reset(); }

  changePassword(): void {
    if (this.passwordForm.invalid) return;
    const { newPassword, confirmPassword } = this.passwordForm.value;
    if (newPassword !== confirmPassword) { this.toast.error('Passwords do not match'); return; }
    this.changingPassword.set(true);
    this.userService.updateProfile({ password: newPassword }).subscribe({
      next: () => { this.toast.success('Password changed successfully'); this.showPasswordSection.set(false); this.passwordForm.reset(); this.changingPassword.set(false); },
      error: () => { this.toast.error('Failed to change password'); this.changingPassword.set(false); },
    });
  }
}
