import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BusinessService } from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Business, BusinessCategory, PaginatedResponse } from '../../../core/models';

type ViewState = 'categories' | 'list' | 'detail';

@Component({
  selector: 'app-admin-business',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './business.component.html',
  styleUrls: ['./business.component.scss'],
})
export class AdminBusinessComponent implements OnInit {
  private businessService = inject(BusinessService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  // View state
  currentView = signal<ViewState>('categories');

  // Data
  categories = signal<BusinessCategory[]>([]);
  businesses = signal<Business[]>([]);
  selectedCategory = signal<BusinessCategory | null>(null);
  selectedBusiness = signal<Business | null>(null);

  // Loading
  loading = signal(true);
  submitting = signal(false);
  deletingId = signal<string | null>(null);

  // Pagination
  currentPage = signal(1);
  totalPages = signal(1);
  totalItems = signal(0);

  // Modals
  showAddBusinessModal = signal(false);
  showAddCategoryModal = signal(false);

  // Image carousel
  activeImageIndex = signal(0);

  // Image upload
  selectedImages = signal<File[]>([]);
  imagePreviews = signal<string[]>([]);

  // Forms
  businessForm!: FormGroup;
  categoryForm!: FormGroup;

  // Stats
  totalBusinesses = computed(() => {
    let sum = 0;
    this.categories().forEach((c) => (sum += c._count?.businesses ?? 0));
    return sum;
  });
  totalCategories = computed(() => this.categories().length);

  ngOnInit(): void {
    this.initForms();
    this.loadCategories();
  }

  private initForms(): void {
    this.businessForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
      categoryId: ['', Validators.required],
      address: [''],
      pincode: [''],
      phone: [''],
      email: ['', Validators.email],
      website: [''],
      openingHours: [''],
      latitude: [''],
      longitude: [''],
    });

    this.categoryForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      icon: ['bi-shop'],
    });
  }

  loadCategories(): void {
    this.loading.set(true);
    this.businessService.getCategories().subscribe({
      next: (data) => {
        this.categories.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load categories');
        this.loading.set(false);
      },
    });
  }

  loadBusinesses(category: BusinessCategory): void {
    this.selectedCategory.set(category);
    this.currentView.set('list');
    this.loading.set(true);

    this.businessService.getBusinesses(category.id).subscribe({
      next: (response: PaginatedResponse<Business>) => {
        this.businesses.set(response.data);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load businesses');
        this.loading.set(false);
      },
    });
  }

  loadBusinessDetail(business: Business): void {
    this.selectedBusiness.set(business);
    this.activeImageIndex.set(0);
    this.currentView.set('detail');
  }

  // Navigation
  goToCategories(): void {
    this.currentView.set('categories');
    this.selectedCategory.set(null);
    this.businesses.set([]);
    this.currentPage.set(1);
  }

  goToList(): void {
    this.currentView.set('list');
    this.selectedBusiness.set(null);
  }

  // Category CRUD
  openAddCategory(): void {
    this.categoryForm.reset({ icon: 'bi-shop' });
    this.showAddCategoryModal.set(true);
  }

  closeAddCategory(): void {
    this.showAddCategoryModal.set(false);
  }

  submitCategory(): void {
    if (this.categoryForm.invalid) return;
    this.submitting.set(true);

    this.businessService.createCategory(this.categoryForm.value).subscribe({
      next: (cat) => {
        this.categories.update((cats) => [...cats, cat]);
        this.toast.success('Category created successfully');
        this.closeAddCategory();
        this.submitting.set(false);
      },
      error: () => {
        this.toast.error('Failed to create category');
        this.submitting.set(false);
      },
    });
  }

  // Business CRUD
  openAddBusiness(): void {
    this.businessForm.reset({ categoryId: this.selectedCategory()?.id ?? '' });
    this.selectedImages.set([]);
    this.imagePreviews.set([]);
    this.showAddBusinessModal.set(true);
  }

  closeAddBusiness(): void {
    this.showAddBusinessModal.set(false);
  }

  onImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const files = Array.from(input.files);
    this.selectedImages.set(files);

    const previews: string[] = [];
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        previews.push(reader.result as string);
        if (previews.length === files.length) {
          this.imagePreviews.set([...previews]);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  removeImage(index: number): void {
    this.selectedImages.update((imgs) => imgs.filter((_, i) => i !== index));
    this.imagePreviews.update((prev) => prev.filter((_, i) => i !== index));
  }

  submitBusiness(): void {
    if (this.businessForm.invalid) return;
    this.submitting.set(true);

    const data = this.businessForm.value;
    const images = this.selectedImages();

    this.businessService.createBusiness(data, images.length > 0 ? images : undefined).subscribe({
      next: (business) => {
        this.businesses.update((list) => [business, ...list]);
        this.toast.success('Business created successfully');
        this.closeAddBusiness();
        this.submitting.set(false);
      },
      error: () => {
        this.toast.error('Failed to create business');
        this.submitting.set(false);
      },
    });
  }

  deleteBusiness(event: Event, id: string): void {
    event.stopPropagation();
    if (!confirm('Are you sure you want to delete this business?')) return;

    this.deletingId.set(id);
    this.businessService.deleteBusiness(id).subscribe({
      next: () => {
        this.businesses.update((list) => list.filter((b) => b.id !== id));
        this.toast.success('Business deleted');
        this.deletingId.set(null);
        if (this.currentView() === 'detail') {
          this.goToList();
        }
      },
      error: () => {
        this.toast.error('Failed to delete business');
        this.deletingId.set(null);
      },
    });
  }

  // Image Carousel
  prevImage(): void {
    const images = this.selectedBusiness()?.images ?? [];
    if (images.length === 0) return;
    this.activeImageIndex.update((i) => (i === 0 ? images.length - 1 : i - 1));
  }

  nextImage(): void {
    const images = this.selectedBusiness()?.images ?? [];
    if (images.length === 0) return;
    this.activeImageIndex.update((i) => (i === images.length - 1 ? 0 : i + 1));
  }

  setActiveImage(index: number): void {
    this.activeImageIndex.set(index);
  }

  // Pagination
  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    const cat = this.selectedCategory();
    if (cat) this.loadBusinesses(cat);
  }

  getPages(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    let end = Math.min(total, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  getCategoryIcon(icon?: string): string {
    return icon || 'bi-shop';
  }

  getDirectionsUrl(): string {
    const biz = this.selectedBusiness();
    if (!biz) return '#';
    if (biz.latitude && biz.longitude) {
      return `https://www.google.com/maps/dir/?api=1&destination=${biz.latitude},${biz.longitude}`;
    }
    if (biz.address) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz.address)}`;
    }
    return '#';
  }
}
