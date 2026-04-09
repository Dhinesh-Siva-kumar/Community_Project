import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { PostService } from '../../../core/services/post.service';
import { ToastService } from '../../../core/services/toast.service';
import { Post, PaginatedResponse } from '../../../core/models';

@Component({
  selector: 'app-post-approval',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './post-approval.component.html',
  styleUrls: ['./post-approval.component.scss'],
})
export class PostApprovalComponent implements OnInit {
  private postService = inject(PostService);
  private toast = inject(ToastService);

  // Data
  pendingPosts = signal<Post[]>([]);
  loading = signal(true);

  // Actions
  approvingId = signal<string | null>(null);
  rejectingId = signal<string | null>(null);
  bulkProcessing = signal(false);

  // Selection
  selectedIds = signal<Set<string>>(new Set());
  selectAll = signal(false);

  // Filters
  filterCommunity = signal('');
  filterType = signal('');

  // Computed
  pendingCount = computed(() => this.pendingPosts().length);

  filteredPosts = computed(() => {
    let posts = this.pendingPosts();
    const community = this.filterCommunity();
    const type = this.filterType();

    if (community) {
      posts = posts.filter((p) => p.community?.name?.toLowerCase().includes(community.toLowerCase()));
    }
    if (type) {
      posts = posts.filter((p) => p.type === type);
    }
    return posts;
  });

  selectedCount = computed(() => this.selectedIds().size);

  ngOnInit(): void {
    this.loadPendingPosts();
  }

  loadPendingPosts(): void {
    this.loading.set(true);
    this.postService.getPendingPosts().subscribe({
      next: (response: PaginatedResponse<Post>) => {
        this.pendingPosts.set(response.data);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load pending posts');
        this.loading.set(false);
      },
    });
  }

  // Selection
  toggleSelectAll(): void {
    const allSelected = this.selectAll();
    if (allSelected) {
      this.selectedIds.set(new Set());
      this.selectAll.set(false);
    } else {
      const allIds = new Set(this.filteredPosts().map((p) => p.id));
      this.selectedIds.set(allIds);
      this.selectAll.set(true);
    }
  }

  toggleSelect(postId: string): void {
    this.selectedIds.update((ids) => {
      const newIds = new Set(ids);
      if (newIds.has(postId)) {
        newIds.delete(postId);
      } else {
        newIds.add(postId);
      }
      return newIds;
    });
    // Update selectAll state
    this.selectAll.set(this.selectedIds().size === this.filteredPosts().length);
  }

  isSelected(postId: string): boolean {
    return this.selectedIds().has(postId);
  }

  // Approve / Reject single
  approvePost(id: string): void {
    this.approvingId.set(id);
    this.postService.approvePost(id).subscribe({
      next: () => {
        this.pendingPosts.update((posts) => posts.filter((p) => p.id !== id));
        this.selectedIds.update((ids) => {
          const newIds = new Set(ids);
          newIds.delete(id);
          return newIds;
        });
        this.toast.success('Post approved');
        this.approvingId.set(null);
      },
      error: () => {
        this.toast.error('Failed to approve post');
        this.approvingId.set(null);
      },
    });
  }

  rejectPost(id: string): void {
    this.rejectingId.set(id);
    this.postService.rejectPost(id).subscribe({
      next: () => {
        this.pendingPosts.update((posts) => posts.filter((p) => p.id !== id));
        this.selectedIds.update((ids) => {
          const newIds = new Set(ids);
          newIds.delete(id);
          return newIds;
        });
        this.toast.success('Post rejected');
        this.rejectingId.set(null);
      },
      error: () => {
        this.toast.error('Failed to reject post');
        this.rejectingId.set(null);
      },
    });
  }

  // Bulk actions
  approveSelected(): void {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    this.bulkProcessing.set(true);
    let completed = 0;

    ids.forEach((id) => {
      this.postService.approvePost(id).subscribe({
        next: () => {
          this.pendingPosts.update((posts) => posts.filter((p) => p.id !== id));
          completed++;
          if (completed === ids.length) {
            this.selectedIds.set(new Set());
            this.selectAll.set(false);
            this.toast.success(`${ids.length} posts approved`);
            this.bulkProcessing.set(false);
          }
        },
        error: () => {
          completed++;
          if (completed === ids.length) {
            this.bulkProcessing.set(false);
          }
        },
      });
    });
  }

  rejectSelected(): void {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    this.bulkProcessing.set(true);
    let completed = 0;

    ids.forEach((id) => {
      this.postService.rejectPost(id).subscribe({
        next: () => {
          this.pendingPosts.update((posts) => posts.filter((p) => p.id !== id));
          completed++;
          if (completed === ids.length) {
            this.selectedIds.set(new Set());
            this.selectAll.set(false);
            this.toast.success(`${ids.length} posts rejected`);
            this.bulkProcessing.set(false);
          }
        },
        error: () => {
          completed++;
          if (completed === ids.length) {
            this.bulkProcessing.set(false);
          }
        },
      });
    });
  }

  // Filters
  onFilterCommunity(event: Event): void {
    this.filterCommunity.set((event.target as HTMLInputElement).value);
  }

  onFilterType(event: Event): void {
    this.filterType.set((event.target as HTMLSelectElement).value);
  }

  // Helpers
  getPostTypeBadge(type: string): { label: string; class: string } {
    switch (type) {
      case 'EMERGENCY':
        return { label: 'Emergency', class: 'bg-danger' };
      case 'HELP':
        return { label: 'Help', class: 'bg-warning text-dark' };
      default:
        return { label: 'General', class: 'bg-primary' };
    }
  }
}
