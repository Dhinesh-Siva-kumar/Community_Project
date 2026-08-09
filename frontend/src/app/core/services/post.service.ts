import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { Post, Comment, PaginatedResponse, PostType, PostStatus } from '../models';
import { FORM_DATA_FIELD_NAMES } from '../constants/upload.constants';

export interface PendingPostsQueryParams {
  page?:     number;
  limit?:    number;
  search?:   string;
  country?:  string;
  type?:     PostType;
  dateFrom?: string;
  dateTo?:   string;
  sortBy?:   'joined' | 'community';
  sortDir?:  'asc' | 'desc';
  authorStatus?: 'trusted' | 'untrusted';
}

@Injectable({ providedIn: 'root' })
export class PostService {
  private api = inject(ApiService);

  getPosts(communityId?: string, params?: Record<string, any>): Observable<PaginatedResponse<Post>> {
    return this.api.get<PaginatedResponse<Post>>('/posts', { communityId, ...params });
  }

   createPost(communityId: string, data: { content: string; type: PostType }, images?: File[]): Observable<Post> {
     const body = { ...data, communityId };
     if (images && images.length > 0) {
       const files = images.map((file, index) => ({ field: FORM_DATA_FIELD_NAMES.IMAGES, file }));
       return this.api.postWithFile<Post>('/posts', body, files);
     }
     return this.api.post<Post>('/posts', body);
   }

   updatePost(id: string, data: { content?: string; type?: PostType; images?: string[] }, images?: File[]): Observable<Post> {
     if (images && images.length > 0) {
       const files = images.map((file) => ({ field: FORM_DATA_FIELD_NAMES.IMAGES, file }));
       return this.api.putWithFile<Post>(`/posts/${id}`, data, files);
     }
     return this.api.put<Post>(`/posts/${id}`, data);
   }

  deletePost(id: string): Observable<void> {
    return this.api.delete<void>(`/posts/${id}`);
  }

  approvePost(id: string): Observable<Post> {
    return this.api.put<Post>(`/posts/${id}/approve`);
  }

  rejectPost(id: string, reason?: string): Observable<Post> {
    return this.api.put<Post>(`/posts/${id}/reject`, reason ? { reason } : {});
  }

  getPendingPosts(params?: PendingPostsQueryParams): Observable<PaginatedResponse<Post>> {
    const clean: Record<string, any> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') clean[k] = v;
      });
    }
    return this.api.get<PaginatedResponse<Post>>('/posts/pending', clean);
  }

  getPendingCount(): Observable<{ count: number }> {
    return this.api.get<{ count: number }>('/posts/pending-count');
  }

  getMyPosts(params?: { page?: number; limit?: number; status?: PostStatus; communityId?: string }): Observable<PaginatedResponse<Post>> {
    const clean: Record<string, any> = {};
    if (params) {
      Object.entries(params as Record<string, any>).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') clean[k] = v;
      });
    }
    return this.api.get<PaginatedResponse<Post>>('/posts/mine', clean);
  }

  getPost(id: string): Observable<Post> {
    return this.api.get<Post>(`/posts/${id}`);
  }

  likePost(postId: string): Observable<void> {
    return this.api.post<void>(`/posts/${postId}/like`);
  }

  unlikePost(postId: string): Observable<void> {
    return this.api.delete<void>(`/posts/${postId}/like`);
  }

  savePost(postId: string): Observable<void> {
    return this.api.post<void>(`/posts/${postId}/save`);
  }

  unsavePost(postId: string): Observable<void> {
    return this.api.delete<void>(`/posts/${postId}/save`);
  }

  getComments(postId: string): Observable<Comment[]> {
    return this.api.get<any>(`/posts/${postId}/comments`).pipe(
      map((res: any) => Array.isArray(res) ? res : (res.data ?? []))
    );
  }

  addComment(postId: string, content: string): Observable<Comment> {
    return this.api.post<Comment>(`/posts/${postId}/comments`, { content });
  }

  deleteComment(commentId: string): Observable<void> {
    return this.api.delete<void>(`/posts/comments/${commentId}`);
  }

  reportPost(postId: string, reason?: string): Observable<void> {
    return this.api.post<void>('/reports', { targetType: 'POST', targetId: postId, reason });
  }
}
