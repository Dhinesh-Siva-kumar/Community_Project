import { Component, OnInit, OnDestroy, ElementRef, HostListener, inject, signal, computed, viewChild, viewChildren, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CommunityService } from '../../../core/services/community.service';
import { PostService } from '../../../core/services/post.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Community, Post, PaginatedResponse, CommunityAnalyticsCounts } from '../../../core/models';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { CommunityFormModalComponent } from '../../../shared/components/community-form-modal/community-form-modal.component';
import { CommunityDeleteModalComponent } from '../../../shared/components/community-delete-modal/community-delete-modal.component';

export type CommunityTab = 'all' | 'joined' | 'trending' | 'pending';
export type CommunityViewMode = 'grid' | 'list';

interface FilterTab {
  id: CommunityTab;
  label: string;
  icon: string;
  badge?: number;
}

@Component({
  selector: 'app-user-community',
  standalone: true,
  imports: [CommonModule, ImageUrlPipe, ImageErrorHandlerDirective, CommunityFormModalComponent, CommunityDeleteModalComponent],
  templateUrl: './user-community.component.html',
  styleUrls: ['./user-community.component.scss'],
})
export class UserCommunityComponent implements OnInit, OnDestroy {
  private communityService = inject(CommunityService);
  private postService       = inject(PostService);
  private authService       = inject(AuthService);
  private toast             = inject(ToastService);
  private router            = inject(Router);

  // ── Spotlight rail — arrow-button navigation ────────────────
  // A signal-based viewChild query (not @ViewChild) so it re-resolves
  // reactively every time the rail's @if condition flips it in/out of the
  // DOM — e.g. re-entering this page after navigating into a community and
  // back, when a plain one-shot setTimeout()-after-load could race the
  // element not existing yet and leave the arrows stuck hidden.
  private spotlightRailEl = viewChild<ElementRef<HTMLElement>>('spotlightRail');
  canScrollSpotlightLeft  = signal(false);
  canScrollSpotlightRight = signal(false);
  private spotlightResizeObserver?: ResizeObserver;

  // ── Top tabs — sliding active-pill indicator ────────────────
  private tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');
  tabIndicatorLeft  = signal(0);
  tabIndicatorWidth = signal(0);
  tabIndicatorReady = signal(false);

  // ── Core data signals ──────────────────────────────────────
  communities  = signal<Community[]>([]);
  loading      = signal(true);
  // Gates the full-page loading screen — true only until the very first
  // fetch resolves, then stays true forever after. Every later fetch
  // (tab switch, pagination, search) still flips `loading`, but the page
  // itself (head/tabs/spotlight/results) stays mounted throughout instead
  // of being torn down and rebuilt, which was the "whole page reloads and
  // blinks" symptom — and, as a side effect, was also destroying and
  // recreating the tab buttons on every switch, so the sliding indicator
  // never got a chance to animate.
  pageReady    = signal(false);

  // ── Pagination (backs infinite scroll, not page-number UI) ──
  searchTerm   = signal('');
  currentPage  = signal(1);
  totalPages   = signal(1);
  totalItems   = signal(0);
  pageSize     = signal(10);
  loadingMore  = signal(false);
  hasMore      = computed(() => this.currentPage() < this.totalPages());

  // ── "Back to top" — appears once the user has scrolled down far
  // enough that they'd otherwise have to scroll all the way back up
  // manually (e.g. after infinite-scrolling through several pages). ─
  showScrollTop = signal(false);
  private scrollTicking = false;

  // ── Action states ──────────────────────────────────────────
  joiningId  = signal<string | null>(null);
  leavingId  = signal<string | null>(null);

  // ── Create/Edit/Delete — own communities only; the form lives in
  // app-community-form-modal, the confirm popup in app-community-delete-modal. ──
  showCommunityModal = signal(false);
  editCommunityId    = signal<string | null>(null);
  showDeleteModal    = signal(false);
  communityToDelete  = signal<Community | null>(null);
  /** id of the card whose owner action menu (Edit/Delete) is currently open — only one at a time. */
  openMenuId         = signal<string | null>(null);

  // ── UI state ───────────────────────────────────────────────
  activeTab = signal<CommunityTab>('all');
  viewMode  = signal<CommunityViewMode>('grid');

  // ── Header stats — platform-wide totals, independent of whichever tab/
  // page happens to be loaded into `communities()` right now, so they never
  // regress to "current page only" the way the old client-side counts did.
  overallStats     = signal<CommunityAnalyticsCounts | null>(null);
  joinedTotalCount = signal(0);
  myPendingCount   = signal(0);

  // ── Filter-tab definitions (segmented control) ──────────────
  pageTabs = computed<FilterTab[]>(() => [
    { id: 'all',      label: 'All',      icon: 'bi-grid-3x3-gap', badge: this.overallStats()?.total || undefined },
    { id: 'joined',   label: 'Joined',   icon: 'bi-person-check', badge: this.joinedTotalCount() || undefined },
    { id: 'trending', label: 'Trending', icon: 'bi-lightning-fill' },
    { id: 'pending',  label: 'Pending Approval', icon: 'bi-hourglass-split', badge: this.myPendingCount() || undefined },
  ]);

  // ── Joined community ID tracker ───────────────────────────
  joinedCommunityIds = signal<Set<string>>(new Set());

  // ── Computed: communities by tab ───────────────────────────
  filteredCommunities = computed(() => {
    const tab   = this.activeTab();
    const term  = this.searchTerm().toLowerCase().trim();
    let list    = this.communities();

    // Filter by tab — loadCommunities() already fetches a joined-scoped page
    // when this tab is active, so this filter is normally a no-op; it earns
    // its keep the moment someone leaves a community from within this tab,
    // instantly hiding that card via the optimistic is_joined update instead
    // of waiting on a refetch.
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

  // ── Suggested communities — ranked server-side by country match +
  // interest match + popularity (see CommunityService.getSuggestedCommunities /
  // communities.service.ts getSuggested()). Replaces the old client-side
  // "top 4 by member count" spotlight, which only ever considered whatever
  // page of the general list happened to already be loaded.
  suggestedCommunities = signal<Community[]>([]);

  // ── Popular posts (sidebar) ─────────────────────────────────
  popularPosts  = signal<Post[]>([]);
  postsLoading  = signal(true);

  // ── Popular post image lightbox — same .cd-lightbox used for viewing
  // community post images on the Community Detail / Dashboard pages,
  // replicated here (not the generic ImageViewerComponent) since these are
  // the same Post entities. ──
  lightboxOpen    = signal(false);
  lightboxImages  = signal<string[]>([]);
  activeImageIndex = signal(0);

  constructor() {
    // Re-check the arrows' enabled/disabled state whenever the rail element
    // (re)appears in the DOM — covers first load, re-entering this page
    // after navigating into a community and back (a fresh component
    // instance, so the element mounts again from scratch), and the
    // featured-communities list changing — plus a ResizeObserver on the
    // element itself for plain window/layout resizes.
    effect((onCleanup) => {
      const ref = this.spotlightRailEl();
      this.suggestedCommunities(); // re-run this effect when the card count changes too
      this.spotlightResizeObserver?.disconnect();
      this.spotlightResizeObserver = undefined;

      if (!ref) {
        this.canScrollSpotlightLeft.set(false);
        this.canScrollSpotlightRight.set(false);
        return;
      }

      const el = ref.nativeElement;
      this.updateSpotlightScrollState();
      this.spotlightResizeObserver = new ResizeObserver(() => this.updateSpotlightScrollState());
      this.spotlightResizeObserver.observe(el);

      onCleanup(() => this.spotlightResizeObserver?.disconnect());
    });

    // Slide the active-tab pill under whichever button is active — recomputed
    // whenever the active tab or the tab list itself (labels/badge widths)
    // changes, and once the buttons first mount.
    effect(() => {
      this.tabButtons();
      this.activeTab();
      this.pageTabs();
      this.updateTabIndicator();
    });
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateTabIndicator();
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (this.scrollTicking) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.showScrollTop.set(window.scrollY > 600);

      // Infinite scroll — fetch the next page once the user is within one
      // screen's height of the bottom of the document.
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - window.innerHeight;
      if (nearBottom && this.pageReady() && this.hasMore() && !this.loading() && !this.loadingMore()) {
        this.loadMoreCommunities();
      }

      this.scrollTicking = false;
    });
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private updateTabIndicator(): void {
    const tabs = this.pageTabs();
    const idx = tabs.findIndex(t => t.id === this.activeTab());
    const btn = this.tabButtons()[idx]?.nativeElement;
    if (!btn) return;
    this.tabIndicatorLeft.set(btn.offsetLeft);
    this.tabIndicatorWidth.set(btn.offsetWidth);
    this.tabIndicatorReady.set(true);
  }

  // ──────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadCommunities();
    this.loadSuggestedCommunities();
    this.loadPopularPosts();
    this.loadOverallStats();
    this.loadJoinedTotalCount();
    this.loadMyPendingCount();
  }

  /** Country + interests + popularity ranked list — see suggestedCommunities above. */
  loadSuggestedCommunities(): void {
    this.communityService.getSuggestedCommunities(8).subscribe({
      next: (communities) => this.suggestedCommunities.set(communities),
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    this.spotlightResizeObserver?.disconnect();
  }

  // ── Load communities ───────────────────────────────────────
  // The "Joined" tab fetches its own joined-scoped page from the backend
  // (not a client-side filter of whatever page of the general list happens
  // to be loaded) — otherwise a user with joined communities beyond page 1
  // of the "All" list would never see most of them under "Joined".
  private buildCommunitiesParams(page: number): Record<string, any> {
    const params: Record<string, any> = {
      user_id: this.authService.currentUser()?.id ?? '',
      page,
      limit: this.pageSize(),
    };
    if (this.activeTab() === 'joined') params['joined'] = true;
    return params;
  }

  /** "Pending Approval" tab — the caller's own communities awaiting admin approval only. */
  private fetchCommunitiesForCurrentTab(page: number) {
    if (this.activeTab() === 'pending') {
      return this.communityService.getMyCreatedCommunities({ page, limit: this.pageSize(), approvalStatus: 'PENDING' });
    }
    return this.communityService.getCommunities(this.buildCommunitiesParams(page));
  }

  /** Fresh page-1 fetch — replaces whatever's currently loaded (tab switch, initial load). */
  loadCommunities(): void {
    this.loading.set(true);
    this.currentPage.set(1);

    this.fetchCommunitiesForCurrentTab(1).subscribe({
      next: (response: PaginatedResponse<Community>) => {
        this.communities.set(response.data);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        this.updateJoinedStatus(response.data);
        this.loading.set(false);
        this.pageReady.set(true);
      },
      error: () => {
        this.toast.error('Failed to load communities');
        this.loading.set(false);
        this.pageReady.set(true);
      },
    });
  }

  /** Infinite scroll — fetches the next page and appends it to what's already loaded. */
  loadMoreCommunities(): void {
    if (!this.hasMore() || this.loading() || this.loadingMore()) return;
    const nextPage = this.currentPage() + 1;
    this.loadingMore.set(true);

    this.fetchCommunitiesForCurrentTab(nextPage).subscribe({
      next: (response: PaginatedResponse<Community>) => {
        this.communities.update(list => [...list, ...response.data]);
        this.currentPage.set(nextPage);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        this.updateJoinedStatus(response.data);
        this.loadingMore.set(false);
      },
      error: () => {
        this.toast.error('Failed to load more communities');
        this.loadingMore.set(false);
      },
    });
  }

  // ── Header stats — the true platform-wide totals (not just whatever
  // page/tab is currently loaded into `communities()`). ───────
  loadOverallStats(): void {
    this.communityService.getCommunityAnalytics().subscribe({
      next: (stats) => this.overallStats.set(stats),
      error: () => {},
    });
  }

  loadJoinedTotalCount(): void {
    this.communityService.getCommunities({ joined: true, page: 1, limit: 1 }).subscribe({
      next: (response: PaginatedResponse<Community>) => this.joinedTotalCount.set(response.total),
      error: () => {},
    });
  }

  loadMyPendingCount(): void {
    this.communityService.getMyCreatedCommunities({ page: 1, limit: 1, approvalStatus: 'PENDING' }).subscribe({
      next: (response: PaginatedResponse<Community>) => this.myPendingCount.set(response.total),
      error: () => {},
    });
  }

  // ── Load popular posts (sidebar) ───────────────────────────
  // Fetches recent posts and ranks them client-side by engagement (likes +
  // comments), using real _count fields rather than a dedicated "popular"
  // endpoint (unlike suggestedCommunities above, which is server-ranked). On the
  // "Joined" tab this is scoped to only the caller's joined communities
  // (via the same `joined` filter used for the communities list itself),
  // so the sidebar never shows posts from communities they haven't joined
  // while browsing their own communities.
  loadPopularPosts(): void {
    this.postsLoading.set(true);
    const params: Record<string, any> = { limit: 20 };
    if (this.activeTab() === 'joined') params['joined'] = true;

    this.postService.getPosts(undefined, params).subscribe({
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
  // Merges rather than replaces — loadMoreCommunities() calls this with just
  // the newly-appended page, and replacing the whole set from that alone
  // would wipe out what earlier pages had already recorded.
  private updateJoinedStatus(communities: Community[]): void {
    this.joinedCommunityIds.update((ids) => {
      const next = new Set(ids);
      communities.forEach((c) => {
        if (c.is_joined) next.add(c.id);
        else next.delete(c.id);
      });
      return next;
    });
  }

  isJoined(communityId: string): boolean {
    return this.joinedCommunityIds().has(communityId);
  }

  // ── Tab navigation ─────────────────────────────────────────
  setTab(tab: CommunityTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.searchTerm.set('');
    // "Joined" is a differently-scoped server fetch than "All"/"Trending"
    // (see loadCommunities), so switching tabs needs a fresh page-1 fetch,
    // not just a re-filter of whatever's already loaded — loadCommunities()
    // resets currentPage itself.
    this.loadCommunities();
    // Popular posts is scoped the same way (see loadPopularPosts) — re-fetch
    // so switching to "Joined" narrows it to the caller's own communities
    // instead of leaving the previous tab's posts showing.
    this.loadPopularPosts();
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
        this.joinedTotalCount.update(n => n + 1);
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
        this.joinedTotalCount.update(n => Math.max(0, n - 1));
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

  // ── Popular post image lightbox ─────────────────────────────
  openImagePreview(event: Event, images: string[], startIndex = 0): void {
    event.stopPropagation();
    if (!images?.length) return;
    this.lightboxImages.set(images);
    this.activeImageIndex.set(Math.max(0, Math.min(startIndex, images.length - 1)));
    this.lightboxOpen.set(true);
  }

  closeImagePreview(): void {
    this.lightboxOpen.set(false);
    this.lightboxImages.set([]);
    this.activeImageIndex.set(0);
  }

  nextPreviewImage(): void {
    const images = this.lightboxImages();
    if (!images.length) return;
    this.activeImageIndex.update((current) => (current + 1) % images.length);
  }

  prevPreviewImage(): void {
    const images = this.lightboxImages();
    if (!images.length) return;
    this.activeImageIndex.update((current) => (current - 1 + images.length) % images.length);
  }

  getActivePreviewImage(): string | null {
    const images = this.lightboxImages();
    const index = this.activeImageIndex();
    if (!images.length || index < 0 || index >= images.length) return null;
    return images[index] ?? null;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onLightboxEscapeKey(event: KeyboardEvent): void {
    if (!this.lightboxOpen()) return;
    event.preventDefault();
    this.closeImagePreview();
  }

  @HostListener('document:keydown.arrowright', ['$event'])
  onLightboxArrowRightKey(event: KeyboardEvent): void {
    if (!this.lightboxOpen()) return;
    event.preventDefault();
    this.nextPreviewImage();
  }

  @HostListener('document:keydown.arrowleft', ['$event'])
  onLightboxArrowLeftKey(event: KeyboardEvent): void {
    if (!this.lightboxOpen()) return;
    event.preventDefault();
    this.prevPreviewImage();
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

  // ── Spotlight rail navigation — arrow buttons instead of relying on
  // drag/trackpad scrolling; still backed by native scrollLeft so touch
  // gestures keep working too. ──
  scrollSpotlight(direction: 'left' | 'right'): void {
    const el = this.spotlightRailEl()?.nativeElement;
    if (!el) return;
    const amount = Math.min(el.clientWidth * 0.9, 760);
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  }

  onSpotlightScroll(): void {
    this.updateSpotlightScrollState();
  }

  private updateSpotlightScrollState(): void {
    const el = this.spotlightRailEl()?.nativeElement;
    if (!el) {
      this.canScrollSpotlightLeft.set(false);
      this.canScrollSpotlightRight.set(false);
      return;
    }
    this.canScrollSpotlightLeft.set(el.scrollLeft > 4);
    this.canScrollSpotlightRight.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  // ── Ownership + Add/Edit Community modal ────────────────────
  isOwner(community: Community): boolean {
    return !!this.authService.currentUser() && this.authService.currentUser()?.id === community.createdById;
  }

  openAddCommunity(): void {
    this.editCommunityId.set(null);
    this.showCommunityModal.set(true);
  }

  openEditCommunity(community: Community): void {
    this.editCommunityId.set(community.id);
    this.showCommunityModal.set(true);
  }

  closeCommunityModal(): void {
    this.showCommunityModal.set(false);
    this.editCommunityId.set(null);
  }

  onCommunitySaved(community: Community): void {
    if (community.status === 'PENDING') {
      // Not visible in the public list until approved — only reflect it
      // locally when the user is already looking at their Pending Approval
      // tab; refresh the badge count either way.
      this.loadMyPendingCount();
      if (this.activeTab() !== 'pending') return;
    }
    const exists = this.communities().some(c => c.id === community.id);
    this.communities.update(list =>
      exists ? list.map(c => c.id === community.id ? community : c) : [community, ...list]
    );
  }

  // ── Delete Community ─────────────────────────────────────────
  openDeleteCommunity(community: Community): void {
    this.communityToDelete.set(community);
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.communityToDelete.set(null);
  }

  onCommunityDeleted(id: string): void {
    this.communities.update(list => list.filter(c => c.id !== id));
  }

  // ── Card owner action menu (Edit/Delete, behind a three-dot trigger) ──
  toggleActionMenu(event: Event, id: string): void {
    event.stopPropagation();
    this.openMenuId.update(cur => cur === id ? null : id);
  }

  onEditFromMenu(community: Community): void {
    this.openMenuId.set(null);
    this.openEditCommunity(community);
  }

  onDeleteFromMenu(community: Community): void {
    this.openMenuId.set(null);
    this.openDeleteCommunity(community);
  }

  @HostListener('document:click')
  closeActionMenu(): void {
    this.openMenuId.set(null);
  }
}
