import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { CommunityService } from '../../../core/services/community.service';
import { PostService } from '../../../core/services/post.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Community, Post, PaginatedResponse } from '../../../core/models';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';

export type CommunityTab = 'all' | 'joined' | 'trending';
export type CommunityViewMode = 'grid' | 'list';

interface FilterTab {
  id: CommunityTab;
  label: string;
  icon: string;
  badge?: number;
}

// Generic words that describe the entity itself rather than a real subject/interest —
// excluded so "topic" chips surface meaningful keywords instead of structural nouns.
const TOPIC_STOPWORDS = new Set([
  'community', 'communities', 'group', 'network', 'association', 'society',
  'circle', 'hub', 'club', 'team', 'collective', 'organization', 'organisation',
  'people', 'members', 'connect', 'this', 'that', 'with', 'from', 'their',
]);

@Component({
  selector: 'app-user-community',
  standalone: true,
  imports: [CommonModule, RouterLink, ImageUrlPipe],
  templateUrl: './user-community.component.html',
  styleUrls: ['./user-community.component.scss'],
})
export class UserCommunityComponent implements OnInit {
  private communityService = inject(CommunityService);
  private postService       = inject(PostService);
  private authService       = inject(AuthService);
  private toast             = inject(ToastService);
  private router            = inject(Router);

  // ── Core data signals ──────────────────────────────────────
  communities  = signal<Community[]>([]);
  loading      = signal(true);

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
  viewMode  = signal<CommunityViewMode>('grid');

  // ── Filter-tab definitions (segmented control) ──────────────
  pageTabs = computed<FilterTab[]>(() => [
    { id: 'all',      label: 'All',      icon: 'bi-grid-3x3-gap', badge: this.totalItems() || undefined },
    { id: 'joined',   label: 'Joined',   icon: 'bi-person-check', badge: this.joinedCommunities().length || undefined },
    { id: 'trending', label: 'Trending', icon: 'bi-lightning-fill' },
  ]);

  // ── Joined community ID tracker ───────────────────────────
  joinedCommunityIds = signal<Set<string>>(new Set());

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

  // ── Computed: spotlight communities (top 4 by member count) ─
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
  // Keyword-mines community names rather than reading a real "category" field
  // (Community has none). A word only becomes a topic chip if it appears in at
  // least 2 different community names, so one-off structural nouns don't drown
  // out words that genuinely group communities together.
  trendingTopics = computed((): string[] => {
    const wordMap = new Map<string, number>();

    this.communities().forEach((c) => {
      const seenInThisName = new Set<string>();
      c.name
        .split(/[\s\-_,]+/)
        .filter((w) => w.length > 3)
        .forEach((word) => {
          const key = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          if (TOPIC_STOPWORDS.has(key.toLowerCase()) || seenInThisName.has(key)) return;
          seenInThisName.add(key);
          wordMap.set(key, (wordMap.get(key) ?? 0) + 1);
        });
    });

    return Array.from(wordMap.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);
  });

  // ── Popular posts (sidebar) ─────────────────────────────────
  popularPosts  = signal<Post[]>([]);
  postsLoading  = signal(true);

  // ──────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadCommunities();
    this.loadPopularPosts();
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

  // ── Load popular posts (sidebar) ───────────────────────────
  // Fetches recent posts across all communities and ranks them client-side by
  // engagement (likes + comments) — same pattern as featuredCommunities above,
  // using real _count fields rather than a dedicated "popular" endpoint.
  loadPopularPosts(): void {
    this.postsLoading.set(true);
    this.postService.getPosts(undefined, { limit: 20 }).subscribe({
      next: (response: PaginatedResponse<Post>) => {
        const ranked = [...response.data].sort((a, b) => {
          const scoreA = (a._count?.likes ?? 0) + (a._count?.comments ?? 0);
          const scoreB = (b._count?.likes ?? 0) + (b._count?.comments ?? 0);
          return scoreB - scoreA;
        });
        this.popularPosts.set(ranked.slice(0, 3));
        this.postsLoading.set(false);
      },
      error: () => {
        this.postsLoading.set(false);
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

  setViewMode(mode: CommunityViewMode): void {
    this.viewMode.set(mode);
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

  // ── Initials for avatar tiles (used when no cover image) ──
  getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    const initials = parts.map((p) => p.charAt(0).toUpperCase()).join('');
    return initials || '?';
  }

  // ── Avatar/cover gradient placeholder (based on name hash) ─
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
