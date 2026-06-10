import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { JobService } from '../../../core/services/job.service';
import { ToastService } from '../../../core/services/toast.service';
import { Job, PaginatedResponse } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';

@Component({
  selector: 'app-admin-jobs',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe, SearchableSelectComponent, FileUploadComponent],
  templateUrl: './jobs.component.html',
  styleUrls: ['./jobs.component.scss'],
})
export class AdminJobsComponent implements OnInit {
  private jobService = inject(JobService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  // Data
  jobs = signal<Job[]>([]);
  loading = signal(true);
  submitting = signal(false);
  deletingId = signal<string | null>(null);

  // Pagination
  currentPage = signal(1);
  totalPages = signal(1);
  totalItems = signal(0);

  // Modal
  showAddModal = signal(false);

  // Detail expansion
  expandedJobId = signal<string | null>(null);

  // Image upload
  selectedImages = signal<File[]>([]);

  // Form
  jobForm!: FormGroup;

  jobTypes = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary'];
  jobTypeOptions: SelectOption[] = this.jobTypes.map(t => ({ value: t, label: t }));

  ngOnInit(): void {
    this.initForm();
    this.loadJobs();
  }

  private initForm(): void {
    this.jobForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      specification: [''],
      description: [''],
      location: [''],
      pincode: [''],
      contactInfo: [''],
      salary: [''],
      jobType: ['Full-time'],
      timing: [''],
    });
  }

  loadJobs(): void {
    this.loading.set(true);
    this.jobService.getJobs().subscribe({
      next: (response: PaginatedResponse<Job>) => {
        this.jobs.set(response.data);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load jobs');
        this.loading.set(false);
      },
    });
  }

  toggleJobDetail(jobId: string): void {
    this.expandedJobId.update((current) => (current === jobId ? null : jobId));
  }

  openAddModal(): void {
    this.jobForm.reset({ jobType: 'Full-time' });
    this.selectedImages.set([]);
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  onJobImagesChange(files: File[]): void {
    this.selectedImages.set(files);
  }

  submitJob(): void {
    if (this.jobForm.invalid) return;
    this.submitting.set(true);

    const data = this.jobForm.value;
    const images = this.selectedImages();

    this.jobService.createJob(data, images.length > 0 ? images : undefined).subscribe({
      next: (job) => {
        this.jobs.update((list) => [job, ...list]);
        this.toast.success('Job posted successfully');
        this.closeAddModal();
        this.submitting.set(false);
      },
      error: () => {
        this.toast.error('Failed to post job');
        this.submitting.set(false);
      },
    });
  }

  deleteJob(id: string): void {
    if (!confirm('Are you sure you want to delete this job?')) return;

    this.deletingId.set(id);
    this.jobService.deleteJob(id).subscribe({
      next: () => {
        this.jobs.update((list) => list.filter((j) => j.id !== id));
        this.toast.success('Job deleted');
        this.deletingId.set(null);
      },
      error: () => {
        this.toast.error('Failed to delete job');
        this.deletingId.set(null);
      },
    });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadJobs();
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

  getJobTypeBadgeClass(type: string | undefined): string {
    switch (type) {
      case 'Full-time':
        return 'bg-success bg-opacity-10 text-success';
      case 'Part-time':
        return 'bg-info bg-opacity-10 text-info';
      case 'Contract':
        return 'bg-warning bg-opacity-10 text-warning';
      case 'Freelance':
        return 'bg-primary bg-opacity-10 text-primary';
      case 'Internship':
        return 'bg-secondary bg-opacity-10 text-secondary';
      default:
        return 'bg-dark bg-opacity-10 text-dark';
    }
  }

  truncate(text: string | undefined, length: number): string {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
  }
}
