import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Post, Comment, PaginatedResponse, PostType } from '../models';

@Injectable({ providedIn: 'root' })
export class PostService {
  private api = inject(ApiService);

  getPosts(communityId: string, params?: Record<string, any>): Observable<PaginatedResponse<Post>> {
    return this.api.get<PaginatedResponse<Post>>('/posts', { communityId, ...params });
  }

  createPost(communityId: string, data: { content: string; type: PostType }, images?: File[]): Observable<Post> {
    const body = { ...data, communityId };
    if (images && images.length > 0) {
      const files = images.map((file, index) => ({ field: 'images', file }));
      return this.api.postWithFile<Post>('/posts', body, files);
    }
    return this.api.post<Post>('/posts', body);
  }

  updatePost(id: string, data: Partial<Post>): Observable<Post> {
    return this.api.put<Post>(`/posts/${id}`, data);
  }

  deletePost(id: string): Observable<void> {
    return this.api.delete<void>(`/posts/${id}`);
  }

  approvePost(id: string): Observable<Post> {
    return this.api.put<Post>(`/posts/${id}/approve`);
  }

  rejectPost(id: string): Observable<Post> {
    return this.api.put<Post>(`/posts/${id}/reject`);
  }

  getPendingPosts(): Observable<PaginatedResponse<Post>> {
    return this.api.get<PaginatedResponse<Post>>('/posts/pending');
  }

  likePost(postId: string): Observable<void> {
    return this.api.post<void>(`/posts/${postId}/like`);
  }

  unlikePost(postId: string): Observable<void> {
    return this.api.delete<void>(`/posts/${postId}/like`);
  }

  getComments(postId: string): Observable<Comment[]> {
    return this.api.get<Comment[]>(`/posts/${postId}/comments`);
  }

  addComment(postId: string, content: string): Observable<Comment> {
    return this.api.post<Comment>(`/posts/${postId}/comments`, { content });
  }

  deleteComment(commentId: string): Observable<void> {
    return this.api.delete<void>(`/posts/comments/${commentId}`);
  }
}
