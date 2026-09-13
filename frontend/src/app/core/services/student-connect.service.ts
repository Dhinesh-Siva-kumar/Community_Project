import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import {
  StudentConnectConfig,
  StudentProfile,
  StudentDirectoryEntry,
  StudentPublicProfile,
  StudentConnectionRequest,
  StudentConnection,
  StudentReport,
  StudentReportReason,
  StudentChatThread,
  StudentChatMessage,
  PaginatedResponse,
  StudyLevel,
  MentoringType,
} from '../models';

export interface RegisterStudentProfilePayload {
  firstName: string;
  photoUrl?: string;
  countryId: number;
  regionId?: number;
  cityId?: number;
  cityFreeText?: string;
  universityId?: number;
  universityFreeText?: string;
  course: string;
  studyLevel: StudyLevel;
  yearOfStudy: string;
  languages: string[];
  shortIntro: string;
  previousCountryId?: number;
  academicBackground?: string;
  areasOfHelp?: string[];
}

export interface UpdateStudentProfilePayload extends Partial<RegisterStudentProfilePayload> {
  mentorAvailable?: boolean;
  mentoringType?: MentoringType;
}

export interface SearchStudentsQueryParams {
  q?: string;
  countryId?: number;
  studyLevel?: StudyLevel;
  language?: string;
  verifiedOnly?: boolean;
  mentorOnly?: boolean;
  freeOnly?: boolean;
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class StudentConnectService {
  private api = inject(ApiService);

  /** Which concept (Contact Sharing vs In-App Chat, see STUDENT_CONNECT_SPEC.md
   * §2) the backend currently has active — fetched once and read via the
   * computed signals below everywhere the UI needs to branch. */
  private config = signal<StudentConnectConfig | null>(null);
  chatEnabled = computed(() => this.config()?.chatEnabled ?? false);
  paidMentoringSelectable = computed(() => this.config()?.paidMentoringSelectable ?? false);

  loadConfig(): Observable<StudentConnectConfig> {
    return this.api.get<StudentConnectConfig>('/student-connect/config').pipe(
      tap((c) => this.config.set(c)),
    );
  }

  // ── Profile ──
  getMyProfile(): Observable<StudentProfile> {
    return this.api.get<StudentProfile>('/student-connect/me');
  }

  registerProfile(data: RegisterStudentProfilePayload): Observable<StudentProfile> {
    return this.api.post<StudentProfile>('/student-connect/register', data);
  }

  updateMyProfile(data: UpdateStudentProfilePayload): Observable<StudentProfile> {
    return this.api.patch<StudentProfile>('/student-connect/me', data);
  }

  // ── Discover ──
  search(query: SearchStudentsQueryParams = {}): Observable<PaginatedResponse<StudentDirectoryEntry>> {
    return this.api.get<PaginatedResponse<StudentDirectoryEntry>>('/student-connect/search', query);
  }

  getProfile(userId: string): Observable<StudentPublicProfile> {
    return this.api.get<StudentPublicProfile>(`/student-connect/profile/${userId}`);
  }

  // ── Connections ──
  createConnectionRequest(toUserId: string, message: string): Observable<StudentConnectionRequest> {
    return this.api.post<StudentConnectionRequest>('/student-connect/connections/requests', { toUserId, message });
  }

  listConnectionRequests(): Observable<{ received: StudentConnectionRequest[]; sent: StudentConnectionRequest[] }> {
    return this.api.get<{ received: StudentConnectionRequest[]; sent: StudentConnectionRequest[] }>('/student-connect/connections/requests');
  }

  acceptConnectionRequest(id: string): Observable<StudentConnection> {
    return this.api.post<StudentConnection>(`/student-connect/connections/requests/${id}/accept`);
  }

  declineConnectionRequest(id: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/student-connect/connections/requests/${id}/decline`);
  }

  listConnections(): Observable<StudentConnection[]> {
    return this.api.get<StudentConnection[]>('/student-connect/connections');
  }

  // ── Saved ──
  toggleSaved(userId: string): Observable<{ saved: boolean }> {
    return this.api.post<{ saved: boolean }>(`/student-connect/saved/${userId}`);
  }

  listSaved(): Observable<StudentDirectoryEntry[]> {
    return this.api.get<StudentDirectoryEntry[]>('/student-connect/saved');
  }

  // ── Report / Block ──
  createReport(targetUserId: string, reason: StudentReportReason, messageId?: string): Observable<StudentReport> {
    return this.api.post<StudentReport>('/student-connect/reports', { targetUserId, reason, messageId });
  }

  blockUser(userId: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/student-connect/block/${userId}`);
  }

  // ── Chat (Model B only — 404s under Contact Sharing) ──
  listChatThreads(): Observable<StudentChatThread[]> {
    return this.api.get<StudentChatThread[]>('/student-connect/chat/threads');
  }

  listChatMessages(threadId: string, before?: string, limit = 30): Observable<StudentChatMessage[]> {
    return this.api.get<StudentChatMessage[]>(`/student-connect/chat/threads/${threadId}/messages`, { before, limit });
  }

  sendChatMessage(threadId: string, text: string): Observable<StudentChatMessage> {
    return this.api.post<StudentChatMessage>(`/student-connect/chat/threads/${threadId}/messages`, { text });
  }

  markThreadRead(threadId: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/student-connect/chat/threads/${threadId}/read`);
  }

  // ── Admin ──
  listVerificationQueue(page = 1, limit = 20): Observable<PaginatedResponse<StudentProfile & { displayName: string; avatar: string | null; universityName: string | null }>> {
    return this.api.get<PaginatedResponse<StudentProfile & { displayName: string; avatar: string | null; universityName: string | null }>>(
      '/student-connect/verification-queue', { page, limit },
    );
  }

  getVerificationQueueCount(): Observable<{ count: number }> {
    return this.api.get<{ count: number }>('/student-connect/verification-queue-count');
  }

  approveVerification(userId: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/student-connect/verification-queue/${userId}/approve`);
  }

  rejectVerification(userId: string, reason: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/student-connect/verification-queue/${userId}/reject`, { reason });
  }

  getThreadForModeration(threadId: string): Observable<StudentChatMessage[]> {
    return this.api.get<StudentChatMessage[]>(`/student-connect/chat-threads/${threadId}/messages/moderation`);
  }
}
