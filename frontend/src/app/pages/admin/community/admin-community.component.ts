import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommunityService } from '../../../core/services/community.service';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { Community, CommunityRequest, Country, interests, PaginatedResponse } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-community',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './admin-community.component.html',
  styleUrls: ['./admin-community.component.scss'],
})
export class AdminCommunityComponent implements OnInit {
  private communityService = inject(CommunityService);
  private apiService = inject(ApiService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  countries: Country[] = [];
  interests: interests[] = [];

  // Signals
  communities = signal<Community[]>([]);
  loading = signal(true);
  searchTerm = signal('');
  currentPage = signal(1);
  totalPages = signal(1);
  totalItems = signal(0);
  pageSize = signal(9);
  submitting = signal(false);
  showModal = signal(false);
  editingCommunity = signal<Community | null>(null);
  selectedImage = signal<File | null>(null);
  imagePreview = signal<string | null>(null);
  deleteConfirmId = signal<string | null>(null);

  // Computed
  filteredCommunities = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.communities();
    return this.communities().filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.description?.toLowerCase().includes(term))
    );
  });

  isEditing = computed(() => !!this.editingCommunity());
  modalTitle = computed(() => this.isEditing() ? 'Edit Community' : 'Create Community');

  // Form
  communityForm!: FormGroup;

  ngOnInit(): void {
    this.initForm();
    this.loadCountries();
    this.loadInterests();
    this.loadCommunities();
  }

  initForm(): void {
  this.communityForm = this.fb.group({
    communityName: ['',[Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
    interests: [null, Validators.required],
    description: ['',[Validators.maxLength(500)]],
    image: [null], // file or URL
    isPrivate: [false],
    isGlobal: [false],
    isDefault: [false],
    countryId: [null]
  });
  }

  get f() {
  return this.communityForm.controls;
  }

loadCountries() {
  this.authService.getCountries().subscribe({
    next: (res) => {
      this.countries = res.data;
      const defaultCountry = this.countries.find(c => c.country_name === 'India');
      if (defaultCountry) {
        this.communityForm.patchValue({
          countryID: defaultCountry.country_id
        });
        this.communityForm.get('mobile')?.updateValueAndValidity();
      }
    },
    error: () => {
      this.toastService.error('Failed to load countries');
    }
  });
}

loadInterests() {
  this.authService.getInterests().subscribe({
    next: (res) => {
      this.interests = res.data;
    },
    error: () => {
      this.toastService.error('Failed to load countries');
    }
  });
}

  

  loadCommunities(): void {
    this.loading.set(true);
    
    const params: Record<string, any> = {
      user_id: this.authService.currentUser()?.id ?? 39,
      page: this.currentPage(),
      limit: this.pageSize(),
    };
    console.log('Params:', params);

    this.communityService.getCommunities(params).subscribe({
      next: (response: PaginatedResponse<Community>) => {
        this.communities.set(response.data);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load communities');
        this.loading.set(false);
      },
    });
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
  }

  openCreateModal(): void {
    this.editingCommunity.set(null);
    const defaultInterest = this.interests.find(i => i.interest_name === 'Jobs');
    this.communityForm.reset();
    if (defaultInterest) {
        this.communityForm.patchValue({
         interests : [defaultInterest.interest_id]
        });
      }
    this.selectedImage.set(null);
    this.imagePreview.set(null);
    this.showModal.set(true);
  }

  openEditModal(community: Community): void {
    this.editingCommunity.set(community);
    this.communityForm.patchValue({
      communityName: community.name,
      description: community.description,
      image: community.image,
    });
    this.imagePreview.set(community.image || null);
    this.selectedImage.set(null);
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingCommunity.set(null);
    this.communityForm.reset();
    this.selectedImage.set(null);
    this.imagePreview.set(null);
  }

  onImageSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.selectedImage.set(file);
      const reader = new FileReader();
      reader.onload = () => {
        this.imagePreview.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  removeImage(): void {
    this.selectedImage.set(null);
    this.imagePreview.set(null);
  }

  submitForm(): void {
    if (this.communityForm.invalid) {
      this.communityForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const formData = this.communityForm.value;
    const image = this.selectedImage();

    const communityData = { ...this.communityForm.value };

    const payload = this.mapToPayload(communityData);

    if (this.isEditing()) {
        const editId = this.editingCommunity()?.id!;
        this.communityService.updateCommunity(editId, payload).subscribe({
          next: () => {
            this.toast.success('Community updated successfully');
            this.closeModal();
            this.loadCommunities();
            this.submitting.set(false);
          },
          error: () => {
            this.toast.error('Failed to update community');
            this.submitting.set(false);
          },
        });
    } else {
        this.communityService.createCommunity(payload).subscribe({
          next: () => {
            this.toast.success('Community created successfully');
            this.closeModal();
            this.loadCommunities();
            this.submitting.set(false);
          },
          error: () => {
            this.toast.error('Failed to create community');
            this.submitting.set(false);
          },
        });
    }
  }

  confirmDelete(id: string): void {
    this.deleteConfirmId.set(id);
  }

  cancelDelete(): void {
    this.deleteConfirmId.set(null);
  }

  deleteCommunity(id: string): void {
    this.communityService.deleteCommunity(id).subscribe({
      next: () => {
        this.toast.success('Community deleted successfully');
        this.deleteConfirmId.set(null);
        this.loadCommunities();
      },
      error: () => {
        this.toast.error('Failed to delete community');
        this.deleteConfirmId.set(null);
      },
    });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadCommunities();
  }

  getPages(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const maxVisible = 5;

    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    let end = Math.min(total, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  truncate(text: string | undefined, length: number): string {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
  }

  private mapToPayload(form: any): CommunityRequest {
    return {
      name: form.communityName,
      description: form.description,
    };
  }
}
