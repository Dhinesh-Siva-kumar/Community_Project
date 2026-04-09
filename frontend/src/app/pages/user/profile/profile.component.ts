import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessService } from '../../../core/services/business.service';
import { JobService } from '../../../core/services/job.service';
import { ToastService } from '../../../core/services/toast.service';
import { User, Business, Job } from '../../../core/models';

type ProfileTab = 'personal' | 'businesses' | 'jobs';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class UserProfileComponent implements OnInit {
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private businessService = inject(BusinessService);
  private jobService = inject(JobService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  // State
  user = signal<User | null>(null);
  loading = signal(true);
  saving = signal(false);
  activeTab = signal<ProfileTab>('personal');
  editMode = signal(false);

  // User data
  myBusinesses = signal<Business[]>([]);
  myJobs = signal<Job[]>([]);
  loadingBusinesses = signal(false);
  loadingJobs = signal(false);
  deletingBusinessId = signal<string | null>(null);
  deletingJobId = signal<string | null>(null);

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
        // Fallback to auth service user
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

  // Tab management
  setTab(tab: ProfileTab): void {
    this.activeTab.set(tab);
    if (tab === 'businesses' && this.myBusinesses().length === 0) {
      this.loadMyBusinesses();
    }
    if (tab === 'jobs' && this.myJobs().length === 0) {
      this.loadMyJobs();
    }
  }

  // Edit mode
  toggleEdit(): void {
    this.editMode.update((v) => !v);
    if (!this.editMode()) {
      // Reset form on cancel
      const u = this.user();
      if (u) this.patchProfileForm(u);
    }
  }

  // Avatar
  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    this.avatarFile.set(file);

    const reader = new FileReader();
    reader.onload = () => this.avatarPreview.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  // Interests
  addInterest(): void {
    const interest = this.newInterest().trim();
    if (!interest) return;

    this.user.update((u) => {
      if (!u) return u;
      const interests = [...u.interests, interest];
      return { ...u, interests };
    });
    this.newInterest.set('');
  }

  removeInterest(index: number): void {
    this.user.update((u) => {
      if (!u) return u;
      const interests = u.interests.filter((_, i) => i !== index);
      return { ...u, interests };
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

  // Save profile
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

  // Password change
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
    // Using updateProfile as a placeholder - actual password change endpoint may differ
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

  // My businesses
  loadMyBusinesses(): void {
    this.loadingBusinesses.set(true);
    // Load all businesses and filter by userId client-side
    // Alternatively, the API might support a user filter
    this.businessService.getBusinesses('', '').subscribe({
      next: (response) => {
        const userId = this.user()?.id;
        this.myBusinesses.set(response.data.filter((b) => b.userId === userId));
        this.loadingBusinesses.set(false);
      },
      error: () => {
        this.loadingBusinesses.set(false);
      },
    });
  }

  deleteBusiness(id: string): void {
    if (!confirm('Are you sure you want to delete this business?')) return;
    this.deletingBusinessId.set(id);

    this.businessService.deleteBusiness(id).subscribe({
      next: () => {
        this.myBusinesses.update((list) => list.filter((b) => b.id !== id));
        this.toast.success('Business deleted');
        this.deletingBusinessId.set(null);
      },
      error: () => {
        this.toast.error('Failed to delete business');
        this.deletingBusinessId.set(null);
      },
    });
  }

  // My jobs
  loadMyJobs(): void {
    this.loadingJobs.set(true);
    this.jobService.getJobs().subscribe({
      next: (response) => {
        const userId = this.user()?.id;
        this.myJobs.set(response.data.filter((j) => j.userId === userId));
        this.loadingJobs.set(false);
      },
      error: () => {
        this.loadingJobs.set(false);
      },
    });
  }

  deleteJob(id: string): void {
    if (!confirm('Are you sure you want to delete this job?')) return;
    this.deletingJobId.set(id);

    this.jobService.deleteJob(id).subscribe({
      next: () => {
        this.myJobs.update((list) => list.filter((j) => j.id !== id));
        this.toast.success('Job deleted');
        this.deletingJobId.set(null);
      },
      error: () => {
        this.toast.error('Failed to delete job');
        this.deletingJobId.set(null);
      },
    });
  }

  // Helpers
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
