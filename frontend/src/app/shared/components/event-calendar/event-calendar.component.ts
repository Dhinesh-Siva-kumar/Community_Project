import { Component, ChangeDetectionStrategy, ElementRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EventService } from '../../../core/services/event.service';
import { Event as AppEvent } from '../../../core/models';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/services/language.service';

interface EventStatus {
  label: string;
  cls: string;
  isPast: boolean;
}

interface CalendarDayEvent {
  event: AppEvent;
  status: EventStatus;
}

interface CalendarCell {
  date: Date;
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  events: CalendarDayEvent[];
  hasEvents: boolean;
  allPast: boolean;
  ariaLabel: string;
}

// Catalog keys — the template pipes each through `| translate`.
const WEEKDAY_LABELS = [
  'components.calendar.weekday.mon',
  'components.calendar.weekday.tue',
  'components.calendar.weekday.wed',
  'components.calendar.weekday.thu',
  'components.calendar.weekday.fri',
  'components.calendar.weekday.sat',
  'components.calendar.weekday.sun',
];

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

@Component({
  selector: 'app-event-calendar',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './event-calendar.component.html',
  styleUrls: ['./event-calendar.component.scss'],
})
export class EventCalendarComponent implements OnInit {
  private translate = inject(TranslateService);
  private language = inject(LanguageService);

  private eventService = inject(EventService);
  private hostRef = inject(ElementRef<HTMLElement>);

  weekdayLabels = WEEKDAY_LABELS;
  skeletonCells = Array.from({ length: 42 });

  private today = startOfDay(new Date());

  viewMonth = signal<Date>(this.firstOfMonth(new Date()));
  monthEvents = signal<AppEvent[]>([]);
  loading = signal(true);
  activeDayKey = signal<string | null>(null);
  private pinnedByTouch = false;

  eventsByDay = computed(() => {
    const map = new Map<string, AppEvent[]>();
    for (const evt of this.monthEvents()) {
      const key = (evt.eventDate || '').substring(0, 10);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(evt);
      map.set(key, list);
    }
    return map;
  });

  calendarCells = computed<CalendarCell[]>(() => {
    // Cells bake in translated event status + aria labels, so recompute on switch.
    this.language.currentLang();
    const anchor = this.viewMonth();
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    // Monday-first grid — consistent with the app's UK-default locale.
    const offset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - offset);
    const byDay = this.eventsByDay();

    const cells: CalendarCell[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const inMonth = date.getMonth() === month;
      const key = toDateKey(date);
      const dayEvents = inMonth ? (byDay.get(key) ?? []) : [];
      const events: CalendarDayEvent[] = dayEvents
        .map(event => ({ event, status: this.relTime(event.eventDate) }))
        .sort((a, b) => (a.event.eventTime || '').localeCompare(b.event.eventTime || ''));
      const allPast = events.length > 0 && events.every(e => e.status.isPast);
      const eventCount = events.length;
      cells.push({
        date,
        key,
        day: date.getDate(),
        inMonth,
        isToday: startOfDay(date).getTime() === this.today.getTime(),
        events,
        hasEvents: eventCount > 0,
        allPast,
        ariaLabel: `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}` +
          (eventCount ? ` — ${this.translate.instant('components.calendar.eventCount', { count: eventCount })}` : ''),
      });
    }
    return cells;
  });

  weeks = computed<CalendarCell[][]>(() => {
    const cells = this.calendarCells();
    const rows: CalendarCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  });

  ngOnInit(): void {
    this.loadMonth();
  }

  monthLabel(): string {
    return this.viewMonth().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  isCurrentMonth(): boolean {
    const now = new Date();
    const v = this.viewMonth();
    return v.getFullYear() === now.getFullYear() && v.getMonth() === now.getMonth();
  }

  prevMonth(): void {
    const v = this.viewMonth();
    this.viewMonth.set(new Date(v.getFullYear(), v.getMonth() - 1, 1));
    this.closeAllDays();
    this.loadMonth();
  }

  nextMonth(): void {
    const v = this.viewMonth();
    this.viewMonth.set(new Date(v.getFullYear(), v.getMonth() + 1, 1));
    this.closeAllDays();
    this.loadMonth();
  }

  goToday(): void {
    this.viewMonth.set(this.firstOfMonth(new Date()));
    this.closeAllDays();
    this.loadMonth();
  }

  openDay(cell: CalendarCell): void {
    if (cell.hasEvents) this.activeDayKey.set(cell.key);
  }

  closeDay(): void {
    if (!this.pinnedByTouch) this.activeDayKey.set(null);
  }

  toggleDayPin(cell: CalendarCell): void {
    if (!cell.hasEvents) return;
    if (this.activeDayKey() === cell.key && this.pinnedByTouch) {
      this.closeAllDays();
    } else {
      this.activeDayKey.set(cell.key);
      this.pinnedByTouch = true;
    }
  }

  private closeAllDays(): void {
    this.activeDayKey.set(null);
    this.pinnedByTouch = false;
  }

  fmtTimeRange(evt: AppEvent): string {
    if (!evt.eventTime) return '';
    return evt.eventEndTime ? `${evt.eventTime} – ${evt.eventEndTime}` : evt.eventTime;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (this.pinnedByTouch && !this.hostRef.nativeElement.contains(ev.target as Node)) {
      this.closeAllDays();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeAllDays();
  }

  private firstOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  private loadMonth(): void {
    this.loading.set(true);
    const anchor = this.viewMonth();
    const from = toDateKey(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    const to = toDateKey(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
    this.eventService
      .getEvents({ eventDateFrom: from, eventDateTo: to, limit: 100, sortBy: 'eventDate', sortDir: 'asc' })
      .subscribe({
        next: res => {
          this.monthEvents.set(res.data ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.monthEvents.set([]);
          this.loading.set(false);
        },
      });
  }

  /** Reading the language signal keeps `calendarCells` — which bakes these
   * labels in — recomputing when the reader switches language. */
  private relTime(dateStr: string): EventStatus {
    this.language.currentLang();
    const eventDay = startOfDay(new Date(dateStr));
    const days = Math.round((eventDay.getTime() - this.today.getTime()) / 86400000);
    if (days < 0) return { label: this.translate.instant('components.calendar.status.completed'), cls: 'is-past', isPast: true };
    if (days === 0) return { label: this.translate.instant('components.calendar.status.today'), cls: 'is-soon', isPast: false };
    if (days === 1) return { label: this.translate.instant('components.calendar.status.tomorrow'), cls: 'is-soon', isPast: false };
    if (days <= 14) return { label: this.translate.instant('components.calendar.status.inDays', { days }), cls: '', isPast: false };
    return { label: this.translate.instant('components.calendar.status.upcoming'), cls: '', isPast: false };
  }
}
