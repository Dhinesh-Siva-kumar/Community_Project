import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessService } from '../../../core/services/business.service';
import { JobService } from '../../../core/services/job.service';
import { ToastService } from '../../../core/services/toast.service';
import { User, Business, Job } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { ProfileHeaderComponent } from '../../../shared/components/profile-header/profile-header.component';
import { ProfileTabsComponent, ProfileTab } from '../../../shared/components/profile-tabs/profile-tabs.component';
import { ProfileInfoCardComponent } from '../../../shared/components/profile-info-card/profile-info-card.component';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, DatePipe,
    SearchableSelectComponent,
    ProfileHeaderComponent, ProfileTabsComponent, ProfileInfoCardComponent,
  ],
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

  user = signal<User | null>(null);
  loading = signal(true);
  saving = signal(false);
  activeTab = signal('personal');
  editMode = signal(false);

  myBusinesses = signal<Business[]>([]);
  myJobs = signal<Job[]>([]);
  loadingBusinesses = signal(false);
  loadingJobs = signal(false);
  deletingBusinessId = signal<string | null>(null);
  deletingJobId = signal<string | null>(null);

  avatarFile = signal<File | null>(null);
  newInterest = signal('');

  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  showPasswordSection = signal(false);
  changingPassword = signal(false);

  profileCompletion = computed(() => this.user()?.profileCompletion ?? 0);

  tabs: ProfileTab[] = [
    { id: 'personal',    label: 'Personal Info',   icon: 'bi-person' },
    { id: 'businesses',  label: 'My Businesses',   icon: 'bi-shop' },
    { id: 'jobs',        label: 'My Jobs',          icon: 'bi-briefcase' },
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
      displayName: u.displayName,
      email: u.email,
      phoneNo: u.phoneNo || '',
      bio: u.bio || '',
      country: u.country || '',
      location: u.location || '',
      pincode: u.pincode || '',
      professionalCategory: u.professionalCategory || '',
    });
  }

  setTab(id: string): void {
    this.activeTab.set(id);
    if (id === 'businesses' && !this.myBusinesses().length) this.loadMyBusinesses();
    if (id === 'jobs'       && !this.myJobs().length)       this.loadMyJobs();
  }

  toggleEdit(): void {
    this.editMode.update(v => !v);
    if (!this.editMode()) { const u = this.user(); if (u) this.patchForm(u); }
  }

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

  loadMyBusinesses(): void {
    this.loadingBusinesses.set(true);
    this.businessService.getBusinesses({}).subscribe({
      next: (r) => { this.myBusinesses.set(r.data.filter(b => b.userId === this.user()?.id)); this.loadingBusinesses.set(false); },
      error: () => this.loadingBusinesses.set(false),
    });
  }

  deleteBusiness(id: string): void {
    if (!confirm('Delete this business?')) return;
    this.deletingBusinessId.set(id);
    this.businessService.deleteBusiness(id).subscribe({
      next: () => { this.myBusinesses.update(l => l.filter(b => b.id !== id)); this.toast.success('Business deleted'); this.deletingBusinessId.set(null); },
      error: () => { this.toast.error('Failed to delete business'); this.deletingBusinessId.set(null); },
    });
  }

  loadMyJobs(): void {
    this.loadingJobs.set(true);
    this.jobService.getJobs().subscribe({
      next: (r) => { this.myJobs.set(r.data.filter(j => j.userId === this.user()?.id)); this.loadingJobs.set(false); },
      error: () => this.loadingJobs.set(false),
    });
  }

  deleteJob(id: string): void {
    if (!confirm('Delete this job?')) return;
    this.deletingJobId.set(id);
    this.jobService.deleteJob(id).subscribe({
      next: () => { this.myJobs.update(l => l.filter(j => j.id !== id)); this.toast.success('Job deleted'); this.deletingJobId.set(null); },
      error: () => { this.toast.error('Failed to delete job'); this.deletingJobId.set(null); },
    });
  }
}
