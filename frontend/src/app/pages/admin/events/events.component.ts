import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { EventService } from '../../../core/services/event.service';
import { ToastService } from '../../../core/services/toast.service';
import { Event as AppEvent, PaginatedResponse } from '../../../core/models';

@Component({
  selector: 'app-admin-events',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss'],
})
export class AdminEventsComponent implements OnInit {
  private eventService = inject(EventService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  // Data
  events = signal<AppEvent[]>([]);
  loading = signal(true);
  submitting = signal(false);
  deletingId = signal<string | null>(null);

  // Pagination
  currentPage = signal(1);
  totalPages = signal(1);
  totalItems = signal(0);

  // Modal
  showAddModal = signal(false);

  // Image upload
  selectedImage = signal<File | null>(null);
  imagePreview = signal<string | null>(null);

  // Form
  eventForm!: FormGroup;

  ngOnInit(): void {
    this.initForm();
    this.loadEvents();
  }

  private initForm(): void {
    this.eventForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      eventDate: ['', Validators.required],
      eventTime: [''],
      address: [''],
      pincode: [''],
      location: [''],
    });
  }

  loadEvents(): void {
    this.loading.set(true);
    this.eventService.getEvents().subscribe({
      next: (response: PaginatedResponse<AppEvent>) => {
        this.events.set(response.data);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load events');
        this.loading.set(false);
      },
    });
  }

  openAddModal(): void {
    this.eventForm.reset();
    this.selectedImage.set(null);
    this.imagePreview.set(null);
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    this.selectedImage.set(file);

    const reader = new FileReader();
    reader.onload = () => this.imagePreview.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  removeImage(): void {
    this.selectedImage.set(null);
    this.imagePreview.set(null);
  }

  submitEvent(): void {
    if (this.eventForm.invalid) return;
    this.submitting.set(true);

    const data = this.eventForm.value;
    const images = this.selectedImage() ? [this.selectedImage()!] : undefined;

    this.eventService.createEvent(data, images).subscribe({
      next: (evt) => {
        this.events.update((list) => [evt, ...list]);
        this.toast.success('Event created successfully');
        this.closeAddModal();
        this.submitting.set(false);
      },
      error: () => {
        this.toast.error('Failed to create event');
        this.submitting.set(false);
      },
    });
  }

  deleteEvent(id: string): void {
    if (!confirm('Are you sure you want to delete this event?')) return;

    this.deletingId.set(id);
    this.eventService.deleteEvent(id).subscribe({
      next: () => {
        this.events.update((list) => list.filter((e) => e.id !== id));
        this.toast.success('Event deleted');
        this.deletingId.set(null);
      },
      error: () => {
        this.toast.error('Failed to delete event');
        this.deletingId.set(null);
      },
    });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadEvents();
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

  truncate(text: string | undefined, length: number): string {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
  }
}
