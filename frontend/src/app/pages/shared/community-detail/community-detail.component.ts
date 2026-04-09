import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommunityService } from '../../../core/services/community.service';
import { PostService } from '../../../core/services/post.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Community, CommunityMember, Post, Comment, PostType } from '../../../core/models';
import { AnimateOnScrollDirective } from '../../../shared/directives/animate-on-scroll.directive';
import { CommunityActivityComponent } from '../../../shared/components/svg-illustrations/community-activity.component';

type TabType = 'posts' | 'help' | 'emergency' | 'about';

@Component({
  selector: 'app-community-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, AnimateOnScrollDirective, CommunityActivityComponent],
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
  postImagePreviews = signal<string[]>([]);
  selectedPostType = signal<PostType>('GENERAL');

  // Post interactions
  expandedComments = signal<Set<string>>(new Set());
  loadingComments = signal<Set<string>>(new Set());
  postComments = signal<Map<string, Comment[]>>(new Map());
  submittingComment = signal<string | null>(null);
  likingPost = signal<string | null>(null);

  // Pagination
  currentPage = signal(1);
  totalPages = signal(1);
  loadingMore = signal(false);

  // Forms
  postForm!: FormGroup;
  commentForms: Map<string, FormGroup> = new Map();

  // Computed
  currentUser = computed(() => this.authService.currentUser());
  currentUserId = computed(() => this.currentUser()?.id ?? '');

  isAdmin = computed(() => {
    return this.router.url.startsWith('/admin');
  });

  backRoute = computed(() => {
    return this.isAdmin() ? '/admin/community' : '/user/community';
  });

  filteredPosts = computed(() => {
    const tab = this.activeTab();
    const allPosts = this.posts();
    switch (tab) {
      case 'help':
        return allPosts.filter((p) => p.type === 'HELP');
      case 'emergency':
        return allPosts.filter((p) => p.type === 'EMERGENCY');
      default:
        return allPosts;
    }
  });

  memberCount = computed(() => this.community()?._count?.members ?? 0);
  postCount = computed(() => this.community()?._count?.posts ?? 0);

  ngOnInit(): void {
    this.initForms();
    this.route.params.subscribe((params) => {
      const id = params['id'];
      if (id) {
        this.communityId.set(id);
        this.loadCommunity();
        this.loadPosts();
        this.loadMembers();
      }
    });
  }

  initForms(): void {
    this.postForm = this.fb.group({
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

  // ========================
  // Data Loading
  // ========================

  loadCommunity(): void {
    this.loading.set(true);
    this.communityService.getCommunity(this.communityId()).subscribe({
      next: (community) => {
        this.community.set(community);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load community');
        this.loading.set(false);
      },
    });
  }

  loadPosts(append = false): void {
    if (!append) {
      this.loadingPosts.set(true);
    } else {
      this.loadingMore.set(true);
    }

    const params: Record<string, any> = {
      page: this.currentPage(),
      limit: 10,
      status: 'APPROVED',
    };

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

  loadMembers(): void {
    this.communityService.getMembers(this.communityId()).subscribe({
      next: (members) => {
        this.members.set(members);
      },
      error: () => {},
    });
  }

  loadMore(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((p) => p + 1);
      this.loadPosts(true);
    }
  }

  // ========================
  // Tab Navigation
  // ========================

  setTab(tab: TabType): void {
    if (this.activeTab() === tab) return;
    this.tabTransition.set(true);
    setTimeout(() => {
      this.activeTab.set(tab);
      // Reset post type for creation based on tab
      switch (tab) {
        case 'help':
          this.selectedPostType.set('HELP');
          break;
        case 'emergency':
          this.selectedPostType.set('EMERGENCY');
          break;
        default:
          this.selectedPostType.set('GENERAL');
          break;
      }
      this.tabTransition.set(false);
    }, 150);
  }

  // ========================
  // Post Creation
  // ========================

  setPostType(type: PostType): void {
    this.selectedPostType.set(type);
  }

  onPostImageSelect(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (files) {
      const newFiles = Array.from(files);
      this.selectedPostImages.update((current) => [...current, ...newFiles]);

      newFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          this.postImagePreviews.update((current) => [...current, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  }

  removePostImage(index: number): void {
    this.selectedPostImages.update((current) => current.filter((_, i) => i !== index));
    this.postImagePreviews.update((current) => current.filter((_, i) => i !== index));
  }

  submitPost(): void {
    if (this.postForm.invalid) {
      this.postForm.markAllAsTouched();
      return;
    }

    this.submittingPost.set(true);
    const content = this.postForm.get('content')!.value;
    const type = this.selectedPostType();
    const images = this.selectedPostImages();

    this.postService.createPost(this.communityId(), { content, type }, images.length > 0 ? images : undefined).subscribe({
      next: (post) => {
        this.toast.success('Post submitted successfully! It will appear after approval.');
        this.postForm.reset();
        this.selectedPostImages.set([]);
        this.postImagePreviews.set([]);
        this.submittingPost.set(false);
        // If admin, the post might be auto-approved
        if (this.isAdmin() && post.status === 'APPROVED') {
          this.posts.update((current) => [post, ...current]);
        }
      },
      error: () => {
        this.toast.error('Failed to create post');
        this.submittingPost.set(false);
      },
    });
  }

  // ========================
  // Post Interactions
  // ========================

  toggleLike(post: Post): void {
    this.likingPost.set(post.id);

    if (post.isLiked) {
      this.postService.unlikePost(post.id).subscribe({
        next: () => {
          this.posts.update((posts) =>
            posts.map((p) =>
              p.id === post.id
                ? {
                    ...p,
                    isLiked: false,
                    _count: { ...p._count!, likes: Math.max(0, (p._count?.likes ?? 0) - 1), comments: p._count?.comments ?? 0 },
                  }
                : p
            )
          );
          this.likingPost.set(null);
        },
        error: () => {
          this.toast.error('Failed to unlike post');
          this.likingPost.set(null);
        },
      });
    } else {
      this.postService.likePost(post.id).subscribe({
        next: () => {
          this.posts.update((posts) =>
            posts.map((p) =>
              p.id === post.id
                ? {
                    ...p,
                    isLiked: true,
                    _count: { ...p._count!, likes: (p._count?.likes ?? 0) + 1, comments: p._count?.comments ?? 0 },
                  }
                : p
            )
          );
          this.likingPost.set(null);
        },
        error: () => {
          this.toast.error('Failed to like post');
          this.likingPost.set(null);
        },
      });
    }
  }

  toggleComments(postId: string): void {
    this.expandedComments.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
        // Load comments if not already loaded
        if (!this.postComments().has(postId)) {
          this.loadComments(postId);
        }
      }
      return newSet;
    });
  }

  isCommentsExpanded(postId: string): boolean {
    return this.expandedComments().has(postId);
  }

  loadComments(postId: string): void {
    this.loadingComments.update((set) => {
      const newSet = new Set(set);
      newSet.add(postId);
      return newSet;
    });

    this.postService.getComments(postId).subscribe({
      next: (comments) => {
        this.postComments.update((map) => {
          const newMap = new Map(map);
          newMap.set(postId, comments);
          return newMap;
        });
        this.loadingComments.update((set) => {
          const newSet = new Set(set);
          newSet.delete(postId);
          return newSet;
        });
      },
      error: () => {
        this.loadingComments.update((set) => {
          const newSet = new Set(set);
          newSet.delete(postId);
          return newSet;
        });
      },
    });
  }

  getComments(postId: string): Comment[] {
    return this.postComments().get(postId) ?? [];
  }

  isLoadingComments(postId: string): boolean {
    return this.loadingComments().has(postId);
  }

  submitComment(postId: string): void {
    const form = this.getCommentForm(postId);
    if (form.invalid) return;

    this.submittingComment.set(postId);
    const content = form.get('content')!.value;

    this.postService.addComment(postId, content).subscribe({
      next: (comment) => {
        this.postComments.update((map) => {
          const newMap = new Map(map);
          const existing = newMap.get(postId) ?? [];
          newMap.set(postId, [...existing, comment]);
          return newMap;
        });
        // Update comment count
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
      error: () => {
        this.toast.error('Failed to add comment');
        this.submittingComment.set(null);
      },
    });
  }

  sharePost(post: Post): void {
    const url = `${window.location.origin}${this.isAdmin() ? '/admin' : '/user'}/community/${this.communityId()}`;
    navigator.clipboard.writeText(url).then(() => {
      this.toast.success('Link copied to clipboard!');
    }).catch(() => {
      this.toast.error('Failed to copy link');
    });
  }

  // ========================
  // Utility
  // ========================

  getPostTypeBadge(type: PostType): { label: string; class: string; icon: string } {
    switch (type) {
      case 'EMERGENCY':
        return { label: 'Emergency', class: 'bg-danger', icon: 'bi-exclamation-triangle-fill' };
      case 'HELP':
        return { label: 'Help', class: 'bg-warning text-dark', icon: 'bi-hand-thumbs-up-fill' };
      default:
        return { label: 'General', class: 'bg-primary', icon: 'bi-chat-dots-fill' };
    }
  }

  getTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getUserInitials(user?: { displayName?: string; userName?: string } | null): string {
    if (!user) return '?';
    const name = user.displayName || user.userName || '';
    return name.charAt(0).toUpperCase() || '?';
  }

  getUserFullName(user?: { displayName?: string; userName?: string } | null): string {
    if (!user) return 'Unknown User';
    return user.displayName || user.userName || 'Unknown User';
  }
}
