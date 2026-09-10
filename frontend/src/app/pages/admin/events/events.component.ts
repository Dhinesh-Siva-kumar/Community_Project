import { Component, OnInit, OnDestroy, HostListener, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { EventService } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { ToastService } from '../../../core/services/toast.service';
import { Event as AppEvent, VisibilityType, PaginatedResponse, Country } from '../../../core/models';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { ScrollLockDirective } from '../../../shared/directives/scroll-lock.directive';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { SortBarComponent, SortField, SortChange, SortDir } from '../../../shared/components/sort-bar/sort-bar.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { DateInputComponent } from '../../../shared/components/date-input/date-input.component';
import { EventFormModalComponent } from '../../../shared/components/event-form-modal/event-form-modal.component';
import { EventDateBadgeComponent } from '../../../shared/components/event-date-badge/event-date-badge.component';
import { TranslatePipe } from '@ngx-translate/core';
import { EnumLabelPipe } from '../../../shared/pipes/enum-label.pipe';
import { EVENT_CATEGORIES, EVENT_CATEGORY_ICON } from '../../../shared/constants/event-categories';

// Remembers the last selected view mode (grid/table) across navigations.
const VIEW_STORAGE_KEY = 'admin-events:viewMode';

/** Every column the table view can sort by (all but Actions). */
type EventSortField = 'name' | 'eventDate' | 'joined' | 'category' | 'mode' | 'location' | 'status';

@Component({
  selector: 'app-admin-events',
  standalone: true,
  imports: [DateInputComponent, CommonModule, FormsModule, DatePipe, RouterLink, ImageErrorHandlerDirective, ScrollLockDirective, SearchableSelectComponent, SortBarComponent, EventFormModalComponent, EventDateBadgeComponent, ImageUrlPipe, TranslatePipe, EnumLabelPipe],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss'],
  // Pushes the page's own content left (see :host in the scss) while the
  // Advanced Filters drawer is open, instead of letting the fixed-position
  // drawer just sit on top of — and hide — the right edge of the events list.
  host: { '[class.jb-adv-open]': 'showAdvancedFilters()' },
})
export class AdminEventsComponent implements OnInit, OnDestroy {
  private eventService = inject(EventService);
  private authService = inject(AuthService);
  private layoutService = inject(LayoutService);
  private toast = inject(ToastService);
  private router = inject(Router);

  ngOnDestroy(): void {
    this.layoutService.forceSidebarCollapsed.set(false);
  }

  events     = signal<AppEvent[]>([]);
  loading    = signal(true);
  // Gates the full-page skeleton — true only until the very first fetch
  // resolves, then stays true forever after. Later fetches (stat-card
  // click, search, filter, sort) still flip `loading`, but the stats bar /
  // results meta / list stay mounted throughout instead of unmounting into
  // a skeleton and back, which read as the whole page blinking.
  pageReady  = signal(false);
  skeletons  = Array(6);

  // Floating header action (shows once scrolled past the page header)
  showHeaderFab = signal(false);
  private scrollTicking = false;

  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (this.scrollTicking) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.showHeaderFab.set(window.scrollY >= 120);
      this.scrollTicking = false;
    });
  }

  currentPage = signal(1);
  totalPages  = signal(1);
  totalItems  = signal(0);

  searchQuery = signal('');
  filterCountry  = signal('');
  filterStatus   = signal<'upcoming' | 'completed' | ''>('');
  filterEventMode = signal<'Offline' | 'Online' | 'Hybrid' | ''>('');
  filterDateFrom = signal('');
  filterDateTo   = signal('');
  activeQuickRange = signal<'today' | '7d' | '30d' | null>(null);
  // Opt-in visibility filter, independent of the automatic country/worldwide
  // access gate applied server-side (mirrors the user Events/Jobs pages).
  filterVisibility = signal<'' | VisibilityType>('');
  // Category filter — same option list the Add/Edit Event form uses.
  filterCategory = signal('');
  readonly categoryFilterOptions: SelectOption[] = EVENT_CATEGORIES.map((c) => ({ value: c, label: c }));
  private searchDebounce: any = null;

  // Premium filter UI state
  showAdvancedFilters = signal(false);
  viewMode = signal<'grid' | 'table'>('grid');

  filterCountryOptions: SelectOption[] = [];
  readonly statusFilterOptions: SelectOption[] = [
    { value: '',          label: 'admin.events.label.allStatus' },
    { value: 'upcoming',  label: 'admin.events.label.upcoming' },
    { value: 'completed', label: 'admin.events.label.completed' },
  ];
  readonly pageSizeOptions: SelectOption[] = [
    { value: 20,  label: '20' },
    { value: 50,  label: '50' },
    { value: 100, label: '100' },
  ];
  pageSize = signal(20);

  // ── Sort — driven by the sort-bar above the grid ────────────
  readonly sortFields: SortField[] = [
    { key: 'joined',    label: 'admin.events.label.created' },
    { key: 'eventDate', label: 'admin.events.label.eventDate' },
    { key: 'name',      label: 'admin.events.label.name' },
  ];
  sortBy  = signal<EventSortField>('joined');
  sortDir = signal<SortDir>('desc');

  onSortChange(change: SortChange): void {
    this.sortBy.set(change.sortBy as EventSortField);
    this.sortDir.set(change.sortDir);
    this.applyFilters();
  }

  setViewMode(mode: 'grid' | 'table'): void {
    this.viewMode.set(mode);
    sessionStorage.setItem(VIEW_STORAGE_KEY, mode);
  }

  /** Toggle sort for a clickable table column header — re-clicking the same column flips direction. */
  toggleSort(field: EventSortField): void {
    if (this.sortBy() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDir.set('desc');
    }
    this.applyFilters();
  }

  // Stat-card counts — fetched separately (see loadEventStatCounts()) so
  // each card always shows its own true total regardless of which card is
  // currently selected, instead of being derived from whatever page
  // `events()` currently holds (which — once a card filters the list — no
  // longer contains any of the OTHER cards' events, making their counts
  // collapse to 0 and making the stat bar look broken).
  totalEventsCount    = signal(0);
  upcomingEventsCount = signal(0);
  hybridEventsCount   = signal(0);
  offlineEventsCount  = signal(0);

  // Server-side filtering: component list is whatever the API returned.
  filteredEvents = computed(() => this.events());

  // Computed property: count of active filters
  activeFilterCount = computed(() => {
    let count = 0;
    if (this.searchQuery()) count++;
    if (this.filterCountry()) count++;
    if (this.filterStatus()) count++;
    if (this.filterEventMode()) count++;
    if (this.filterVisibility()) count++;
    if (this.filterCategory()) count++;
    if (this.filterDateFrom()) count++;
    if (this.filterDateTo()) count++;
    return count;
  });

  // ── Add/Edit Event modal — the form itself is app-event-form-modal
  // (shared with the user Events page); this component only tracks
  // open/closed state and which id (if any) is being edited. ──
  showAddModal      = signal(false);
  editEventId       = signal<string | null>(null);
  showDeleteConfirm = signal(false);
  eventToDelete     = signal<AppEvent | null>(null);
  deleting          = signal(false);

  readonly EVENT_MODES = ['Offline','Online','Hybrid'] as const;

  ngOnInit(): void { this.restoreSavedViewMode(); this.loadEvents(); this.loadCountries(); }

  /** Resume the last selected grid/table view across navigations. */
  private restoreSavedViewMode(): void {
    const saved = sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === 'grid' || saved === 'table') this.viewMode.set(saved);
  }

  loadCountries(): void {
    this.authService.getCountries().subscribe({
      next: (res) => {
        this.filterCountryOptions = res.data.map((c: Country) => ({ value: c.name, label: c.name }));
      },
    });
  }

  loadEvents(): void {
    this.loading.set(true);
    this.loadEventStatCounts();
    const params: Record<string, any> = {
      page: this.currentPage(),
      limit: this.pageSize(),
      sortBy: this.sortBy(),
      sortDir: this.sortDir(),
    };
    if (this.searchQuery().trim()) params['search'] = this.searchQuery().trim();
    if (this.filterCountry())      params['country'] = this.filterCountry();
    if (this.filterStatus())       params['status']  = this.filterStatus();
    if (this.filterEventMode())    params['eventMode'] = this.filterEventMode();
    if (this.filterVisibility())   params['visibilityType'] = this.filterVisibility();
    if (this.filterCategory())     params['eventCategory'] = this.filterCategory();
    if (this.filterDateFrom())     params['dateFrom'] = this.filterDateFrom();
    if (this.filterDateTo())       params['dateTo']   = this.filterDateTo();

    this.eventService.getEvents(params).subscribe({
      next: (res: PaginatedResponse<AppEvent>) => {
        this.events.set(res.data); this.totalPages.set(res.totalPages);
        this.totalItems.set(res.total); this.loading.set(false);
        this.pageReady.set(true);
      },
      error: () => { this.toast.error('admin.events.toast.failedLoadEvents'); this.loading.set(false); this.pageReady.set(true); },
    });
  }

  /** Powers the four stat cards — lightweight `limit:1` calls scoped by
   * search/country only (every filter EXCEPT status/eventMode, which is
   * what the cards themselves toggle), so each count stays accurate no
   * matter which card is currently selected. */
  private loadEventStatCounts(): void {
    const base: Record<string, any> = { page: 1, limit: 1 };
    if (this.searchQuery().trim()) base['search']  = this.searchQuery().trim();
    if (this.filterCountry())      base['country'] = this.filterCountry();

    this.eventService.getEvents(base).subscribe({
      next: (res) => this.totalEventsCount.set(res.total), error: () => {},
    });
    this.eventService.getEvents({ ...base, status: 'upcoming' }).subscribe({
      next: (res) => this.upcomingEventsCount.set(res.total), error: () => {},
    });
    this.eventService.getEvents({ ...base, eventMode: 'Hybrid' }).subscribe({
      next: (res) => this.hybridEventsCount.set(res.total), error: () => {},
    });
    this.eventService.getEvents({ ...base, eventMode: 'Offline' }).subscribe({
      next: (res) => this.offlineEventsCount.set(res.total), error: () => {},
    });
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadEvents();
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.applyFilters(), 300);
  }

  setCountryFilter(v: string | number): void {
    this.filterCountry.set(v as string);
    this.applyFilters();
  }

  setStatusFilter(v: string | number): void {
    this.filterStatus.set(v as 'upcoming' | 'completed' | '');
    this.applyFilters();
  }

  setEventModeFilter(mode: 'Offline' | 'Online' | 'Hybrid' | null): void {
    this.filterEventMode.set(mode ?? '');
    this.applyFilters();
  }

  setVisibilityFilter(v: '' | VisibilityType): void {
    this.filterVisibility.set(v);
    this.applyFilters();
  }

  setCategoryFilter(v: string | number): void {
    this.filterCategory.set(v as string);
    this.applyFilters();
  }

  /** The four stat cards (Total/Upcoming/Hybrid/Offline) all drive this one
   * derived value, so exactly one is ever selected at a time — "Upcoming"
   * reuses the existing server-side `filterStatus` ("Status" in Advanced
   * Filters) rather than a separate client-side date hack, and Hybrid/
   * Offline reuse `filterEventMode`; each setter clears the other axis so
   * they can't both be active simultaneously. */
  eventStatFilter = computed<'all' | 'upcoming' | 'hybrid' | 'offline'>(() => {
    if (this.filterStatus() === 'upcoming') return 'upcoming';
    if (this.filterEventMode() === 'Hybrid') return 'hybrid';
    if (this.filterEventMode() === 'Offline') return 'offline';
    return 'all';
  });

  /** Toggles off back to 'all' on a repeat click of the same card. */
  setEventStatFilter(value: 'all' | 'upcoming' | 'hybrid' | 'offline'): void {
    const next = this.eventStatFilter() === value ? 'all' : value;
    this.filterStatus.set(next === 'upcoming' ? 'upcoming' : '');
    this.filterEventMode.set(next === 'hybrid' ? 'Hybrid' : next === 'offline' ? 'Offline' : '');
    this.applyFilters();
  }

  onFilterDateFromChange(value: string): void {
    this.activeQuickRange.set(null);
    this.filterDateFrom.set(value);
    this.applyFilters();
  }

  onFilterDateToChange(value: string): void {
    this.activeQuickRange.set(null);
    this.filterDateTo.set(value);
    this.applyFilters();
  }

  applyQuickDatePreset(preset: 'today' | '7d' | '30d'): void {
    const today = new Date();
    const to = this.toInputDate(today);

    if (preset === 'today') {
      this.filterDateFrom.set(to);
      this.filterDateTo.set(to);
      this.activeQuickRange.set('today');
      this.applyFilters();
      return;
    }

    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - (preset === '7d' ? 6 : 29));
    this.filterDateFrom.set(this.toInputDate(fromDate));
    this.filterDateTo.set(to);
    this.activeQuickRange.set(preset);
    this.applyFilters();
  }

  private toInputDate(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.applyFilters();
  }

  /** Advanced Filters lives in a right-side drawer — while it's open, the
   * app shell's sidebar auto-minimizes (via LayoutService) for extra width. */
  toggleAdvancedFilters(): void {
    this.showAdvancedFilters.update(v => !v);
    this.layoutService.forceSidebarCollapsed.set(this.showAdvancedFilters());
  }

  closeAdvancedFilters(): void {
    this.showAdvancedFilters.set(false);
    this.layoutService.forceSidebarCollapsed.set(false);
  }

  clearAllFilters(): void {
    this.searchQuery.set('');
    this.filterCountry.set('');
    this.filterStatus.set('');
    this.filterEventMode.set('');
    this.filterVisibility.set('');
    this.filterCategory.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.activeQuickRange.set(null);
    this.applyFilters();
  }

  removeFilter(key: string): void {
    switch (key) {
      case 'search':     this.searchQuery.set('');   break;
      case 'country':    this.filterCountry.set(''); break;
      case 'status':     this.filterStatus.set('');  break;
      case 'eventMode':  this.filterEventMode.set(''); break;
      case 'visibility': this.filterVisibility.set(''); break;
      case 'category':   this.filterCategory.set(''); break;
      case 'dateFrom':   this.filterDateFrom.set(''); break;
      case 'dateTo':     this.filterDateTo.set('');  break;
    }
    if (key === 'dateFrom' || key === 'dateTo') this.activeQuickRange.set(null);
    this.applyFilters();
  }

  // ─── Add/Edit Event modal — the form itself is app-event-form-modal
  // (shared with the user Events page); it loads the full record itself,
  // so this component only tracks which id (if any) is being edited. ───
  openAddModal(): void {
    this.editEventId.set(null);
    this.showAddModal.set(true);
  }

  /** The whole card/row is clickable — this is what it navigates to (edit/delete/links inside it stop propagation so they don't also trigger this). */
  viewEventDetails(evt: AppEvent): void {
    this.router.navigate(['/admin/events', evt.id]);
  }

  openEditModal(evt: AppEvent, event: Event): void {
    event.stopPropagation();
    this.editEventId.set(evt.id);
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
    this.editEventId.set(null);
  }

  onEventSaved(evt: AppEvent): void {
    const wasEditing = this.editEventId() !== null;
    if (wasEditing) {
      this.events.update(l => l.map(e => e.id === evt.id ? evt : e));
    } else {
      this.events.update(l => [evt, ...l]);
      this.totalItems.update(v => v + 1);
    }
  }

  openDeleteConfirm(evt: AppEvent, event: Event): void {
    event.stopPropagation(); this.eventToDelete.set(evt); this.showDeleteConfirm.set(true);
  }
  closeDeleteConfirm(): void { this.showDeleteConfirm.set(false); this.eventToDelete.set(null); }
  confirmDelete(): void {
    const evt = this.eventToDelete(); if (!evt) return;
    this.deleting.set(true);
    this.eventService.deleteEvent(evt.id).subscribe({
      next: () => { this.events.update(l => l.filter(e => e.id !== evt.id)); this.totalItems.update(v => v - 1); this.toast.success('admin.events.toast.eventDeleted'); this.closeDeleteConfirm(); this.deleting.set(false); },
      error: () => { this.toast.error('admin.events.toast.failedDeleteEvent'); this.deleting.set(false); },
    });
  }
  // backward compat
  deleteEvent(id: string): void { const e = this.events().find(x => x.id === id); if (e) this.openDeleteConfirm(e, new MouseEvent('click')); }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page); this.loadEvents();
  }
  getPages(): number[] {
    const total = this.totalPages(), cur = this.currentPage(), max = 5;
    let s = Math.max(1, cur - Math.floor(max/2));
    const e = Math.min(total, s + max - 1); s = Math.max(1, e - max + 1);
    return Array.from({ length: e - s + 1 }, (_, i) => s + i);
  }

  showingFrom(): number { return this.totalItems() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1; }
  showingTo():   number { return Math.min(this.currentPage() * this.pageSize(), this.totalItems()); }
  truncate(text: string | undefined, n: number): string {
    if (!text) return ''; return text.length > n ? text.substring(0, n) + '…' : text;
  }

  categoryIcon(cat?: string): string { return EVENT_CATEGORY_ICON[cat ?? ''] ?? 'bi-calendar-event'; }

  getEventStatus(evt: AppEvent): { label: string; type: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(evt.eventDate);
    
    if (eventDate >= today) {
      return { label: 'admin.events.label.upcoming', type: 'upcoming' };
    } else {
      return { label: 'admin.events.label.completed', type: 'completed' };
    }
  }

  /** "09:11" → "9:11 AM" */
  private to12h(time24: string): string {
    const [h, m] = time24.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return time24;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  /** "09:11" + "11:12" + "Asia/Kolkata" → "9:11 AM – 11:12 AM (Asia/Kolkata)" */
  formatEventTime(evt: AppEvent): string {
    if (!evt.eventTime) return '';
    let text = this.to12h(evt.eventTime);
    if (evt.eventEndTime) text += ' – ' + this.to12h(evt.eventEndTime);
    if (evt.timezone) text += ` (${evt.timezone})`;
    return text;
  }

  /** Address + Venue/City - Pincode, Country → "12 Main St, City Hall - 600001, India" */
  formatEventAddress(evt: AppEvent): string {
    const parts: string[] = [];
    if (evt.address) parts.push(evt.address);
    const venuePincode = [evt.location, evt.pincode].filter(Boolean).join(' - ');
    if (venuePincode) parts.push(venuePincode);
    if (evt.country) parts.push(evt.country);
    return parts.join(', ');
  }
}
