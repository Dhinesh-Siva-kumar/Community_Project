import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { UserService } from '../../../core/services/user.service';
import { PostService } from '../../../core/services/post.service';
import { AuthService } from '../../../core/services/auth.service';
import { CommunityService } from '../../../core/services/community.service';
import { DashboardStats, Post, AuditLog, ChartData, CommunityAnalyticsCounts } from '../../../core/models';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss'],
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private postService = inject(PostService);
  private authService = inject(AuthService);
  private communityService = inject(CommunityService);
  private clockTimer?: number;

  loading         = signal(true);
  stats           = signal<DashboardStats | null>(null);
  pendingPosts    = signal<Post[]>([]);
  auditLogs       = signal<AuditLog[]>([]);
  chartData       = signal<ChartData | null>(null);
  communityCounts = signal<CommunityAnalyticsCounts | null>(null);
  today           = signal(new Date());

  // Overview KPI counters animate up from 0 on first load — a small
  // "alive" touch on the numbers that matter most on the page.
  animatedOverview = signal({
    users: 0, communities: 0, jobs: 0, business: 0,
    userVerification: 0, businessVerification: 0, jobApproval: 0, postApproval: 0,
    reports: 0, emergency: 0, blocked: 0,
  });
  private overviewAnimFrame: number | null = null;

  // Growth Trends date range
  loadingChart  = signal(false);
  chartPreset   = signal<'7d' | '30d' | '90d' | 'custom'>('7d');
  chartFrom     = signal<string>(this.isoDaysAgo(6));
  chartTo       = signal<string>(this.isoDaysAgo(0));
  chartRangeMax = this.isoDaysAgo(0); // date inputs can't select into the future

  // Pagination & Filter for Recent Activity
  activityCurrentPage    = signal(1);
  activityItemsPerPage   = signal(6);
  activitySelectedFilter = signal<string | 'all'>('all');

  // Filtered and paginated activity list
  filteredActivity = computed(() => {
    const activity = this.stats()?.recentActivity ?? [];
    const filter = this.activitySelectedFilter();
    
    if (filter === 'all') {
      return activity;
    }
    return activity.filter(item => item.type === filter);
  });

  paginatedActivity = computed(() => {
    const filtered = this.filteredActivity();
    const page = this.activityCurrentPage();
    const itemsPerPage = this.activityItemsPerPage();
    const startIdx = (page - 1) * itemsPerPage;
    return filtered.slice(startIdx, startIdx + itemsPerPage);
  });

  activityTotalPages = computed(() => {
    const filtered = this.filteredActivity();
    const itemsPerPage = this.activityItemsPerPage();
    return Math.ceil(filtered.length / itemsPerPage);
  });

  // Get unique activity types for filter dropdown
  activityTypes = computed(() => {
    const activity = this.stats()?.recentActivity ?? [];
    const types = new Set(activity.map(a => a.type));
    return Array.from(types).sort();
  });

  // Helper to generate page numbers for pagination
  getPageNumbers(): number[] {
    const totalPages = this.activityTotalPages();
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  // Derived bar height arrays — normalised 0–100 relative to max value in each series
  userBars      = computed(() => this._normalise(this.chartData()?.users));
  communityBars = computed(() => this._normalise(this.chartData()?.communities));
  postBars      = computed(() => this._normalise(this.chartData()?.posts));

  userValues      = computed(() => this.chartData()?.users        ?? []);
  communityValues = computed(() => this.chartData()?.communities  ?? []);
  postValues      = computed(() => this.chartData()?.posts        ?? []);

  // "2026-06-14" → "Jun 14"
  dayLabel(iso: string): string {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  chartLabels = computed(() =>
    (this.chartData()?.labels ?? []).map(d => this.dayLabel(d))
  );

  private _normalise(values?: number[]): number[] {
    if (!values?.length) return [20, 40, 30, 60, 50, 80, 100];
    const max = Math.max(...values, 1);
    return values.map(v => Math.max(8, Math.round((v / max) * 100)));
  }

  // ── Line chart geometry (0–100 viewBox, indexed to each series' own max) ──
  chartPointCount = computed(() => this.chartLabels().length || 7);

  chartX = computed(() => {
    const n = this.chartPointCount();
    const step = n > 1 ? 100 / (n - 1) : 0;
    return Array.from({ length: n }, (_, i) => Number((i * step).toFixed(2)));
  });

  private toPolyline(bars: number[]): string {
    const xs = this.chartX();
    return bars.map((v, i) => `${xs[i] ?? 0},${(100 - v).toFixed(2)}`).join(' ');
  }

  userLine      = computed(() => this.toPolyline(this.userBars()));
  communityLine = computed(() => this.toPolyline(this.communityBars()));
  postLine      = computed(() => this.toPolyline(this.postBars()));

  // Simple first-vs-last % change over the selected Growth Trends range —
  // powers the delta badge on the hero KPI tiles (Users/Communities/Posts).
  metricDeltaPct(values: number[]): number {
    if (!values.length) return 0;
    const first = values[0] ?? 0;
    const last = values[values.length - 1] ?? 0;
    if (first === 0) return last > 0 ? 100 : 0;
    return Math.round(((last - first) / first) * 100);
  }

  // ── Hover crosshair ──────────────────────────────────────────
  hoveredIndex = signal<number | null>(null);

  setHoveredIndex(i: number): void { this.hoveredIndex.set(i); }
  clearHoveredIndex(): void { this.hoveredIndex.set(null); }

  hoveredXPct = computed(() => {
    const i = this.hoveredIndex();
    if (i === null) return 0;
    return this.chartX()[i] ?? 0;
  });

  // keep the tooltip card fully inside the chart card at the edges
  tooltipLeftPct = computed(() => Math.min(88, Math.max(12, this.hoveredXPct())));

  // Thin out x-axis text on long ranges (e.g. 90 points) so labels don't collide —
  // the hit column / tooltip still exists for every single day either way.
  chartLabelStride = computed(() => Math.max(1, Math.ceil(this.chartPointCount() / 8)));

  chartRangeLabel = computed(() => {
    switch (this.chartPreset()) {
      case '7d':  return 'Last 7 days';
      case '30d': return 'Last 30 days';
      case '90d': return 'Last 90 days';
      default: {
        const from = this.chartFrom(), to = this.chartTo();
        if (!from || !to) return '';
        const fmt = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${fmt(from)} – ${fmt(to)}`;
      }
    }
  });

  private isoDaysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  setChartPreset(preset: '7d' | '30d' | '90d'): void {
    this.chartPreset.set(preset);
    const daysBack = preset === '7d' ? 6 : preset === '30d' ? 29 : 89;
    this.chartFrom.set(this.isoDaysAgo(daysBack));
    this.chartTo.set(this.isoDaysAgo(0));
    this.loadChartData();
  }

  showCustomRange(): void {
    this.chartPreset.set('custom');
  }

  onChartFromInput(event: Event): void {
    this.chartFrom.set((event.target as HTMLInputElement).value);
  }

  onChartToInput(event: Event): void {
    this.chartTo.set((event.target as HTMLInputElement).value);
  }

  applyCustomChartRange(): void {
    if (!this.chartFrom() || !this.chartTo() || this.chartFrom() > this.chartTo()) return;
    this.loadChartData();
  }

  loadChartData(): void {
    this.loadingChart.set(true);
    this.userService.getChartData(this.chartFrom(), this.chartTo()).subscribe({
      next: (charts) => { this.chartData.set(charts); this.loadingChart.set(false); },
      error: () => this.loadingChart.set(false),
    });
  }

  // Every entry routes to a real, currently-reachable admin page (no dead
  // links to unwired features) — "Review Pending Posts" in particular is a
  // direct shortcut to /admin/approval (Posts is its default tab), so that
  // moderation task is still one click away now that Post Approval no
  // longer has its own standalone page.
  quickActions = [
    { label: 'Create Community',      icon: 'bi-plus-circle',     bg: '#fff3e0', color: '#855300', route: '/admin/community'       },
    { label: 'Review Pending Posts',  icon: 'bi-hourglass-split', bg: '#fdecea', color: '#ba1a1a', route: '/admin/approval'        },
    { label: 'Manage Users',          icon: 'bi-person-gear',     bg: '#e6faf3', color: '#006c49', route: '/admin/user-management' },
    { label: 'Business Listings',     icon: 'bi-building',        bg: '#e8f0ff', color: '#005ac2', route: '/admin/business'        },
  ];

  ngOnInit(): void {
    this.load();
    this.loadChartData();
    this.loadCommunityCounts();
    this.clockTimer = window.setInterval(() => this.today.set(new Date()), 60_000);
  }

  loadCommunityCounts(): void {
    this.communityService.getCommunityAnalytics().subscribe({
      next: (counts) => this.communityCounts.set(counts),
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.overviewAnimFrame !== null) cancelAnimationFrame(this.overviewAnimFrame);
  }

  load(): void {
    this.loading.set(true);
    forkJoin({
      stats:   this.userService.getDashboardStats(),
      pending: this.postService.getPendingPosts(),
      audit:   this.userService.getAuditLogs({ limit: 5 }),
    }).subscribe({
      next: ({ stats, pending, audit }) => {
        this.stats.set(stats);
        this.pendingPosts.set(pending.data ?? []);
        this.auditLogs.set(audit.data ?? []);
        this.loading.set(false);
        this.animateOverviewCounters();
      },
      error: () => this.loading.set(false),
    });
  }

  private animateOverviewCounters(): void {
    const targets = {
      users: this.stats()?.totalUsers ?? 0,
      communities: this.stats()?.totalCommunities ?? 0,
      jobs: this.stats()?.totalJobs ?? 0,
      business: this.stats()?.totalBusinesses ?? 0,
      userVerification: this.stats()?.pendingUserVerification ?? 0,
      businessVerification: this.stats()?.pendingBusinessVerification ?? 0,
      jobApproval: this.stats()?.pendingJobApproval ?? 0,
      postApproval: this.stats()?.pendingPosts ?? 0,
      reports: this.stats()?.reportsToReview ?? 0,
      emergency: this.stats()?.communityEmergencyRequests ?? 0,
      blocked: this.stats()?.blockedUsers ?? 0,
    };
    const duration = 900;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.animatedOverview.set({
        users: Math.round(targets.users * eased),
        communities: Math.round(targets.communities * eased),
        jobs: Math.round(targets.jobs * eased),
        business: Math.round(targets.business * eased),
        userVerification: Math.round(targets.userVerification * eased),
        businessVerification: Math.round(targets.businessVerification * eased),
        jobApproval: Math.round(targets.jobApproval * eased),
        postApproval: Math.round(targets.postApproval * eased),
        reports: Math.round(targets.reports * eased),
        emergency: Math.round(targets.emergency * eased),
        blocked: Math.round(targets.blocked * eased),
      });
      if (progress < 1) this.overviewAnimFrame = requestAnimationFrame(tick);
    };

    this.overviewAnimFrame = requestAnimationFrame(tick);
  }

  // Upcoming's share of (upcoming + last-30-days), for the two-tone events bar
  eventUpcomingSharePct(): number {
    const upcoming = this.chartData()?.eventsUpcoming ?? 0;
    const past = this.chartData()?.eventsPast30d ?? 0;
    const total = upcoming + past;
    return total > 0 ? Math.round((upcoming / total) * 100) : 50;
  }

  // ── Activity mix — breakdown of the Recent Activity feed by type.
  // Each entry has exactly one type, so unlike business/job active-counts
  // this is a true partition (shares sum to 100%) — a fair use of a segmented bar.
  activityMix = computed(() => {
    const activity = this.stats()?.recentActivity ?? [];
    const counts = new Map<string, number>();
    for (const item of activity) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
    const total = activity.length;
    return Array.from(counts.entries())
      .map(([type, count]) => ({
        type,
        label: this.activityLabel(type),
        color: this.activityColor(type),
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  });

  activityIcon(type: string): string {
    const map: Record<string, string> = {
      user: 'bi-person-plus-fill', pending_post: 'bi-hourglass-split',
      emergency_post: 'bi-exclamation-triangle-fill', post: 'bi-file-earmark-text-fill',
      business: 'bi-shop', event: 'bi-calendar-event-fill', job: 'bi-briefcase-fill',
    };
    return map[type] ?? 'bi-activity';
  }

  activityColor(type: string): string {
    const map: Record<string, string> = {
      user: '#f59e0b', pending_post: '#855300', emergency_post: '#ba1a1a',
      post: '#005ac2', business: '#7c3aed', event: '#d97706', job: '#78716c',
    };
    return map[type] ?? '#a8a29e';
  }

  activityLabel(type: string): string {
    const map: Record<string, string> = {
      user: 'Member', pending_post: 'Review', emergency_post: 'Alert',
      post: 'Post', business: 'Business', event: 'Event', job: 'Job',
    };
    return map[type] ?? type;
  }

  // ── Activity timeline day grouping ──────────────────────────
  activityDayLabel(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const startOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
    const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }

  isNewActivityDay(index: number): boolean {
    if (index === 0) return true;
    const list = this.paginatedActivity();
    return this.activityDayLabel(list[index].createdAt) !== this.activityDayLabel(list[index - 1].createdAt);
  }

  auditInitials(log: AuditLog): string {
    const name = log.actor?.displayName || log.actor?.userName || '?';
    return name.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);
  }

  auditActionClass(action: string): 'neutral' | 'danger' {
    return action.toLowerCase().includes('delete') || action.toLowerCase().includes('block') || action.toLowerCase().includes('lock')
      ? 'danger' : 'neutral';
  }

  getTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d === 1) return 'yesterday';
    if (d < 7)  return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  formatTs(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).replace(',', ' ·');
  }

  getAdminFirstName(): string {
    const user = this.authService.currentUser();
    if (!user) return 'Admin';
    return (user.displayName || user.userName || 'Admin').split(' ')[0];
  }

  // ── Time-aware greeting methods ──────────────────────────────
  
  getGreetingText(): string {
    const hour = new Date().getHours();
    const firstName = this.getAdminFirstName();
    
    if (hour >= 5 && hour < 12) {
      return `Good Morning, ${firstName}!`;
    } else if (hour >= 12 && hour < 17) {
      return `Good Afternoon, ${firstName}!`;
    } else {
      return `Good Evening, ${firstName}!`;
    }
  }

  getGreetingIcon(): string {
    const hour = new Date().getHours();
    
    if (hour >= 5 && hour < 12) {
      return 'bi-sunrise'; // Morning
    } else if (hour >= 12 && hour < 17) {
      return 'bi-sun'; // Afternoon
    } else {
      return 'bi-moon'; // Evening
    }
  }

  getGreetingEmoji(): string {
    const hour = new Date().getHours();
    
    if (hour >= 5 && hour < 12) {
      return '🌅';
    } else if (hour >= 12 && hour < 17) {
      return '☀️';
    } else {
      return '🌙';
    }
  }

  getGreetingColor(): string {
    const hour = new Date().getHours();
    
    if (hour >= 5 && hour < 12) {
      return '#F59E0B'; // Amber (morning warmth)
    } else if (hour >= 12 && hour < 17) {
      return '#FBBF24'; // Bright amber (afternoon brightness)
    } else {
      return '#78716C'; // Muted stone (evening calm)
    }
  }

  getAdminInitials(): string {
    const user = this.authService.currentUser();
    if (!user) return 'A';
    const name = user.displayName || user.userName || 'Admin';
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  getAdminFullName(): string {
    const user = this.authService.currentUser();
    if (!user) return 'Admin';
    return user.displayName || user.userName || 'Admin';
  }

  getAdminRole(): string {
    const user = this.authService.currentUser();
    if (!user) return 'Administrator';
    // Assuming user object has a role property, adjust as needed
    return user.role || 'Administrator';
  }

  // ── Pagination & Filter Methods ──────────────────────────────

  setActivityFilter(type: string | 'all'): void {
    this.activitySelectedFilter.set(type);
    this.activityCurrentPage.set(1); // Reset to first page when filtering
  }

  goToActivityPage(page: number): void {
    const totalPages = this.activityTotalPages();
    if (page >= 1 && page <= totalPages) {
      this.activityCurrentPage.set(page);
    }
  }

  goToActivityPreviousPage(): void {
    const currentPage = this.activityCurrentPage();
    if (currentPage > 1) {
      this.goToActivityPage(currentPage - 1);
    }
  }

  goToActivityNextPage(): void {
    const currentPage = this.activityCurrentPage();
    const totalPages = this.activityTotalPages();
    if (currentPage < totalPages) {
      this.goToActivityPage(currentPage + 1);
    }
  }
}
