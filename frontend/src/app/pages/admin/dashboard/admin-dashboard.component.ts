import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { UserService } from '../../../core/services/user.service';
import { PostService } from '../../../core/services/post.service';
import { AuthService } from '../../../core/services/auth.service';
import { DashboardStats, Post, AuditLog, ChartData } from '../../../core/models';

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
  private clockTimer?: number;

  loading        = signal(true);
  stats          = signal<DashboardStats | null>(null);
  pendingPosts   = signal<Post[]>([]);
  auditLogs      = signal<AuditLog[]>([]);
  chartData      = signal<ChartData | null>(null);
  today          = signal(new Date());

  pendingCount = computed(() => this.pendingPosts().length);

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

  quickActions = [
    { label: 'Create Community',    icon: 'bi-plus-circle',  bg: '#fff3e0', color: '#855300', route: '/admin/community'       },
    { label: 'Global Announcement', icon: 'bi-megaphone',    bg: '#e8f0ff', color: '#005ac2', route: '/admin/post-approval'   },
    { label: 'Manage Users',        icon: 'bi-person-gear',  bg: '#e6faf3', color: '#006c49', route: '/admin/user-management' },
  ];

  ngOnInit(): void {
    this.load();
    this.clockTimer = window.setInterval(() => this.today.set(new Date()), 60_000);
  }

  ngOnDestroy(): void {
    if (this.clockTimer) clearInterval(this.clockTimer);
  }

  load(): void {
    this.loading.set(true);
    forkJoin({
      stats:   this.userService.getDashboardStats(),
      pending: this.postService.getPendingPosts(),
      audit:   this.userService.getAuditLogs({ limit: 5 }),
      charts:  this.userService.getChartData(),
    }).subscribe({
      next: ({ stats, pending, audit, charts }) => {
        this.stats.set(stats);
        this.pendingPosts.set(pending.data ?? []);
        this.auditLogs.set(audit.data ?? []);
        this.chartData.set(charts);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  approvePost(id: string): void {
    this.postService.approvePost(id).subscribe(() =>
      this.pendingPosts.update(list => list.filter(p => p.id !== id))
    );
  }

  rejectPost(id: string): void {
    this.postService.rejectPost(id).subscribe(() =>
      this.pendingPosts.update(list => list.filter(p => p.id !== id))
    );
  }

  gaugeOffset(pct: number): number {
    return 238.76 - (238.76 * pct) / 100;
  }

  businessPct(): number {
    const total = this.stats()?.totalBusinesses ?? 0;
    return total > 0 ? Math.min(100, Math.round((total / (total + 50)) * 100)) : 0;
  }

  // Bar width % relative to the larger of the two event values
  eventBarPct(value?: number, other?: number): number {
    const max = Math.max(value ?? 0, other ?? 0, 1);
    return Math.round(((value ?? 0) / max) * 100);
  }

  jobFillPct(): number {
    const jobs = this.stats()?.totalJobs ?? 0;
    return jobs > 0 ? Math.min(100, Math.round((jobs / (jobs + Math.ceil(jobs * 0.12))) * 100)) : 0;
  }

  postTypeIcon(type: string): string {
    return type === 'EMERGENCY' ? 'bi-exclamation-triangle-fill' : 'bi-file-earmark-text';
  }

  postIconColor(type: string): string {
    return type === 'EMERGENCY' ? '#ba1a1a' : '#005ac2';
  }

  postIconBg(type: string): string {
    return type === 'EMERGENCY' ? '#ffdad6' : '#e8f0ff';
  }

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
}
