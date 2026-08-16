import { ApplicationRef, ChangeDetectionStrategy, Component, ComponentRef, EnvironmentInjector, HostListener, OnDestroy, OnInit, computed, createComponent, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommunityService } from '../../../core/services/community.service';
import { PostService } from '../../../core/services/post.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { Community, CommunityMember, Post, Comment, PostType } from '../../../core/models';
import { AnimateOnScrollDirective } from '../../../shared/directives/animate-on-scroll.directive';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { DeletePostModalComponent } from '../../../shared/components/delete-post-modal/delete-post-modal.component';
import { CommunityFormModalComponent } from '../../../shared/components/community-form-modal/community-form-modal.component';
import { CommunityDeleteModalComponent } from '../../../shared/components/community-delete-modal/community-delete-modal.component';
import { environment } from '../../../../environments/environment';

type TabType = 'posts' | 'myposts' | 'help' | 'emergency' | 'enquire' | 'members' | 'about';

@Component({
  selector: 'app-community-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, AnimateOnScrollDirective, ImageErrorHandlerDirective, ImageUrlPipe, FileUploadComponent, CommunityFormModalComponent, CommunityDeleteModalComponent],
  templateUrl: './community-detail.component.html',
  styleUrls: ['./community-detail.component.scss'],
})
export class CommunityDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private communityService = inject(CommunityService);
  private postService = inject(PostService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private appRef = inject(ApplicationRef);
  private environmentInjector = inject(EnvironmentInjector);
  private scrollLock = inject(ScrollLockService);

  // Signals
  community = signal<Community | null>(null);
  members = signal<CommunityMember[]>([]);
  posts = signal<Post[]>([]);
  loading = signal(true);
  loadingPosts = signal(false);
  activeTab = signal<TabType>('posts');
  pendingTab = signal<TabType | null>(null);
  communityId = signal<string>('');
  tabTransition = signal(false);
  private tabSwitchTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private tabSwitchToken = 0;

  /** Ticks periodically so relative timestamps stay live under OnPush. */
  clockTick = signal(0);
  private clockTickIntervalId: ReturnType<typeof setInterval> | null = null;

  // Post creation
  submittingPost = signal(false);
  selectedPostImages = signal<File[]>([]);
  postImageResetCounter = signal(0);
  selectedPostType = signal<PostType>('GENERAL');

  // My Posts (this community) — surfaces the caller's own pending/rejected/
  // approved posts, since the main feed below only ever shows APPROVED ones.
  myPostsInCommunity = signal<Post[]>([]);
  loadingMyPosts = signal(false);
  myPostsFilterType = signal<'ALL' | PostType>('ALL');

  // Post interactions
  expandedComments = signal<Set<string>>(new Set());
  loadingComments = signal<Set<string>>(new Set());
  postComments = signal<Map<string, Comment[]>>(new Map());
  expandedPostContent = signal<Set<string>>(new Set());
  submittingComment = signal<string | null>(null);
  likingPost = signal<string | null>(null);

  // Join / Leave
  joiningCommunity = signal(false);
  leavingCommunity = signal(false);

  // Add/Edit/Delete — the form lives in app-community-form-modal, the
  // confirm popup in app-community-delete-modal; this component only opens/
  // closes them and applies the result.
  deleteModalOpen        = signal(false);
  editCommunityModalOpen = signal(false);

  // Post options menu (three-dot)
  postMenuOpenId = signal<string | null>(null);

  // Overflow ("More") menu for tabs that don't fit in the tab bar
  moreTabsMenuOpen = signal(false);

  // Image lightbox preview
  lightboxOpen = signal(false);
  lightboxImages = signal<string[]>([]);
  activeImageIndex = signal(0);

  // Share modal
  shareModalOpen = signal(false);
  shareTargetPost = signal<Post | null>(null);
  sharePopupBlocked = signal(false);
  blockedShareUrl = signal<string | null>(null);

  // Shared-post deep link (opened via a share link's #post-<id> fragment)
  highlightedPostId = signal<string | null>(null);
  private pendingSharedPostId: string | null = null;

  // Edit post modal
  editingPost          = signal<Post | null>(null);
  editModalOpen        = signal(false);
  savingEdit           = signal(false);
  selectedEditType     = signal<PostType>('GENERAL');
  editExistingImages   = signal<string[]>([]);
  editImages           = signal<File[]>([]);
  editImageResetCounter = signal(0);

  // Delete post modal
  deletePostTarget    = signal<Post | null>(null);
  deletePostModalOpen = signal(false);
  deletingPost        = signal(false);

  // Pagination — posts
  currentPage = signal(1);
  totalPages  = signal(1);
  loadingMore = signal(false);

  // Pagination — members
  loadingMembers     = signal(false);
  membersError       = signal(false);
  membersPage        = signal(1);
  membersTotalPages  = signal(1);
  loadingMoreMembers = signal(false);

  // Forms
  readonly postContentMinLength = 3;
  readonly postContentMaxLength = 2000;
  readonly postContentPreviewLimit = 220;

  postForm: FormGroup = this.fb.group({
    content: ['', [Validators.required, Validators.minLength(this.postContentMinLength), Validators.maxLength(this.postContentMaxLength)]],
  });
  editPostForm: FormGroup = this.fb.group({
    content: ['', [Validators.required, Validators.minLength(this.postContentMinLength), Validators.maxLength(this.postContentMaxLength)]],
  });
  commentForms: Map<string, FormGroup> = new Map();
  private isScrollLocked = false;
  private deletePostModalRef: ComponentRef<DeletePostModalComponent> | null = null;
  private deletePostModalHost: HTMLElement | null = null;

  // ── Computed ──────────────────────────────────────────────
  currentUser    = computed(() => this.authService.currentUser());
  currentUserId  = computed(() => this.currentUser()?.id ?? '');

  isAdmin = computed(() => this.router.url.startsWith('/admin'));

  communityMode = computed(() => this.community()?.community_mode ?? 'HELP_EMERGENCY');
  isEnquireMode = computed(() => this.communityMode() === 'ENQUIRE');

  isMember = computed(() => {
    const uid = this.currentUserId();
    if (!uid) return false;
    return this.members().some((m) => m.user?.id === uid);
  });

  backRoute = computed(() => this.isAdmin() ? '/admin/community' : '/user/community');

  // The tab button should light up the instant it's clicked, even while the
  // 150ms fade transition (and `activeTab` itself) hasn't switched over yet.
  displayTab = computed(() => this.pendingTab() ?? this.activeTab());

  // Highlights the "More" tab button when one of its overflow items is active
  isMoreTabActive = computed(() => this.displayTab() === 'members' || this.displayTab() === 'about');

  filteredPosts = computed(() => {
    const tab = this.activeTab();
    const allPosts = this.posts();
    switch (tab) {
      case 'help':      return allPosts.filter((p) => p.type === 'HELP');
      case 'emergency': return allPosts.filter((p) => p.type === 'EMERGENCY');
      case 'enquire':   return allPosts.filter((p) => p.type === 'ENQUIRY');
      default:          return allPosts;
    }
  });

  memberCount    = computed(() => this.community()?._count?.members ?? 0);
  postCount      = computed(() => this.community()?._count?.posts ?? 0);
  helpCount      = computed(() => this.posts().filter((p) => p.type === 'HELP').length);
  emergencyCount = computed(() => this.posts().filter((p) => p.type === 'EMERGENCY').length);
  enquiryCount   = computed(() => this.posts().filter((p) => p.type === 'ENQUIRY').length);

  filteredMyPosts = computed(() => {
    const type = this.myPostsFilterType();
    const posts = this.myPostsInCommunity();
    return type === 'ALL' ? posts : posts.filter((p) => p.type === type);
  });

  communityCreatorId = computed(() => {
    const c = this.community();
    return c?.createdBy?.id || c?.createdById || '';
  });

  isOwnerOfCommunity = computed(() => {
    const uid = this.currentUserId();
    return !!uid && uid === this.communityCreatorId();
  });

  communityAuthor = computed(() => {
    const c = this.community();
    if (!c) return null;

    if (c.createdBy) {
      return c.createdBy;
    }

    const creatorId = c.createdById;
    if (!creatorId) return null;

    const creatorMember = this.members().find((member) => member.user?.id === creatorId);
    if (creatorMember?.user) {
      return {
        id: creatorMember.user.id,
        userName: creatorMember.user.userName,
        displayName: creatorMember.user.displayName,
      };
    }

    return { id: creatorId, userName: '', displayName: 'Community Admin' };
  });

  displayMembers = computed(() => {
    const list = this.members();
    const creatorId = this.communityCreatorId();
    if (!creatorId || list.length < 2) return list;

    const creatorIndex = list.findIndex((member) => member.user?.id === creatorId);
    if (creatorIndex <= 0) return list;

    const next = [...list];
    const [creator] = next.splice(creatorIndex, 1);
    next.unshift(creator);
    return next;
  });

  daysActive = computed(() => {
    const c = this.community();
    if (!c) return 0;
    const dateStr = c.created_at ?? c.createdAt;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  });

  ngOnInit(): void {
    this.initForms();

    // Under OnPush, this component only re-renders when something it owns
    // actually changes — so relative timestamps ("5m ago") would otherwise
    // freeze until an unrelated interaction happens to trigger a re-render.
    // Ticking this signal periodically keeps them live.
    if (typeof window !== 'undefined') {
      this.clockTickIntervalId = window.setInterval(() => this.clockTick.update((n) => n + 1), 60_000);
    }

    this.route.params.subscribe((params) => {
      const id = params['id'];
      if (id) {
        this.communityId.set(id);
        // Read the fragment fresh on every navigation (not just the first),
        // so opening a shared link for a different community still works
        // if Angular reuses this component instance (e.g. same-route nav).
        this.pendingSharedPostId = this.parseSharedPostId(this.route.snapshot.fragment);
        this.loadCommunity();
        this.loadPosts();
        this.membersPage.set(1);
        this.loadMembers();
      }
    });
  }

  private parseSharedPostId(fragment: string | null): string | null {
    if (!fragment) return null;
    const match = /^post-(.+)$/.exec(fragment);
    return match ? match[1] : null;
  }

  initForms(): void {
    this.postForm = this.fb.group({
      content: ['', [Validators.required, Validators.minLength(this.postContentMinLength), Validators.maxLength(this.postContentMaxLength)]],
    });
    this.editPostForm = this.fb.group({
      content: ['', [Validators.required, Validators.minLength(this.postContentMinLength), Validators.maxLength(this.postContentMaxLength)]],
    });
  }

  ngOnDestroy(): void {
    if (this.tabSwitchTimeoutId !== null) {
      clearTimeout(this.tabSwitchTimeoutId);
    }
    if (this.clockTickIntervalId !== null) {
      clearInterval(this.clockTickIntervalId);
    }
    this.destroyDeletePostModal();
    this.unlockPageScroll();
  }

  getCommentForm(postId: string): FormGroup {
    if (!this.commentForms.has(postId)) {
      this.commentForms.set(
        postId,
        this.fb.group({
          content: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(300)]],
        })
      );
    }
    return this.commentForms.get(postId)!;
  }

  // ── Data Loading ──────────────────────────────────────────

  loadCommunity(): void {
    this.loading.set(true);
    this.communityService.getCommunity(this.communityId()).subscribe({
      next: (community) => { this.community.set(community); this.loading.set(false); },
      error: () => { this.toast.error('Failed to load community'); this.loading.set(false); },
    });
  }

  loadPosts(append = false): void {
    if (!append) { this.loadingPosts.set(true); } else { this.loadingMore.set(true); }

    const params: Record<string, any> = { page: this.currentPage(), limit: 10 };

    this.postService.getPosts(this.communityId(), params).subscribe({
      next: (response) => {
        if (append) {
          this.posts.update((current) => [...current, ...response.data]);
        } else {
          this.posts.set(response.data);
        }
        this.totalPages.set(response.totalPages);
        this.loadingPosts.set(false);
        this.loadingMore.set(false);

        if (!append) {
          this.resolveSharedPostDeepLink();
        }
      },
      error: () => {
        this.toast.error('Failed to load posts');
        this.loadingPosts.set(false);
        this.loadingMore.set(false);
      },
    });
  }

  private resolveSharedPostDeepLink(): void {
    const postId = this.pendingSharedPostId;
    if (!postId) return;
    this.pendingSharedPostId = null;

    if (this.posts().some((p) => p.id === postId)) {
      this.highlightSharedPost(postId);
      return;
    }

    const requestedForCommunityId = this.communityId();
    this.postService.getPost(postId).subscribe({
      next: (post) => {
        // Bail if the user navigated to a different community while this was in flight.
        if (this.communityId() !== requestedForCommunityId) return;
        this.posts.update((list) => (list.some((p) => p.id === post.id) ? list : [post, ...list]));
        this.highlightSharedPost(postId);
      },
      error: () => this.toast.error('This post is no longer available.'),
    });
  }

  private highlightSharedPost(postId: string): void {
    this.highlightedPostId.set(postId);
    this.scheduleSharedPostScroll(postId);
    setTimeout(() => {
      if (this.highlightedPostId() === postId) {
        this.highlightedPostId.set(null);
      }
    }, 2500);
  }

  private scheduleSharedPostScroll(postId: string): void {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => this.scrollToSharedPost(postId));
    });
  }

  private scrollToSharedPost(postId: string, attempt = 0): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const target = document.querySelector<HTMLElement>(`[data-post-id="${postId}"]`);
    if (!target) {
      if (attempt < 6) {
        window.setTimeout(() => this.scrollToSharedPost(postId, attempt + 1), 16);
      }
      return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
  }

  loadMembers(append = false): void {
    if (!append) {
      this.loadingMembers.set(true);
      this.membersError.set(false);
    } else {
      this.loadingMoreMembers.set(true);
    }

    this.communityService.getMembers(this.communityId(), this.membersPage(), 20).subscribe({
      next: (response) => {
        if (append) {
          this.members.update((current) => [...current, ...response.data]);
        } else {
          this.members.set(response.data);
        }
        this.membersTotalPages.set(response.totalPages);
        this.loadingMembers.set(false);
        this.loadingMoreMembers.set(false);
      },
      error: () => {
        this.membersError.set(true);
        this.loadingMembers.set(false);
        this.loadingMoreMembers.set(false);
      },
    });
  }

  loadMoreMembers(): void {
    if (this.membersPage() >= this.membersTotalPages() || this.loadingMoreMembers()) return;
    this.membersPage.update((p) => p + 1);
    this.loadMembers(true);
  }

  loadMore(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((p) => p + 1);
      this.loadPosts(true);
    }
  }

  // ── Tab Navigation ────────────────────────────────────────

  setTab(tab: TabType): void {
    if (this.activeTab() === tab) return;

    // Cancel any switch that's still pending so rapid clicks can't leave
    // `tabTransition` cleared early or scroll to a tab that's no longer current.
    if (this.tabSwitchTimeoutId !== null) {
      clearTimeout(this.tabSwitchTimeoutId);
    }

    const token = ++this.tabSwitchToken;
    this.pendingTab.set(tab);
    this.tabTransition.set(true);

    this.tabSwitchTimeoutId = setTimeout(() => {
      this.tabSwitchTimeoutId = null;
      if (token !== this.tabSwitchToken) return;

      this.activeTab.set(tab);
      if (tab === 'myposts' && this.myPostsInCommunity().length === 0) {
        this.loadMyPostsInCommunity();
      }
      switch (tab) {
        case 'help':      this.selectedPostType.set('HELP');      break;
        case 'emergency': this.selectedPostType.set('EMERGENCY'); break;
        case 'enquire':   this.selectedPostType.set('ENQUIRY');   break;
        default:          this.selectedPostType.set('GENERAL');   break;
      }
      this.tabTransition.set(false);
      this.pendingTab.set(null);
      this.scheduleTabPanelScroll(tab, token);
    }, 150);
  }

  private scheduleTabPanelScroll(tab: TabType, token: number): void {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => this.scrollToTabPanelStart(tab, token));
    });
  }

  private scrollToTabPanelStart(tab: TabType, token: number, attempt = 0): void {
    if (token !== this.tabSwitchToken) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const panel = document.querySelector<HTMLElement>(`[data-tab-panel="${tab}"] .cd-tab-panel-start`);
    if (!panel) {
      if (attempt < 6) {
        window.setTimeout(() => this.scrollToTabPanelStart(tab, token, attempt + 1), 16);
      }
      return;
    }

    const panelTop = panel.getBoundingClientRect().top;
    const stickyTabs = document.querySelector<HTMLElement>(`[data-tab-panel="${tab}"] .cd-tabs-sticky`);
    const tabsWrap = stickyTabs?.querySelector<HTMLElement>('.cd-tabs-wrap');
    const stickyTop = stickyTabs ? (parseFloat(window.getComputedStyle(stickyTabs).top) || 0) : 0;
    const stickyPadTop = stickyTabs ? (parseFloat(window.getComputedStyle(stickyTabs).paddingTop) || 0) : 0;
    const tabsHeight = (tabsWrap?.offsetHeight ?? stickyTabs?.offsetHeight ?? 0) + stickyPadTop;
    const breathingSpace = 10;
    const desiredPanelTop = stickyTop + tabsHeight + breathingSpace;
    const targetTop = Math.max(0, window.scrollY + panelTop - desiredPanelTop);

    if (Math.abs(window.scrollY - targetTop) <= 2) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: targetTop,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }

  // ── Post Creation ─────────────────────────────────────────

  setPostType(type: PostType): void { this.selectedPostType.set(type); }

  onPostImagesChange(files: File[]): void {
    this.selectedPostImages.set(files);
  }

  submitPost(): void {
    if (this.postForm.invalid) { this.postForm.markAllAsTouched(); return; }

    this.submittingPost.set(true);
    const content = this.postForm.get('content')!.value;
    const type    = this.selectedPostType();
    const images  = this.selectedPostImages();

    this.postService.createPost(this.communityId(), { content, type }, images.length > 0 ? images : undefined).subscribe({
      next: (post) => {
        const successMsg = this.isAdmin() ? 'Post published successfully!' : 'Post submitted! It will appear after approval.';
        this.toast.success(successMsg);
        this.postForm.reset();
        this.selectedPostImages.set([]);
        this.postImageResetCounter.update((n) => n + 1);
        this.submittingPost.set(false);
        if (post.status === 'APPROVED') {
          this.posts.update((current) => [post, ...current]);
        }
        this.myPostsInCommunity.update((current) => [post, ...current]);
      },
      error: () => { this.toast.error('Failed to create post'); this.submittingPost.set(false); },
    });
  }

  // ── My Posts (this community) ────────────────────────────────
  setMyPostsFilterType(type: 'ALL' | PostType): void {
    this.myPostsFilterType.set(type);
  }

  loadMyPostsInCommunity(): void {
    this.loadingMyPosts.set(true);
    this.postService.getMyPosts({ communityId: this.communityId(), page: 1, limit: 50 }).subscribe({
      next: (r) => { this.myPostsInCommunity.set(r.data); this.loadingMyPosts.set(false); },
      error: () => this.loadingMyPosts.set(false),
    });
  }

  // ── Post Interactions ─────────────────────────────────────

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

  toggleLike(post: Post): void {
    if (this.likingPost() === post.id) return;

    this.likingPost.set(post.id);
    const currentlyLiked = !!post.isLiked;
    const action$ = currentlyLiked ? this.postService.unlikePost(post.id) : this.postService.likePost(post.id);
    const likeDelta = currentlyLiked ? -1 : 1;

    this.posts.update((posts) =>
      posts.map((p) =>
        p.id === post.id
          ? {
              ...p,
              isLiked: !currentlyLiked,
              _count: {
                ...p._count!,
                likes: Math.max(0, (p._count?.likes ?? 0) + likeDelta),
                comments: p._count?.comments ?? 0,
              },
            }
          : p
      )
    );

    action$.subscribe({
      next: () => {
        this.likingPost.set(null);
      },
      error: () => {
        this.posts.update((posts) =>
          posts.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  isLiked: currentlyLiked,
                  _count: {
                    ...p._count!,
                    likes: Math.max(0, (p._count?.likes ?? 0) - likeDelta),
                    comments: p._count?.comments ?? 0,
                  },
                }
              : p
          )
        );
        this.toast.error('Failed to update like');
        this.likingPost.set(null);
      },
    });
  }

  isCommentByPostAuthor(post: Post, comment: Comment): boolean {
    return post.userId === comment.userId;
  }

  toggleComments(postId: string): void {
    this.expandedComments.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
        if (!this.postComments().has(postId)) { this.loadComments(postId); }
      }
      return newSet;
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

  submitComment(postId: string): void {
    const form = this.getCommentForm(postId);
    if (form.invalid) return;

    this.submittingComment.set(postId);
    const content = form.get('content')!.value;

    this.postService.addComment(postId, content).subscribe({
      next: (comment) => {
        this.postComments.update((map) => {
          const m = new Map(map);
          m.set(postId, [comment, ...(m.get(postId) ?? [])]);
          return m;
        });
        this.posts.update((posts) =>
          posts.map((p) =>
            p.id === postId
              ? { ...p, _count: { ...p._count!, comments: (p._count?.comments ?? 0) + 1, likes: p._count?.likes ?? 0 } }
              : p
          )
        );
        form.reset();
        setTimeout(() => {
          const container = document.querySelector<HTMLElement>(`.comment-list-scroll[data-post-id="${postId}"]`);
          if (container) {
            container.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 0);
        this.submittingComment.set(null);
      },
      error: () => { this.toast.error('Failed to add comment'); this.submittingComment.set(null); },
    });
  }

  async sharePost(post: Post): Promise<void> {
    const shareUrl = this.getShareUrl(post.id);
    const postText = this.getShareContentText(post);
    const shareTitle = `${this.community()?.name ?? 'Community'} Post`;

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

  shareVia(platform: 'whatsapp' | 'facebook' | 'x' | 'telegram' | 'linkedin' | 'email' | 'pinterest'): void {
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
        target = `mailto:?subject=${encodeURIComponent(`${this.community()?.name ?? 'Community'} Post`)}&body=${encodedTextWithUrl}`;
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

  private openShareTarget(target: string, platform: 'whatsapp' | 'facebook' | 'x' | 'telegram' | 'linkedin' | 'pinterest'): void {
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
    if (!compact) return `${this.community()?.name ?? 'Community'} shared a post`;

    const previewLimit = 220;
    if (compact.length <= previewLimit) {
      return compact;
    }
    return `${compact.slice(0, previewLimit - 1).trimEnd()}...`;
  }

  private getShareContentText(post: Post): string {
    const communityName = this.community()?.name ?? 'Community';
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
          return new File([blob], `community-post-${index + 1}.${ext}`, { type: mime });
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
    if (wsOrigin) {
      return wsOrigin.replace(/\/$/, '');
    }

    const apiUrl = (environment.apiUrl || '').trim();
    if (apiUrl) {
      try {
        return new URL(apiUrl, window.location.origin).origin;
      } catch {
        // ignore and fallback to current origin
      }
    }

    return window.location.origin.replace(/\/$/, '');
  }

  // ── Post Options Menu ─────────────────────────────────────

  @HostListener('document:click')
  onDocumentClick(): void {
    this.postMenuOpenId.set(null);
    this.moreTabsMenuOpen.set(false);
  }

  toggleMoreTabsMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.moreTabsMenuOpen.update((v) => !v);
  }

  closeMoreTabsMenu(): void {
    this.moreTabsMenuOpen.set(false);
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
      return;
    }
    if (this.deletePostModalOpen()) {
      event.preventDefault();
      this.closeDeletePostModal();
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

  togglePostMenu(postId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.postMenuOpenId.update((id) => (id === postId ? null : postId));
  }

  canManagePost(post: Post): boolean {
    return this.isAdmin() || post.userId === this.currentUserId();
  }

  reportPost(post: Post): void {
    this.postMenuOpenId.set(null);
    this.postService.reportPost(post.id).subscribe({
      next: () => this.toast.success('Post reported. Our team will review it.'),
      error: () => this.toast.error('Failed to report post'),
    });
  }

  // ── Edit Post ─────────────────────────────────────────────

  openEditPostModal(post: Post): void {
    this.postMenuOpenId.set(null);
    this.editingPost.set(post);
    this.selectedEditType.set(post.type);
    this.editPostForm.setValue({ content: post.content });
    this.editExistingImages.set([...(post.images ?? [])]);
    this.editImages.set([]);
    this.editImageResetCounter.update((n) => n + 1);
    this.editModalOpen.set(true);
    this.syncPageScrollLock();
  }

  closeEditModal(): void {
    this.editModalOpen.set(false);
    this.editingPost.set(null);
    this.editExistingImages.set([]);
    this.editPostForm.reset();
    this.syncPageScrollLock();
  }

  setEditPostType(type: PostType): void { this.selectedEditType.set(type); }

  onEditImagesChange(files: File[]): void { this.editImages.set(files); }

  removeEditExistingImage(index: number): void {
    this.editExistingImages.update((images) => images.filter((_, i) => i !== index));
  }

  saveEditPost(): void {
    if (this.editPostForm.invalid) { this.editPostForm.markAllAsTouched(); return; }
    const post = this.editingPost();
    if (!post) return;

    this.savingEdit.set(true);
    const content = this.editPostForm.get('content')!.value as string;
    const type    = this.selectedEditType();
    const retainedImages = this.editExistingImages();
    const images  = this.editImages();

    this.postService.updatePost(post.id, { content, type, images: retainedImages }, images.length > 0 ? images : undefined).subscribe({
      next: (updated) => {
        this.posts.update((current) => current.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
        this.myPostsInCommunity.update((current) => current.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
        const resubmitted = post.status === 'REJECTED' && updated.status !== 'REJECTED';
        this.toast.success(resubmitted ? 'Post updated and resubmitted for approval!' : 'Post updated successfully!');
        this.savingEdit.set(false);
        this.closeEditModal();
      },
      error: () => { this.toast.error('Failed to update post'); this.savingEdit.set(false); },
    });
  }

  // ── Delete Post ───────────────────────────────────────────

  openDeletePostModal(post: Post): void {
    this.postMenuOpenId.set(null);
    this.deletePostTarget.set(post);
    this.deletingPost.set(false);
    this.deletePostModalOpen.set(true);
    this.renderDeletePostModal();
    this.syncPageScrollLock();
  }

  closeDeletePostModal(): void {
    this.deletePostModalOpen.set(false);
    this.deletePostTarget.set(null);
    this.deletingPost.set(false);
    this.destroyDeletePostModal();
    this.syncPageScrollLock();
  }

  confirmDeletePost(): void {
    const post = this.deletePostTarget();
    if (!post) return;

    this.deletingPost.set(true);
    this.updateDeletePostModalInputs();
    this.postService.deletePost(post.id).subscribe({
      next: () => {
        this.posts.update((current) => current.filter((p) => p.id !== post.id));
        this.community.update((current) => {
          if (!current) return current;
          const currentMembers = current._count?.members ?? 0;
          const currentPosts = current._count?.posts ?? 0;
          return {
            ...current,
            _count: {
              members: currentMembers,
              posts: Math.max(0, currentPosts - 1),
            },
          };
        });
        this.toast.success('Post deleted successfully.');
        this.deletingPost.set(false);
        this.closeDeletePostModal();
      },
      error: () => {
        this.toast.error('Failed to delete post');
        this.deletingPost.set(false);
        this.updateDeletePostModalInputs();
      },
    });
  }

  // ── Admin Actions ─────────────────────────────────────────

  openDeleteModal():  void { this.deleteModalOpen.set(true); this.syncPageScrollLock(); }
  closeDeleteModal(): void { this.deleteModalOpen.set(false); this.syncPageScrollLock(); }

  openEditCommunityModal(): void {
    this.editCommunityModalOpen.set(true);
    this.syncPageScrollLock();
  }

  closeEditCommunityModal(): void {
    this.editCommunityModalOpen.set(false);
    this.syncPageScrollLock();
  }

  onCommunitySaved(updated: Community): void {
    this.community.set(updated);
  }

  onJoinCommunity(): void {
    this.joiningCommunity.set(true);
    this.communityService.joinCommunity(this.communityId()).subscribe({
      next: () => {
        this.toast.success('You have joined the community!');
        this.membersPage.set(1);
        this.loadMembers();
        this.community.update((c) =>
          c ? { ...c, _count: { ...c._count!, members: (c._count?.members ?? 0) + 1 } } : c
        );
        this.joiningCommunity.set(false);
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'Failed to join community');
        this.joiningCommunity.set(false);
      },
    });
  }

  onLeaveCommunity(): void {
    this.leavingCommunity.set(true);
    this.communityService.leaveCommunity(this.communityId()).subscribe({
      next: () => {
        this.toast.success('You have left the community');
        this.membersPage.set(1);
        this.loadMembers();
        this.community.update((c) =>
          c ? { ...c, _count: { ...c._count!, members: Math.max(0, (c._count?.members ?? 0) - 1) } } : c
        );
        this.leavingCommunity.set(false);
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'Failed to leave community');
        this.leavingCommunity.set(false);
      },
    });
  }

  onCommunityDeleted(): void {
    this.router.navigate([this.backRoute()]);
  }

  getDeletePostPreview(): string | null {
    const content = this.deletePostTarget()?.content;
    if (!content) return null;
    return `${content.slice(0, 120)}${content.length > 120 ? '...' : ''}`;
  }

  private renderDeletePostModal(): void {
    if (!this.deletePostModalOpen()) return;

    if (!this.deletePostModalRef) {
      const host = document.createElement('div');
      document.body.appendChild(host);

      const ref = createComponent(DeletePostModalComponent, {
        environmentInjector: this.environmentInjector,
        hostElement: host,
      });

      ref.instance.cancel.subscribe(() => this.closeDeletePostModal());
      ref.instance.confirm.subscribe(() => this.confirmDeletePost());

      this.appRef.attachView(ref.hostView);

      this.deletePostModalRef = ref;
      this.deletePostModalHost = host;
    }

    this.updateDeletePostModalInputs();
  }

  private updateDeletePostModalInputs(): void {
    if (!this.deletePostModalRef) return;
    this.deletePostModalRef.instance.open = this.deletePostModalOpen();
    this.deletePostModalRef.instance.deleting = this.deletingPost();
    this.deletePostModalRef.instance.previewContent = this.getDeletePostPreview();
    this.deletePostModalRef.changeDetectorRef.detectChanges();
  }

  private destroyDeletePostModal(): void {
    if (!this.deletePostModalRef) return;

    this.appRef.detachView(this.deletePostModalRef.hostView);
    this.deletePostModalRef.destroy();
    this.deletePostModalRef = null;

    if (this.deletePostModalHost) {
      this.deletePostModalHost.remove();
      this.deletePostModalHost = null;
    }
  }

  private syncPageScrollLock(): void {
    const hasOpenModal =
      this.deleteModalOpen() ||
      this.editModalOpen() ||
      this.deletePostModalOpen() ||
      this.editCommunityModalOpen() ||
      this.lightboxOpen() ||
      this.shareModalOpen();

    if (hasOpenModal) {
      this.lockPageScroll();
      return;
    }
    this.unlockPageScroll();
  }

  private lockPageScroll(): void {
    // Guard against re-entrant locking (e.g. two modal signals flipping in
    // the same tick) so this component only ever holds one ScrollLockService
    // reference at a time.
    if (this.isScrollLocked) return;
    this.isScrollLocked = true;
    this.scrollLock.lock();
  }

  private unlockPageScroll(): void {
    if (!this.isScrollLocked) return;
    this.isScrollLocked = false;
    this.scrollLock.unlock();
  }

  getCommunityStatus(): { label: string; cls: string } {
    const c = this.community();
    if (!c) return { label: 'Unknown', cls: '' };
    const active = c.is_active ?? c.isActive;
    return active
      ? { label: 'Active',   cls: 'cd-status-active'   }
      : { label: 'Inactive', cls: 'cd-status-inactive' };
  }

  getVisibilityInfo(): { label: string; icon: string; cls: string } {
    const c = this.community();
    if (!c) return { label: 'Default', icon: 'bi-eye',        cls: 'cd-vis--default' };
    if (c.is_private) return { label: 'Private', icon: 'bi-lock-fill', cls: 'cd-vis--private' };
    if (c.is_global)  return { label: 'Global',  icon: 'bi-globe2',    cls: 'cd-vis--global'  };
    return { label: 'Default', icon: 'bi-eye', cls: 'cd-vis--default' };
  }

  // ── Utility ───────────────────────────────────────────────

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

  getPostTypeBadge(type: PostType): { label: string; class: string; icon: string } {
    switch (type) {
      case 'EMERGENCY': return { label: 'Emergency Assistance', class: 'bg-danger',   icon: 'bi-exclamation-triangle-fill' };
      case 'HELP':      return { label: 'Help',      class: 'bg-warning text-dark',   icon: 'bi-life-preserver'            };
      case 'ENQUIRY':   return { label: 'Enquire',   class: 'bg-enquire',             icon: 'bi-question-circle-fill'      };
      default:          return { label: 'General',   class: 'bg-primary',             icon: 'bi-chat-dots-fill'            };
    }
  }

  getTimeAgo(dateStr: string): string {
    // Reading this signal makes the calling template expression re-evaluate
    // as clockTick ticks, so "5m ago" keeps advancing under OnPush.
    this.clockTick();
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60)     return 'Just now';
    if (seconds < 3600)   return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400)  return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  getUserInitials(user?: { displayName?: string; userName?: string } | null): string {
    if (!user) return '?';
    return (user.displayName || user.userName || '').charAt(0).toUpperCase() || '?';
  }

  getUserFullName(user?: { displayName?: string; userName?: string } | null): string {
    if (!user) return 'Unknown User';
    return user.displayName || user.userName || 'Unknown User';
  }

  isCommunityCreator(member: CommunityMember): boolean {
    const creatorId = this.communityCreatorId();
    return !!creatorId && member.user?.id === creatorId;
  }
}
