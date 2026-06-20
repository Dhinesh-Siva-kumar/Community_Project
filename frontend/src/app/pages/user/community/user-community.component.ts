import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { CommunityService } from '../../../core/services/community.service';
import { EventService } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Community, Event as AppEvent, PaginatedResponse } from '../../../core/models';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { ProfileTabsComponent, ProfileTab } from '../../../shared/components/profile-tabs/profile-tabs.component';

export type CommunityTab = 'all' | 'joined' | 'trending';

@Component({
  selector: 'app-user-community',
  standalone: true,
  imports: [CommonModule, RouterLink, ImageUrlPipe, ProfileTabsComponent],
  templateUrl: './user-community.component.html',
  styleUrls: ['./user-community.component.scss'],
})
export class UserCommunityComponent implements OnInit {
  private communityService = inject(CommunityService);
  private eventService      = inject(EventService);
  private authService       = inject(AuthService);
  private toast             = inject(ToastService);
  private router            = inject(Router);

  // ── Core data signals ──────────────────────────────────────
  communities     = signal<Community[]>([]);
  upcomingEvents  = signal<AppEvent[]>([]);
  loading         = signal(true);
  eventsLoading   = signal(true);

  // ── Pagination ─────────────────────────────────────────────
  searchTerm   = signal('');
  currentPage  = signal(1);
  totalPages   = signal(1);
  totalItems   = signal(0);
  pageSize     = signal(9);

  // ── Action states ──────────────────────────────────────────
  joiningId  = signal<string | null>(null);
  leavingId  = signal<string | null>(null);

  // ── UI state ───────────────────────────────────────────────
  activeTab = signal<CommunityTab>('all');

  // ── Profile-tabs compatible tab definitions ────────────────
  pageTabs = computed<ProfileTab[]>(() => [
    { id: 'all',      label: 'All',      icon: 'bi-grid-3x3-gap', badge: this.totalItems() || undefined },
    { id: 'joined',   label: 'Joined',   icon: 'bi-person-check', badge: this.joinedCommunities().length || undefined },
    { id: 'trending', label: 'Trending', icon: 'bi-fire' },
  ]);

  // ── Joined community ID tracker ───────────────────────────
  joinedCommunityIds = signal<Set<string>>(new Set());

  // ── Computed: current user ─────────────────────────────────
  currentUser   = computed(() => this.authService.currentUser());
  currentUserId = computed(() => this.currentUser()?.id ?? '');

  getUserInitials(): string {
    const user = this.currentUser();
    if (!user) return 'U';
    return (user.displayName?.charAt(0) || user.userName?.charAt(0) || 'U').toUpperCase();
  }

  getUserDisplayName(): string {
    const user = this.currentUser();
    if (!user) return 'there';
    return user.displayName || user.userName || 'there';
  }

  // ── Computed: communities by tab ───────────────────────────
  filteredCommunities = computed(() => {
    const tab   = this.activeTab();
    const term  = this.searchTerm().toLowerCase().trim();
    let list    = this.communities();

    // Filter by tab
    if (tab === 'joined') {
      list = list.filter((c) => c.is_joined || this.isJoined(c.id));
    } else if (tab === 'trending') {
      // "Trending" = top 12 by member count
      list = [...list].sort(
        (a, b) => (b._count?.members ?? 0) - (a._count?.members ?? 0)
      );
    }

    // Apply search term
    if (term) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.description?.toLowerCase().includes(term) ||
          c.location?.toLowerCase().includes(term)
      );
    }

    return list;
  });

  // ── Computed: joined communities only (for stats) ──────────
  joinedCommunities = computed(() =>
    this.communities().filter((c) => c.is_joined || this.isJoined(c.id))
  );

  // ── Computed: featured communities (top 4 by member count) ─
  featuredCommunities = computed(() =>
    [...this.communities()]
      .sort((a, b) => (b._count?.members ?? 0) - (a._count?.members ?? 0))
      .slice(0, 4)
  );

  // ── Computed: total members across all loaded communities ──
  totalMembersCount = computed(() =>
    this.communities().reduce((sum, c) => sum + (c._count?.members ?? 0), 0)
  );

  // ── Computed: trending topic chips (derived from data) ─────
  trendingTopics = computed((): string[] => {
    const names = this.communities().map((c) => c.name);
    // Extract meaningful single/double word tokens from community names
    const wordMap = new Map<string, number>();
    names.forEach((name) => {
      name
        .split(/[\s\-_,]+/)
        .filter((w) => w.length > 3)
        .forEach((word) => {
          const key = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          wordMap.set(key, (wordMap.get(key) ?? 0) + 1);
        });
    });
    return Array.from(wordMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  });

  // ── Computed: upcoming events (next 4 future events) ───────
  nextEvents = computed(() =>
    [...this.upcomingEvents()]
      .filter((e) => new Date(e.eventDate) >= new Date())
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())
      .slice(0, 4)
  );

  // ──────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadCommunities();
    this.loadUpcomingEvents();
  }

  // ── Load communities ───────────────────────────────────────
  loadCommunities(): void {
    this.loading.set(true);
    const params: Record<string, any> = {
      user_id: this.authService.currentUser()?.id ?? '',
      page: this.currentPage(),
      limit: this.pageSize(),
    };

    this.communityService.getCommunities(params).subscribe({
      next: (response: PaginatedResponse<Community>) => {
        this.communities.set(response.data);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        this.updateJoinedStatus(response.data);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load communities');
        this.loading.set(false);
      },
    });
  }

  // ── Load upcoming events ───────────────────────────────────
  loadUpcomingEvents(): void {
    this.eventsLoading.set(true);
    this.eventService.getEvents().subscribe({
      next: (response: PaginatedResponse<AppEvent>) => {
        this.upcomingEvents.set(response.data);
        this.eventsLoading.set(false);
      },
      error: () => {
        this.eventsLoading.set(false);
      },
    });
  }

  // ── Joined status helpers ──────────────────────────────────
  private updateJoinedStatus(communities: Community[]): void {
    const joinedIds = new Set<string>();
    communities.forEach((c) => {
      if (c.is_joined) joinedIds.add(c.id);
    });
    this.joinedCommunityIds.set(joinedIds);
  }

  isJoined(communityId: string): boolean {
    return this.joinedCommunityIds().has(communityId);
  }

  // ── Tab navigation ─────────────────────────────────────────
  setTab(tab: CommunityTab): void {
    this.activeTab.set(tab);
    this.searchTerm.set('');
  }

  // ── Search ─────────────────────────────────────────────────
  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
  }

  clearSearch(): void {
    this.searchTerm.set('');
  }

  // ── Community actions ──────────────────────────────────────
  joinCommunity(event: Event, communityId: string): void {
    event.stopPropagation();
    this.joiningId.set(communityId);

    this.communityService.joinCommunity(communityId).subscribe({
      next: () => {
        this.toast.success('Joined the community!');
        // Optimistically patch is_joined on the local object
        this.communities.update(list =>
          list.map(c => c.id === communityId ? { ...c, is_joined: true } : c)
        );
        this.joinedCommunityIds.update((ids) => {
          const n = new Set(ids);
          n.add(communityId);
          return n;
        });
        this.joiningId.set(null);
      },
      error: () => {
        this.toast.error('Failed to join community');
        this.joiningId.set(null);
      },
    });
  }

  leaveCommunity(event: Event, communityId: string): void {
    event.stopPropagation();
    this.leavingId.set(communityId);

    this.communityService.leaveCommunity(communityId).subscribe({
      next: () => {
        this.toast.success('Left the community');
        // Optimistically patch is_joined on the local object so UI updates instantly
        this.communities.update(list =>
          list.map(c => c.id === communityId ? { ...c, is_joined: false } : c)
        );
        this.joinedCommunityIds.update((ids) => {
          const n = new Set(ids);
          n.delete(communityId);
          return n;
        });
        this.leavingId.set(null);
      },
      error: () => {
        this.toast.error('Failed to leave community');
        this.leavingId.set(null);
      },
    });
  }

  // ── Navigation ─────────────────────────────────────────────
  navigateToCommunity(communityId: string): void {
    this.router.navigate(['/user/community', communityId]);
  }

  navigateToEvents(): void {
    this.router.navigate(['/user/events']);
  }

  // ── Pagination ─────────────────────────────────────────────
  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadCommunities();
  }

  getPages(): number[] {
    const total      = this.totalPages();
    const current    = this.currentPage();
    const maxVisible = 5;
    const pages: number[] = [];

    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    let end   = Math.min(total, start + maxVisible - 1);
    start     = Math.max(1, end - maxVisible + 1);

    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  // ── Helpers ────────────────────────────────────────────────
  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day:   'numeric',
      year:  'numeric',
    });
  }

  formatEventDate(dateStr: string): { day: string; month: string; weekday: string } {
    const d = new Date(dateStr);
    return {
      day:     d.toLocaleDateString('en-US', { day: '2-digit' }),
      month:   d.toLocaleDateString('en-US', { month: 'short' }),
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
    };
  }

  isEventSoon(dateStr: string): boolean {
    const diff = new Date(dateStr).getTime() - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000; // within 3 days
  }

  truncate(text: string | undefined, length: number): string {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '…' : text;
  }

  // ── Cover gradient placeholder (based on name hash) ───────
  getCoverGradient(name: string): string {
    const gradients = [
      'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
      'linear-gradient(135deg, #1C1917 0%, #44403C 100%)',
      'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)',
      'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
      'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
      'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
      'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
      'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
    }
    return gradients[hash % gradients.length];
  }
}
