import { Component, OnInit, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommunityService } from '../../../core/services/community.service';
import { PostService } from '../../../core/services/post.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Community, CommunityMember, Post, Comment, PostType } from '../../../core/models';
import { AnimateOnScrollDirective } from '../../../shared/directives/animate-on-scroll.directive';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';

type TabType = 'posts' | 'help' | 'emergency' | 'members' | 'about';

@Component({
  selector: 'app-community-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, AnimateOnScrollDirective, ImageUrlPipe, FileUploadComponent],
  templateUrl: './community-detail.component.html',
  styleUrls: ['./community-detail.component.scss'],
})
export class CommunityDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private communityService = inject(CommunityService);
  private postService = inject(PostService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  // Signals
  community = signal<Community | null>(null);
  members = signal<CommunityMember[]>([]);
  posts = signal<Post[]>([]);
  loading = signal(true);
  loadingPosts = signal(false);
  activeTab = signal<TabType>('posts');
  communityId = signal<string>('');
  tabTransition = signal(false);

  // Post creation
  submittingPost = signal(false);
  selectedPostImages = signal<File[]>([]);
  postImageResetCounter = signal(0);
  selectedPostType = signal<PostType>('GENERAL');

  // Post interactions
  expandedComments = signal<Set<string>>(new Set());
  loadingComments = signal<Set<string>>(new Set());
  postComments = signal<Map<string, Comment[]>>(new Map());
  submittingComment = signal<string | null>(null);
  likingPost = signal<string | null>(null);

  // Join / Leave
  joiningCommunity = signal(false);
  leavingCommunity = signal(false);

  // Admin actions — delete modal
  deleteModalOpen    = signal(false);
  deletingCommunity  = signal(false);

  // Post options menu (three-dot)
  postMenuOpenId = signal<string | null>(null);

  // Edit post modal
  editingPost          = signal<Post | null>(null);
  editModalOpen        = signal(false);
  savingEdit           = signal(false);
  selectedEditType     = signal<PostType>('GENERAL');
  editImages           = signal<File[]>([]);
  editImageResetCounter = signal(0);
  editPostForm!: FormGroup;

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
  postForm!: FormGroup;
  commentForms: Map<string, FormGroup> = new Map();

  // ── Computed ──────────────────────────────────────────────
  currentUser    = computed(() => this.authService.currentUser());
  currentUserId  = computed(() => this.currentUser()?.id ?? '');

  isAdmin = computed(() => this.router.url.startsWith('/admin'));

  isMember = computed(() => {
    const uid = this.currentUserId();
    if (!uid) return false;
    return this.members().some((m) => m.user?.id === uid);
  });

  backRoute = computed(() => this.isAdmin() ? '/admin/community' : '/user/community');

  filteredPosts = computed(() => {
    const tab = this.activeTab();
    const allPosts = this.posts();
    switch (tab) {
      case 'help':      return allPosts.filter((p) => p.type === 'HELP');
      case 'emergency': return allPosts.filter((p) => p.type === 'EMERGENCY');
      default:          return allPosts;
    }
  });

  memberCount    = computed(() => this.community()?._count?.members ?? 0);
  postCount      = computed(() => this.community()?._count?.posts ?? 0);
  helpCount      = computed(() => this.posts().filter((p) => p.type === 'HELP').length);
  emergencyCount = computed(() => this.posts().filter((p) => p.type === 'EMERGENCY').length);

  daysActive = computed(() => {
    const c = this.community();
    if (!c) return 0;
    const dateStr = c.created_at ?? c.createdAt;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  });

  ngOnInit(): void {
    this.initForms();
    this.route.params.subscribe((params) => {
      const id = params['id'];
      if (id) {
        this.communityId.set(id);
        this.loadCommunity();
        this.loadPosts();
        this.membersPage.set(1);
        this.loadMembers();
      }
    });
  }

  initForms(): void {
    this.postForm = this.fb.group({
      content: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(2000)]],
    });
    this.editPostForm = this.fb.group({
      content: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(2000)]],
    });
  }

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

    const params: Record<string, any> = { page: this.currentPage(), limit: 10, status: 'APPROVED' };

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
      },
      error: () => {
        this.toast.error('Failed to load posts');
        this.loadingPosts.set(false);
        this.loadingMore.set(false);
      },
    });
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
    this.tabTransition.set(true);
    setTimeout(() => {
      this.activeTab.set(tab);
      switch (tab) {
        case 'help':      this.selectedPostType.set('HELP');      break;
        case 'emergency': this.selectedPostType.set('EMERGENCY'); break;
        default:          this.selectedPostType.set('GENERAL');   break;
      }
      this.tabTransition.set(false);
    }, 150);
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
      },
      error: () => { this.toast.error('Failed to create post'); this.submittingPost.set(false); },
    });
  }

  // ── Post Interactions ─────────────────────────────────────

  toggleLike(post: Post): void {
    this.likingPost.set(post.id);
    const action$ = post.isLiked ? this.postService.unlikePost(post.id) : this.postService.likePost(post.id);
    const likeDelta = post.isLiked ? -1 : 1;

    action$.subscribe({
      next: () => {
        this.posts.update((posts) =>
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
          m.set(postId, [...(m.get(postId) ?? []), comment]);
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
        this.submittingComment.set(null);
      },
      error: () => { this.toast.error('Failed to add comment'); this.submittingComment.set(null); },
    });
  }

  sharePost(post: Post): void {
    const url = `${window.location.origin}${this.isAdmin() ? '/admin' : '/user'}/community/${this.communityId()}`;
    navigator.clipboard.writeText(url)
      .then(() => this.toast.success('Link copied to clipboard!'))
      .catch(() => this.toast.error('Failed to copy link'));
  }

  // ── Post Options Menu ─────────────────────────────────────

  @HostListener('document:click')
  onDocumentClick(): void {
    this.postMenuOpenId.set(null);
  }

  togglePostMenu(postId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.postMenuOpenId.update((id) => (id === postId ? null : postId));
  }

  canManagePost(post: Post): boolean {
    return this.isAdmin() || post.userId === this.currentUserId();
  }

  // ── Edit Post ─────────────────────────────────────────────

  openEditPostModal(post: Post): void {
    this.postMenuOpenId.set(null);
    this.editingPost.set(post);
    this.selectedEditType.set(post.type);
    this.editPostForm.setValue({ content: post.content });
    this.editImages.set([]);
    this.editImageResetCounter.update((n) => n + 1);
    this.editModalOpen.set(true);
  }

  closeEditModal(): void {
    this.editModalOpen.set(false);
    this.editingPost.set(null);
    this.editPostForm.reset();
  }

  setEditPostType(type: PostType): void { this.selectedEditType.set(type); }

  onEditImagesChange(files: File[]): void { this.editImages.set(files); }

  saveEditPost(): void {
    if (this.editPostForm.invalid) { this.editPostForm.markAllAsTouched(); return; }
    const post = this.editingPost();
    if (!post) return;

    this.savingEdit.set(true);
    const content = this.editPostForm.get('content')!.value as string;
    const type    = this.selectedEditType();
    const images  = this.editImages();

    this.postService.updatePost(post.id, { content, type }, images.length > 0 ? images : undefined).subscribe({
      next: (updated) => {
        this.posts.update((current) => current.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
        this.toast.success('Post updated successfully!');
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
    this.deletePostModalOpen.set(true);
  }

  closeDeletePostModal(): void {
    this.deletePostModalOpen.set(false);
    this.deletePostTarget.set(null);
  }

  confirmDeletePost(): void {
    const post = this.deletePostTarget();
    if (!post) return;

    this.deletingPost.set(true);
    this.postService.deletePost(post.id).subscribe({
      next: () => {
        this.posts.update((current) => current.filter((p) => p.id !== post.id));
        this.toast.success('Post deleted successfully.');
        this.deletingPost.set(false);
        this.closeDeletePostModal();
      },
      error: () => { this.toast.error('Failed to delete post'); this.deletingPost.set(false); },
    });
  }

  // ── Admin Actions ─────────────────────────────────────────

  openDeleteModal():  void { this.deleteModalOpen.set(true); }
  closeDeleteModal(): void { this.deleteModalOpen.set(false); }

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

  onDeleteCommunity(): void {
    this.deletingCommunity.set(true);
    this.communityService.deleteCommunity(this.communityId()).subscribe({
      next: () => {
        this.toast.success('Community deleted successfully');
        this.router.navigate([this.backRoute()]);
      },
      error: () => {
        this.toast.error('Failed to delete community');
        this.deletingCommunity.set(false);
        this.deleteModalOpen.set(false);
      },
    });
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

  getPostTypeBadge(type: PostType): { label: string; class: string; icon: string } {
    switch (type) {
      case 'EMERGENCY': return { label: 'Emergency', class: 'bg-danger',              icon: 'bi-exclamation-triangle-fill' };
      case 'HELP':      return { label: 'Help',      class: 'bg-warning text-dark',   icon: 'bi-life-preserver'            };
      default:          return { label: 'General',   class: 'bg-primary',             icon: 'bi-chat-dots-fill'            };
    }
  }

  getTimeAgo(dateStr: string): string {
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
}
