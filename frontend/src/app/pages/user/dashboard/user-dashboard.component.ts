import { Component, OnInit, OnDestroy, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CommunityService } from '../../../core/services/community.service';
import { PostService } from '../../../core/services/post.service';
import { EventService } from '../../../core/services/event.service';
import { JobService } from '../../../core/services/job.service';
import {
  User,
  DashboardStats,
  Notification,
  Community,
  Post,
  Event,
  Job,
  PaginatedResponse,
} from '../../../core/models';

type PostTab = 'ALL' | 'POPULAR' | 'HELP' | 'EMERGENCY';

interface QuickLink {
  title: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  route: string;
}

interface ProfileItem {
  label: string;
  completed: boolean;
  route: string;
}

interface AnimatedStat {
  label: string;
  value: number;
  displayValue: number;
  icon: string;
  iconColor: string;
  bgColor: string;
  accentColor: string;
}

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.scss'],
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private userService = inject(UserService);
  notificationService = inject(NotificationService);
  private communityService = inject(CommunityService);
  private postService = inject(PostService);
  private eventService = inject(EventService);
  private jobService = inject(JobService);
  private platformId = inject(PLATFORM_ID);

  // Loading states
  loading = signal(true);
  loadingPosts = signal(true);
  loadingCommunities = signal(true);
  loadingEvents = signal(true);
  loadingJobs = signal(true);

  // Core data
  user = signal<User | null>(null);
  stats = signal<DashboardStats | null>(null);
  today = signal(new Date());

  // Post feed
  activeTab = signal<PostTab>('ALL');
  allPosts = signal<Post[]>([]);
  savedPostIds = signal<Set<string>>(new Set());

  // Communities, Events, Jobs
  joinedCommunities = signal<Community[]>([]);
  upcomingEvents = signal<Event[]>([]);
  recentJobs = signal<Job[]>([]);

  // Computed
  profileCompletion = computed(() => this.user()?.profileCompletion ?? 0);
  firstName = computed(() => this.user()?.displayName ?? this.user()?.userName ?? 'User');

  greeting = computed(() => {
    const hour = this.today().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  });

  profileStrength = computed(() => {
    const pct = this.profileCompletion();
    if (pct >= 100) return 'Complete';
    if (pct >= 75) return 'Strong';
    if (pct >= 50) return 'Intermediate';
    if (pct >= 25) return 'Getting there';
    return 'Just started';
  });

  filteredPosts = computed(() => {
    const posts = this.allPosts();
    const tab = this.activeTab();
    switch (tab) {
      case 'POPULAR':
        return [...posts].sort((a, b) => (b._count?.likes ?? 0) - (a._count?.likes ?? 0));
      case 'HELP':
        return posts.filter((p) => p.type === 'HELP');
      case 'EMERGENCY':
        return posts.filter((p) => p.type === 'EMERGENCY');
      default:
        return posts;
    }
  });

  animatedStats = signal<AnimatedStat[]>([
    { label: 'Communities', value: 0, displayValue: 0, icon: 'bi-people-fill', iconColor: '#5865f2', bgColor: '#ede9fe', accentColor: '#5865f2' },
    { label: 'Posts', value: 0, displayValue: 0, icon: 'bi-file-earmark-text-fill', iconColor: '#22c55e', bgColor: '#dcfce7', accentColor: '#22c55e' },
    { label: 'Businesses', value: 0, displayValue: 0, icon: 'bi-shop', iconColor: '#f97316', bgColor: '#fff7ed', accentColor: '#f97316' },
    { label: 'Events', value: 0, displayValue: 0, icon: 'bi-calendar-event-fill', iconColor: '#ef4444', bgColor: '#fef2f2', accentColor: '#ef4444' },
    { label: 'Jobs', value: 0, displayValue: 0, icon: 'bi-briefcase-fill', iconColor: '#eb459e', bgColor: '#fdf2f8', accentColor: '#eb459e' },
  ]);

  private animationFrameId: number | null = null;

  profileItems = computed<ProfileItem[]>(() => {
    const u = this.user();
    if (!u) return [];
    return [
      { label: 'Add phone number', completed: !!u.phoneNo, route: '/user/profile' },
      { label: 'Upload avatar', completed: !!u.avatar, route: '/user/profile' },
      { label: 'Set interests', completed: u.interests?.length > 0, route: '/user/profile' },
      { label: 'Add bio', completed: !!u.bio, route: '/user/profile' },
      { label: 'Set location', completed: !!u.location, route: '/user/profile' },
      { label: 'Add professional category', completed: !!u.professionalCategory, route: '/user/profile' },
    ];
  });

  completedItems = computed(() => this.profileItems().filter((item) => item.completed));
  incompleteItems = computed(() => this.profileItems().filter((item) => !item.completed));

  latestNotifications = computed(() => {
    return this.notificationService.notifications().slice(0, 5);
  });

  quickLinks = signal<QuickLink[]>([
    { title: 'Communities', description: 'Browse & join', icon: 'bi-people-fill', color: '#5865f2', bgColor: '#ede9fe', route: '/user/community' },
    { title: 'Businesses', description: 'Discover local', icon: 'bi-shop', color: '#22c55e', bgColor: '#dcfce7', route: '/user/business' },
    { title: 'Events', description: 'Find nearby', icon: 'bi-calendar-event-fill', color: '#f97316', bgColor: '#fff7ed', route: '/user/events' },
    { title: 'Jobs', description: 'Opportunities', icon: 'bi-briefcase-fill', color: '#ef4444', bgColor: '#fef2f2', route: '/user/jobs' },
  ]);

  tabs: { key: PostTab; label: string; icon: string }[] = [
    { key: 'ALL', label: 'All Posts', icon: 'bi-grid-fill' },
    { key: 'POPULAR', label: 'Popular', icon: 'bi-fire' },
    { key: 'HELP', label: 'Help Requests', icon: 'bi-question-circle-fill' },
    { key: 'EMERGENCY', label: 'Emergency', icon: 'bi-exclamation-triangle-fill' },
  ];

  ngOnInit(): void {
    this.loadUserData();
    this.loadDashboardStats();
    this.loadNotifications();
    this.loadJoinedCommunities();
    this.loadUpcomingEvents();
    this.loadRecentJobs();
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== null && isPlatformBrowser(this.platformId)) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  // ── Data Loading ──────────────────────────────────────────

  loadUserData(): void {
    const currentUser = this.authService.currentUser();
    if (currentUser) {
      this.user.set(currentUser);
    }
    this.authService.getCurrentUser().subscribe({
      next: (user) => this.user.set(user),
      error: () => {},
    });
  }

  loadDashboardStats(): void {
    this.loading.set(true);
    this.userService.getDashboardStats().subscribe({
      next: (data) => {
        this.stats.set(data);
        this.loading.set(false);
        this.startCounterAnimation(data);
      },
      error: () => this.loading.set(false),
    });
  }

  loadNotifications(): void {
    this.notificationService.getNotifications().subscribe({
      next: () => {},
      error: () => {},
    });
  }

  loadJoinedCommunities(): void {
    this.loadingCommunities.set(true);
    this.communityService.getCommunities({ limit: 100 }).subscribe({
      next: (res) => {
        const userId = this.authService.currentUser()?.id;
        if (userId) {
          // const joined = res.data.filter(
          //   (c) => c.member_count?.((m) => m.userId === userId) || c.createdById === userId
          // );
          // this.joinedCommunities.set(joined);
          // this.loadPostsFromCommunities(joined);
        } else {
          this.joinedCommunities.set(res.data);
          this.loadPostsFromCommunities(res.data);
        }
        this.loadingCommunities.set(false);
      },
      error: () => {
        this.loadingCommunities.set(false);
        this.loadingPosts.set(false);
      },
    });
  }

  loadPostsFromCommunities(communities: Community[]): void {
    if (communities.length === 0) {
      this.allPosts.set([]);
      this.loadingPosts.set(false);
      return;
    }

    const requests = communities.map((c) =>
      this.postService.getPosts(c.id, { limit: 10, status: 'APPROVED' }).pipe(
        catchError(() => of({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 } as PaginatedResponse<Post>))
      )
    );

    forkJoin(requests).subscribe({
      next: (results) => {
        const merged = results
          .flatMap((r) => r.data)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        this.allPosts.set(merged);
        this.loadingPosts.set(false);
      },
      error: () => {
        this.allPosts.set([]);
        this.loadingPosts.set(false);
      },
    });
  }

  loadUpcomingEvents(): void {
    this.loadingEvents.set(true);
    this.eventService.getEvents().subscribe({
      next: (res) => {
        const now = new Date();
        const upcoming = res.data
          .filter((e) => new Date(e.eventDate) >= now)
          .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())
          .slice(0, 5);
        this.upcomingEvents.set(upcoming);
        this.loadingEvents.set(false);
      },
      error: () => this.loadingEvents.set(false),
    });
  }

  loadRecentJobs(): void {
    this.loadingJobs.set(true);
    this.jobService.getJobs().subscribe({
      next: (res) => {
        const recent = res.data
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 4);
        this.recentJobs.set(recent);
        this.loadingJobs.set(false);
      },
      error: () => this.loadingJobs.set(false),
    });
  }

  // ── Tab Switching ─────────────────────────────────────────

  switchTab(tab: PostTab): void {
    this.activeTab.set(tab);
  }

  // ── Save / Bookmark ───────────────────────────────────────

  toggleSavePost(postId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.savedPostIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }

  isPostSaved(postId: string): boolean {
    return this.savedPostIds().has(postId);
  }

  // ── Notifications ─────────────────────────────────────────

  markNotificationRead(id: string): void {
    this.notificationService.markAsRead(id).subscribe({ next: () => {}, error: () => {} });
  }

  markAllNotificationsRead(): void {
    this.notificationService.markAllAsRead().subscribe({ next: () => {}, error: () => {} });
  }

  // ── Counter Animation ─────────────────────────────────────

  private startCounterAnimation(data: DashboardStats): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const targets = [
      data.joinedCommunities ?? data.totalCommunities ?? 0,
      data.userPosts ?? data.totalPosts ?? 0,
      data.userBusinesses ?? data.totalBusinesses ?? 0,
      data.userEvents ?? data.totalEvents ?? 0,
      data.userJobs ?? data.totalJobs ?? 0,
    ];

    const duration = 1500;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      this.animatedStats.update((stats) =>
        stats.map((stat, i) => ({
          ...stat,
          value: targets[i],
          displayValue: Math.round(eased * targets[i]),
        }))
      );

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animate);
      }
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  // ── Helpers ───────────────────────────────────────────────

  getPostTypeBadge(type: string): { label: string; class: string; icon: string } {
    switch (type) {
      case 'EMERGENCY':
        return { label: 'Emergency', class: 'badge-emergency', icon: 'bi-exclamation-triangle-fill' };
      case 'HELP':
        return { label: 'Help', class: 'badge-help', icon: 'bi-question-circle-fill' };
      default:
        return { label: 'General', class: 'badge-general', icon: 'bi-chat-fill' };
    }
  }

  getNotificationIcon(type: string): string {
    switch (type) {
      case 'POST_APPROVED': return 'bi-check-circle-fill';
      case 'POST_REJECTED': return 'bi-x-circle-fill';
      case 'NEW_COMMENT': return 'bi-chat-dots-fill';
      case 'NEW_LIKE': return 'bi-heart-fill';
      case 'NEW_MEMBER': return 'bi-person-plus-fill';
      case 'COMMUNITY_UPDATE': return 'bi-megaphone-fill';
      case 'EVENT_REMINDER': return 'bi-calendar-check-fill';
      default: return 'bi-bell-fill';
    }
  }

  getNotificationIconColor(type: string): string {
    switch (type) {
      case 'POST_APPROVED': return '#22c55e';
      case 'POST_REJECTED': return '#ef4444';
      case 'NEW_COMMENT': return '#5865f2';
      case 'NEW_LIKE': return '#eb459e';
      case 'NEW_MEMBER': return '#3b82f6';
      case 'COMMUNITY_UPDATE': return '#f97316';
      case 'EVENT_REMINDER': return '#8b5cf6';
      default: return '#9ca3af';
    }
  }

  getTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  getEventMonth(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short' });
  }

  getEventDay(dateString: string): string {
    return new Date(dateString).getDate().toString();
  }

  getUserInitials(user?: User): string {
    if (!user) return '?';
    const first = user.displayName?.charAt(0) ?? '';
    return first.toUpperCase() || user.userName?.charAt(0)?.toUpperCase() || '?';
  }
}
