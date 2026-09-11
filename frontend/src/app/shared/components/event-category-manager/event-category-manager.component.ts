import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { EventService } from '../../../core/services/event.service';
import { ToastService } from '../../../core/services/toast.service';
import { EventCategory } from '../../../core/models';
import { ToggleComponent } from '../toggle/toggle.component';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Admin "Manage Categories" modal for Events — add/edit/disable/re-enable/
 * reorder/search event_categories. Deliberately NOT a copy of
 * admin/business/business.component.ts's category section, which is fused
 * to a "browse businesses by category, drill down" navigation model Events
 * doesn't have; this is a small, self-contained CRUD surface instead,
 * following the same `open`/`closed` input-output contract as the other
 * shared form modals (event-form-modal, business-form-modal, ...).
 *
 * Reordering is just editing a category's numeric `displayOrder` and
 * saving — same as business_categories (no drag-and-drop, no separate
 * reorder endpoint). There is deliberately no delete action: soft-disable
 * (isActive) is the only removal path, so an in-use category can never be
 * orphaned.
 */
@Component({
  selector: 'app-event-category-manager',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ToggleComponent, ScrollLockDirective, TranslatePipe],
  templateUrl: './event-category-manager.component.html',
  styleUrls: ['./event-category-manager.component.scss'],
})
export class EventCategoryManagerComponent implements OnChanges {
  private eventService = inject(EventService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  @Input() open = false;
  @Output() closed = new EventEmitter<void>();

  categories = signal<EventCategory[]>([]);
  loading = signal(false);
  search = signal('');

  showForm = signal(false);
  editingCategory = signal<EventCategory | null>(null);
  submitting = signal(false);
  submitAttempted = signal(false);
  togglingId = signal<string | null>(null);

  categoryForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    icon: ['bi-calendar-event', Validators.maxLength(50)],
    description: ['', Validators.maxLength(300)],
    displayOrder: [0],
    isActive: [true],
  });

  get f() { return this.categoryForm.controls; }

  /** Server already returns categories ordered by (display_order, name); client-side search just filters that same order. */
  filtered = computed<EventCategory[]>(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.categories();
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.showForm.set(false);
      this.search.set('');
      this.load();
    }
  }

  load(): void {
    this.loading.set(true);
    this.eventService.getCategories().subscribe({
      next: (data) => { this.categories.set(data); this.loading.set(false); },
      error: () => { this.toast.error('admin.events.categoryManager.toast.failedLoad'); this.loading.set(false); },
    });
  }

  openAdd(): void {
    this.editingCategory.set(null);
    this.submitAttempted.set(false);
    this.categoryForm.reset({ name: '', icon: 'bi-calendar-event', description: '', displayOrder: 0, isActive: true });
    this.showForm.set(true);
  }

  openEdit(cat: EventCategory): void {
    this.editingCategory.set(cat);
    this.submitAttempted.set(false);
    this.categoryForm.reset({
      name: cat.name,
      icon: cat.icon ?? 'bi-calendar-event',
      description: cat.description ?? '',
      displayOrder: cat.displayOrder ?? 0,
      isActive: cat.isActive !== false,
    });
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
  }

  submit(): void {
    this.submitAttempted.set(true);
    this.categoryForm.markAllAsTouched();
    if (this.categoryForm.invalid) return;

    this.submitting.set(true);
    const raw = this.categoryForm.value;
    const editing = this.editingCategory();
    const req$ = editing
      ? this.eventService.updateCategory(editing.id, raw)
      : this.eventService.createCategory(raw);

    req$.subscribe({
      next: (saved) => {
        this.categories.update((list) => {
          const next = editing ? list.map((c) => (c.id === saved.id ? saved : c)) : [...list, saved];
          return [...next].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name));
        });
        this.toast.success(editing ? 'admin.events.categoryManager.toast.updated' : 'admin.events.categoryManager.toast.created');
        this.submitting.set(false);
        this.showForm.set(false);
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Failed to save category');
        this.submitting.set(false);
      },
    });
  }

  /** Instant, fully-reversible — no confirm dialog needed (mirrors business.component.ts's toggleCategoryActive). */
  toggleActive(cat: EventCategory, event: Event): void {
    event.stopPropagation();
    this.togglingId.set(cat.id);
    this.eventService.updateCategory(cat.id, { isActive: !(cat.isActive !== false) }).subscribe({
      next: (updated) => {
        this.categories.update((list) => list.map((c) => (c.id === cat.id ? { ...c, ...updated } : c)));
        this.toast.success(cat.isActive === false ? 'admin.events.categoryManager.toast.enabled' : 'admin.events.categoryManager.toast.disabled');
        this.togglingId.set(null);
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Failed to update category');
        this.togglingId.set(null);
      },
    });
  }

  requestClose(): void {
    this.showForm.set(false);
    this.closed.emit();
  }
}
