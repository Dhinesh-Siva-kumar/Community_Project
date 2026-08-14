import { Component, OnInit, OnDestroy, inject, signal, computed, PLATFORM_ID, HostListener } from '@angular/core';
import { isPlatformBrowser, CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CommunityService } from '../../../core/services/community.service';
import { PostService } from '../../../core/services/post.service';
import { JobService } from '../../../core/services/job.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  User,
  DashboardStats,
  Notification,
  Community,
  Post,
  Comment,
  Job,
  PaginatedResponse,
} from '../../../core/models';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { ProfileTabsComponent, ProfileTab } from '../../../shared/components/profile-tabs/profile-tabs.component';
import { EventCalendarComponent } from '../../../shared/components/event-calendar/event-calendar.component';
import { environment } from '../../../../environments/environment';

type SharePlatform = 'whatsapp' | 'facebook' | 'x' | 'telegram' | 'linkedin' | 'email' | 'pinterest';

type PostTab = 'ALL' | 'POPULAR' | 'HELP' | 'EMERGENCY' | 'ENQUIRY';

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
  route: string;
  queryParams?: Record<string, string>;
}

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, DatePipe, ImageUrlPipe, ImageErrorHandlerDirective, ProfileTabsComponent, EventCalendarComponent],
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.scss'],
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private userService = inject(UserService);
  notificationService = inject(NotificationService);
  private communityService = inject(CommunityService);
  private postService = inject(PostService);
  private jobService = inject(JobService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private platformId = inject(PLATFORM_ID);

  // Loading states
  loading = signal(true);
  loadingPosts = signal(true);
  loadingCommunities = signal(true);
  loadingJobs = signal(true);

  // Core data
  user = signal<User | null>(null);
  stats = signal<DashboardStats | null>(null);
  today = signal(new Date());

  // Post feed
  activeTab = signal<PostTab>('ALL');
  allPosts = signal<Post[]>([]);
  expandedPostContent = signal<Set<string>>(new Set());
  readonly postContentPreviewLimit = 220;

  // Image lightbox
  lightboxOpen = signal(false);
  lightboxImages = signal<string[]>([]);
  activeImageIndex = signal(0);

  // Share modal
  shareModalOpen = signal(false);
  shareTargetPost = signal<Post | null>(null);
  sharePopupBlocked = signal(false);
  blockedShareUrl = signal<string | null>(null);

  // Post interactions (like / comment / share / save)
  likingPost = signal<string | null>(null);
  savingPost = signal<string | null>(null);
  expandedComments = signal<Set<string>>(new Set());
  loadingComments = signal<Set<string>>(new Set());
  postComments = signal<Map<string, Comment[]>>(new Map());
  submittingComment = signal<string | null>(null);
  commentForms: Map<string, FormGroup> = new Map();

  // Communities, Events, Jobs
  joinedCommunities = signal<Community[]>([]);
  recentJobs = signal<Job[]>([]);

  // Computed
  profileCompletion = computed(() => this.user()?.profileCompletion ?? 0);
  firstName = computed(() => this.user()?.displayName ?? this.user()?.userName ?? 'User');
  currentUser = computed(() => this.user());

  greeting = computed(() => {
    const hour = this.today().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  });

  // Time-of-day icon for the hero — deliberately not another copy of the
  // user's avatar, which already appears in the navbar and the composer
  // directly below; repeating it a third time in the same viewport read
  // as redundant clutter.
  greetingIcon = computed(() => {
    const hour = this.today().getHours();
    if (hour < 12) return 'bi-sunrise';
    if (hour < 17) return 'bi-sun';
    return 'bi-moon-stars';
  });

  profileStrength = computed(() => {
    const pct = this.profileCompletion();
    if (pct >= 100) return 'Complete';
    if (pct >= 75) return 'Strong';
    if (pct >= 50) return 'Intermediate';
    if (pct >= 25) return 'Getting there';
    return 'Just started';
  });

  // allPosts() is loaded latest-first (see loadPostsFromCommunities), and a
  // filter preserves that relative order — but each case sorts explicitly
  // by createdAt anyway so this doesn't silently depend on that assumption.
  filteredPosts = computed(() => {
    const posts = this.allPosts();
    const tab = this.activeTab();
    switch (tab) {
      case 'POPULAR':
        // Engagement score = likes + comments, most-engaged first; ties
        // (e.g. brand-new posts with no interactions yet) fall back to
        // most recent first.
        return [...posts].sort((a, b) => {
          const scoreA = (a._count?.likes ?? 0) + (a._count?.comments ?? 0);
          const scoreB = (b._count?.likes ?? 0) + (b._count?.comments ?? 0);
          if (scoreB !== scoreA) return scoreB - scoreA;
          return this.byLatest(a, b);
        });
      case 'HELP':
        return posts.filter((p) => p.type === 'HELP').sort((a, b) => this.byLatest(a, b));
      case 'EMERGENCY':
        return posts.filter((p) => p.type === 'EMERGENCY').sort((a, b) => this.byLatest(a, b));
      case 'ENQUIRY':
        return posts.filter((p) => p.type === 'ENQUIRY').sort((a, b) => this.byLatest(a, b));
      default:
        return [...posts].sort((a, b) => this.byLatest(a, b));
    }
  });

  private byLatest(a: Post, b: Post): number {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }

  // Five clearly distinct hues — the previous palette had Posts/Businesses/
  // Events all in the amber family, which made the icons hard to tell
  // apart at a glance in a short list.
  animatedStats = signal<AnimatedStat[]>([
    { label: 'Communities', value: 0, displayValue: 0, icon: 'bi-people-fill',            iconColor: '#16A34A', bgColor: '#DCFCE7', accentColor: '#16A34A', route: '/user/community' },
    { label: 'Posts',       value: 0, displayValue: 0, icon: 'bi-file-earmark-text-fill', iconColor: '#F59E0B', bgColor: '#FEF3C7', accentColor: '#F59E0B', route: '/user/profile', queryParams: { tab: 'posts' } },
    { label: 'Businesses',  value: 0, displayValue: 0, icon: 'bi-shop',                   iconColor: '#2563EB', bgColor: '#DBEAFE', accentColor: '#2563EB', route: '/user/business' },
    { label: 'Events',      value: 0, displayValue: 0, icon: 'bi-calendar-event-fill',    iconColor: '#7C3AED', bgColor: '#EDE9FE', accentColor: '#7C3AED', route: '/user/events' },
    { label: 'Jobs',        value: 0, displayValue: 0, icon: 'bi-briefcase-fill',         iconColor: '#0D9488', bgColor: '#CCFBF1', accentColor: '#0D9488', route: '/user/jobs' },
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

  tabs: ProfileTab[] = [
    { id: 'ALL',       label: 'All Posts',     icon: 'bi-grid-fill',                  color: '#0284C7', bgColor: '#E0F2FE' },
    { id: 'POPULAR',   label: 'Popular',       icon: 'bi-fire',                       color: '#EA580C', bgColor: '#FFEDD5' },
    { id: 'HELP',      label: 'Help Requests', icon: 'bi-question-circle-fill',       color: '#CA8A04', bgColor: '#FEF9C3' },
    { id: 'EMERGENCY', label: 'Emergency Assistance', icon: 'bi-exclamation-triangle-fill',  color: '#DC2626', bgColor: '#FEE2E2' },
    { id: 'ENQUIRY',   label: 'Enquire',       icon: 'bi-patch-question-fill',        color: '#7C3AED', bgColor: '#EDE9FE' },
  ];

  ngOnInit(): void {
    this.loadUserData();
    this.loadDashboardStats();
    this.loadNotifications();
    this.loadJoinedCommunities();
    this.loadRecentJobs();
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== null && isPlatformBrowser(this.platformId)) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (isPlatformBrowser(this.platformId)) document.body.style.overflow = '';
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
    const timeout = window.setTimeout(() => {
      console.warn('[Dashboard] communities timeout fired');
      this.loadingCommunities.set(false);
      this.loadingPosts.set(false);
    }, 8000);
    this.communityService.getJoinedCommunities().subscribe({
      next: (communities) => {
        clearTimeout(timeout);
        console.log('[Dashboard] communities loaded:', communities.length, communities);
        this.joinedCommunities.set(communities);
        this.loadPostsFromCommunities(communities);
        this.loadingCommunities.set(false);
      },
      error: (err) => {
        clearTimeout(timeout);
        console.error('[Dashboard] communities error:', err);
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
      this.postService.getPosts(c.id, { limit: 10 }).pipe(
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
    // Switching tabs swaps the whole post list, so if the reader had
    // scrolled deep into the previous tab's feed, don't leave them stranded
    // mid-scroll against unrelated content — bring the tab bar (and the
    // fresh list beneath it) back into view. Same approach as
    // community-detail's scrollToTabPanelStart.
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => this.scrollFeedToTop()));
  }

  // Note: .feed-tabs is itself `position: sticky`, so once it's stuck,
  // getBoundingClientRect().top always reports the sticky offset (80)
  // regardless of actual scroll depth — it can't be used to recover how
  // far down the document you are. Its next sibling — whichever of the
  // skeleton / empty state / post list is currently rendered right after
  // it — is a plain, non-sticky element that scrolls normally, so *its*
  // position is what we measure; .feed-tabs itself is only used for its
  // (scroll-independent) sticky offset + height.
  private scrollFeedToTop(attempt = 0): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const tabs = document.querySelector<HTMLElement>('.feed-tabs');
    const anchor = tabs?.nextElementSibling as HTMLElement | null;
    if (!tabs || !anchor) {
      if (attempt < 6) window.setTimeout(() => this.scrollFeedToTop(attempt + 1), 16);
      return;
    }

    const stickyTop = parseFloat(window.getComputedStyle(tabs).top) || 0;
    const tabsHeight = tabs.offsetHeight;
    const breathingSpace = 10;
    const desiredAnchorTop = stickyTop + tabsHeight + breathingSpace;

    const anchorTop = anchor.getBoundingClientRect().top;
    const targetScrollY = Math.max(0, window.scrollY + anchorTop - desiredAnchorTop);

    if (Math.abs(window.scrollY - targetScrollY) <= 2) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: targetScrollY, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }

  // ── Save / Bookmark ───────────────────────────────────────

  toggleSavePost(post: Post, event: MouseEvent): void {
    event.stopPropagation();
    if (this.savingPost() === post.id) return;

    this.savingPost.set(post.id);
    const wasSaved = post.isSaved;
    const action$ = wasSaved ? this.postService.unsavePost(post.id) : this.postService.savePost(post.id);

    // Optimistic update — matches toggleLike's pattern.
    this.allPosts.update((posts) => posts.map((p) => (p.id === post.id ? { ...p, isSaved: !wasSaved } : p)));

    action$.subscribe({
      next: () => this.savingPost.set(null),
      error: () => {
        this.toast.error(wasSaved ? 'Failed to unsave post' : 'Failed to save post');
        this.allPosts.update((posts) => posts.map((p) => (p.id === post.id ? { ...p, isSaved: wasSaved } : p)));
        this.savingPost.set(null);
      },
    });
  }

  // ── Like / Comment / Share ─────────────────────────────────

  toggleLike(post: Post): void {
    this.likingPost.set(post.id);
    const action$ = post.isLiked ? this.postService.unlikePost(post.id) : this.postService.likePost(post.id);
    const likeDelta = post.isLiked ? -1 : 1;

    action$.subscribe({
      next: () => {
        this.allPosts.update((posts) =>
          posts.map((p) =>
            p.id === post.id
              ? { ...p, isLiked: !post.isLiked, _count: { ...p._count!, likes: Math.max(0, (p._count?.likes ?? 0) + likeDelta), comments: p._count?.comments ?? 0 } }
              : p
          )
        );
        this.likingPost.set(null);
      },
      error: () => { this.toast.error('Failed to update like'); this.likingPost.set(null); },
    });
  }

  toggleComments(postId: string): void {
    this.expandedComments.update((set) => {
      const next = new Set(set);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
        if (!this.postComments().has(postId)) { this.loadComments(postId); }
      }
      return next;
    });
  }

  isCommentsExpanded(postId: string): boolean { return this.expandedComments().has(postId); }

  loadComments(postId: string): void {
    this.loadingComments.update((set) => { const s = new Set(set); s.add(postId); return s; });
    this.postService.getComments(postId).subscribe({
      next: (comments) => {
        this.postComments.update((map) => { const m = new Map(map); m.set(postId, comments); return m; });
        this.loadingComments.update((set) => { const s = new Set(set); s.delete(postId); return s; });
      },
      error: () => {
        this.loadingComments.update((set) => { const s = new Set(set); s.delete(postId); return s; });
      },
    });
  }

  getComments(postId: string): Comment[] { return this.postComments().get(postId) ?? []; }
  isLoadingComments(postId: string): boolean { return this.loadingComments().has(postId); }

  getCommentForm(postId: string): FormGroup {
    if (!this.commentForms.has(postId)) {
      this.commentForms.set(
        postId,
        this.fb.group({
          content: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(500)]],
        })
      );
    }
    return this.commentForms.get(postId)!;
  }

  submitComment(postId: string): void {
    const form = this.getCommentForm(postId);
    if (form.invalid) return;

    this.submittingComment.set(postId);
    const content = form.get('content')!.value;

    this.postService.addComment(postId, content).subscribe({
      next: (comment) => {
        this.postComments.update((map) => {
          const m = new Map(map);
          m.set(postId, [...(m.get(postId) ?? []), comment]);
          return m;
        });
        this.allPosts.update((posts) =>
          posts.map((p) =>
            p.id === postId
              ? { ...p, _count: { ...p._count!, comments: (p._count?.comments ?? 0) + 1, likes: p._count?.likes ?? 0 } }
              : p
          )
        );
        form.reset();
        this.submittingComment.set(null);
      },
      error: () => { this.toast.error('Failed to add comment'); this.submittingComment.set(null); },
    });
  }

  async sharePost(post: Post): Promise<void> {
    const shareUrl = this.getShareUrl(post.id);
    const postText = this.getShareContentText(post);
    const shareTitle = `${post.community?.name ?? 'Community'} Post`;

    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      this.openShareModal(post);
      return;
    }

    try {
      const files = await this.buildShareFiles(post.images);

      if (files.length > 0) {
        // The Web Share API rejects `url` combined with `files` (canShare()
        // returns false), so the link is folded into `text` instead — this
        // way the image and the link still travel together in one share.
        const withFiles: ShareData = {
          title: shareTitle,
          text: `${postText}\n\n${shareUrl}`,
          files,
        };
        if (typeof navigator.canShare === 'function' && navigator.canShare(withFiles)) {
          await navigator.share(withFiles);
          return;
        }
      }

      await navigator.share({ title: shareTitle, text: postText, url: shareUrl });
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err?.name === 'AbortError') return;
      this.openShareModal(post);
    }
  }

  openShareModal(post: Post): void {
    this.shareTargetPost.set(post);
    this.sharePopupBlocked.set(false);
    this.blockedShareUrl.set(null);
    this.shareModalOpen.set(true);
    this.syncPageScrollLock();
  }

  closeShareModal(): void {
    this.shareModalOpen.set(false);
    this.shareTargetPost.set(null);
    this.sharePopupBlocked.set(false);
    this.blockedShareUrl.set(null);
    this.syncPageScrollLock();
  }

  shareVia(platform: SharePlatform): void {
    const post = this.shareTargetPost();
    if (!post) return;

    const shareUrl = this.getShareUrl(post.id);
    const text = this.getShareContentText(post);
    const imageUrl = post.images?.[0] ? this.resolveImageUrl(post.images[0]) : null;
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(text);
    const encodedTextWithUrl = encodeURIComponent(`${shareUrl}\n\n${text}`);
    const encodedImage = imageUrl ? encodeURIComponent(imageUrl) : '';

    let target = '';
    switch (platform) {
      case 'whatsapp':
        target = `https://wa.me/?text=${encodedTextWithUrl}`;
        break;
      case 'facebook':
        target = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        break;
      case 'x':
        target = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`;
        break;
      case 'telegram':
        target = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
        break;
      case 'linkedin':
        target = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        break;
      case 'email':
        target = `mailto:?subject=${encodeURIComponent(`${post.community?.name ?? 'Community'} Post`)}&body=${encodedTextWithUrl}`;
        break;
      case 'pinterest':
        target = imageUrl
          ? `https://pinterest.com/pin/create/button/?url=${encodedUrl}&media=${encodedImage}&description=${encodedText}`
          : `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedText}`;
        break;
    }

    if (platform === 'email') {
      window.location.href = target;
      return;
    }

    this.openShareTarget(target, platform);
  }

  private openShareTarget(target: string, platform: SharePlatform): void {
    const popupFeatures = platform === 'whatsapp'
      ? 'width=980,height=760'
      : 'width=680,height=720';

    const popup = window.open(target, '_blank', popupFeatures);
    if (!popup) {
      this.sharePopupBlocked.set(true);
      this.blockedShareUrl.set(target);
      return;
    }

    this.sharePopupBlocked.set(false);
    this.blockedShareUrl.set(null);
    popup.opener = null;
  }

  openShareInSameTab(): void {
    const target = this.blockedShareUrl();
    if (!target) return;
    window.location.href = target;
  }

  copyShareLink(): void {
    const post = this.shareTargetPost();
    if (!post) return;

    const shareUrl = this.getShareUrl(post.id);
    navigator.clipboard.writeText(shareUrl)
      .then(() => this.toast.success('Share link copied.'))
      .catch(() => this.toast.error('Failed to copy share link.'));
  }

  private getShareUrl(postId: string): string {
    const base = this.getShareBaseOrigin();
    return `${base}/share/post/${postId}`;
  }

  getShareText(post: Post): string {
    const compact = this.getCompactPostContent(post);
    if (!compact) return `${post.community?.name ?? 'Community'} shared a post`;

    const previewLimit = 220;
    if (compact.length <= previewLimit) return compact;
    return `${compact.slice(0, previewLimit - 1).trimEnd()}...`;
  }

  private getShareContentText(post: Post): string {
    const communityName = post.community?.name ?? 'Community';
    const compact = this.getCompactPostContent(post);
    return compact ? `${communityName}: ${compact}` : `${communityName} shared a post`;
  }

  private getCompactPostContent(post: Post): string {
    return (post.content || '').replace(/\s+/g, ' ').trim();
  }

  private async buildShareFiles(images: string[] | undefined): Promise<File[]> {
    if (!images || images.length === 0) return [];

    const results = await Promise.all(
      images.slice(0, 4).map(async (image, index) => {
        try {
          const imageUrl = this.resolveImageUrl(image);
          const response = await fetch(imageUrl, { mode: 'cors' });
          if (!response.ok) return null;

          const blob = await response.blob();
          const mime = blob.type || 'image/jpeg';
          const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
          return new File([blob], `post-${index + 1}.${ext}`, { type: mime });
        } catch {
          return null;
        }
      })
    );

    return results.filter((file): file is File => file !== null);
  }

  private resolveImageUrl(pathOrUrl: string): string {
    if (/^(https?:)?\/\//i.test(pathOrUrl) || pathOrUrl.startsWith('data:')) {
      return pathOrUrl;
    }
    const base = environment.wsUrl || window.location.origin;
    const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${base.replace(/\/$/, '')}${normalized}`;
  }

  private getShareBaseOrigin(): string {
    const wsOrigin = (environment.wsUrl || '').trim();
    if (wsOrigin) return wsOrigin.replace(/\/$/, '');

    const apiUrl = (environment.apiUrl || '').trim();
    if (apiUrl) {
      try {
        return new URL(apiUrl, window.location.origin).origin;
      } catch {
        // ignore and fall back to current origin
      }
    }

    return window.location.origin.replace(/\/$/, '');
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

  shouldTruncatePost(content: string | undefined | null): boolean {
    return (content?.length ?? 0) > this.postContentPreviewLimit;
  }

  isPostExpanded(postId: string): boolean {
    return this.expandedPostContent().has(postId);
  }

  togglePostExpanded(postId: string): void {
    this.expandedPostContent.update((current) => {
      const next = new Set(current);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }

  getPostPreview(content: string | undefined | null): string {
    const text = content ?? '';
    if (!this.shouldTruncatePost(text)) return text;
    return `${text.slice(0, this.postContentPreviewLimit).trimEnd()}...`;
  }

  // ── Image lightbox ───────────────────────────────────────────

  openImagePreview(images: string[], startIndex = 0): void {
    if (!images?.length) return;
    this.lightboxImages.set(images);
    this.activeImageIndex.set(Math.max(0, Math.min(startIndex, images.length - 1)));
    this.lightboxOpen.set(true);
    this.syncPageScrollLock();
  }

  closeImagePreview(): void {
    this.lightboxOpen.set(false);
    this.lightboxImages.set([]);
    this.activeImageIndex.set(0);
    this.syncPageScrollLock();
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

  private syncPageScrollLock(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    document.body.style.overflow = (this.lightboxOpen() || this.shareModalOpen()) ? 'hidden' : '';
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (this.lightboxOpen()) {
      event.preventDefault();
      this.closeImagePreview();
      return;
    }
    if (this.shareModalOpen()) {
      event.preventDefault();
      this.closeShareModal();
    }
  }

  @HostListener('document:keydown.arrowright', ['$event'])
  onArrowRightKey(event: KeyboardEvent): void {
    if (!this.lightboxOpen()) return;
    event.preventDefault();
    this.nextPreviewImage();
  }

  @HostListener('document:keydown.arrowleft', ['$event'])
  onArrowLeftKey(event: KeyboardEvent): void {
    if (!this.lightboxOpen()) return;
    event.preventDefault();
    this.prevPreviewImage();
  }

  getPostTypeBadge(type: string): { label: string; class: string; icon: string } {
    switch (type) {
      case 'EMERGENCY':
        return { label: 'Emergency Assistance', class: 'badge-emergency', icon: 'bi-exclamation-triangle-fill' };
      case 'HELP':
        return { label: 'Help', class: 'badge-help', icon: 'bi-question-circle-fill' };
      case 'ENQUIRY':
        return { label: 'Enquiry', class: 'badge-enquire', icon: 'bi-patch-question-fill' };
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
      case 'POST_APPROVED':    return '#16A34A';
      case 'POST_REJECTED':    return '#EF4444';
      case 'NEW_COMMENT':      return '#D97706';
      case 'NEW_LIKE':         return '#F59E0B';
      case 'NEW_MEMBER':       return '#16A34A';
      case 'COMMUNITY_UPDATE': return '#B45309';
      case 'EVENT_REMINDER':   return '#D97706';
      default:                 return '#9CA3AF';
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

  getUserInitials(user?: User): string {
    if (!user) return '?';
    const first = user.displayName?.charAt(0) ?? '';
    return first.toUpperCase() || user.userName?.charAt(0)?.toUpperCase() || '?';
  }

  isCommentByPostAuthor(post: Post, comment: Comment): boolean {
    return post.userId === comment.userId;
  }
}
