import { Component, Input, OnInit, OnDestroy, OnChanges, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { StudentConnectService } from '../../../../core/services/student-connect.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ToastService } from '../../../../core/services/toast.service';
import { StudentChatThread, StudentChatMessage } from '../../../../core/models';
import { LanguageService } from '../../../../core/services/language.service';
import { TranslationService } from '../../../../core/services/translation.service';
import { InlineSpinnerComponent } from '../../../../shared/components/inline-spinner/inline-spinner.component';

/**
 * Chat tab (STUDENT_CONNECT_SPEC.md §5.6) — Model B only, never rendered
 * when Contact Sharing is active (the shell only instantiates this
 * component behind `@if (chatEnabled())`). A thread only exists for an
 * accepted connection, same access rule Model A uses for contact reveal.
 */
@Component({
  selector: 'app-student-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, InlineSpinnerComponent],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class StudentChatComponent implements OnInit, OnDestroy, OnChanges {
  private studentConnectService = inject(StudentConnectService);
  private notificationService = inject(NotificationService);
  private toast = inject(ToastService);
  language = inject(LanguageService);
  private translationService = inject(TranslationService);

  /** Set by the shell when arriving via a profile's "Open Chat" button. */
  @Input() openThreadForUserId: string | null = null;

  threads = signal<StudentChatThread[]>([]);
  activeThreadId = signal<string | null>(null);
  messages = signal<StudentChatMessage[]>([]);
  loadingThreads = signal(true);
  loadingMessages = signal(false);
  messageText = signal('');
  sending = signal(false);

  isTranslatingThreads = signal(false);
  private translatedThreadPreviews = signal<Map<string, string>>(new Map());
  isTranslatingMessages = signal(false);
  private translatedMessages = signal<Map<string, string>>(new Map());

  private chatEventSub?: Subscription;

  constructor() {
    effect(() => {
      const version = this.language.languageVersion();
      const isTamil = this.language.isTamil();
      const threads = this.threads();
      if (!isTamil || threads.length === 0) {
        this.translatedThreadPreviews.set(new Map());
        return;
      }
      const fields: Record<string, string> = {};
      for (const t of threads) {
        if (t.lastMessagePreview) fields[t.id] = t.lastMessagePreview;
      }
      if (Object.keys(fields).length === 0) return;

      this.isTranslatingThreads.set(true);
      this.translationService.translateFields(fields, 'ta')
        .pipe(finalize(() => this.isTranslatingThreads.set(false)))
        .subscribe((translated) => {
          if (this.language.languageVersion() !== version) return;
          this.translatedThreadPreviews.set(new Map(Object.entries(translated)));
        });
    });

    effect(() => {
      const version = this.language.languageVersion();
      const isTamil = this.language.isTamil();
      const messages = this.messages();
      if (!isTamil || messages.length === 0) {
        this.translatedMessages.set(new Map());
        return;
      }
      const fields: Record<string, string> = {};
      for (const m of messages) {
        if (m.text) fields[m.id] = m.text;
      }
      if (Object.keys(fields).length === 0) return;

      this.isTranslatingMessages.set(true);
      this.translationService.translateFields(fields, 'ta')
        .pipe(finalize(() => this.isTranslatingMessages.set(false)))
        .subscribe((translated) => {
          if (this.language.languageVersion() !== version) return;
          this.translatedMessages.set(new Map(Object.entries(translated)));
        });
    });
  }

  displayThreadPreview(thread: StudentChatThread): string | undefined {
    return this.translatedThreadPreviews().get(thread.id) ?? thread.lastMessagePreview ?? undefined;
  }

  displayMessageText(message: StudentChatMessage): string {
    return this.translatedMessages().get(message.id) ?? message.text;
  }

  get activeThread(): StudentChatThread | undefined {
    return this.threads().find((t) => t.id === this.activeThreadId());
  }

  ngOnInit(): void {
    this.loadThreads(() => this.maybeOpenRequestedThread());

    this.chatEventSub = this.notificationService.studentChatMessage$.subscribe(() => {
      // A new message arrived somewhere — refresh the thread list (previews
      // + unread counts) and, if it's for the open thread, the messages too.
      this.loadThreads();
      if (this.activeThreadId()) this.loadMessages(this.activeThreadId()!);
    });
  }

  ngOnChanges(): void {
    this.maybeOpenRequestedThread();
  }

  ngOnDestroy(): void {
    this.chatEventSub?.unsubscribe();
  }

  private maybeOpenRequestedThread(): void {
    if (!this.openThreadForUserId) return;
    const thread = this.threads().find((t) => t.otherUserId === this.openThreadForUserId);
    if (thread) this.openThread(thread.id);
  }

  loadThreads(after?: () => void): void {
    this.loadingThreads.set(true);
    this.studentConnectService.listChatThreads().subscribe({
      next: (list) => {
        this.threads.set(list);
        this.loadingThreads.set(false);
        after?.();
      },
      error: () => this.loadingThreads.set(false),
    });
  }

  openThread(threadId: string): void {
    this.activeThreadId.set(threadId);
    this.loadMessages(threadId);
    this.studentConnectService.markThreadRead(threadId).subscribe({ error: () => {} });
  }

  private loadMessages(threadId: string): void {
    this.loadingMessages.set(true);
    this.studentConnectService.listChatMessages(threadId).subscribe({
      next: (list) => { this.messages.set(list); this.loadingMessages.set(false); },
      error: () => this.loadingMessages.set(false),
    });
  }

  send(): void {
    const threadId = this.activeThreadId();
    const text = this.messageText().trim();
    if (!threadId || !text || this.sending()) return;

    this.sending.set(true);
    this.studentConnectService.sendChatMessage(threadId, text).subscribe({
      next: (msg) => {
        this.messages.update((list) => [...list, msg]);
        this.messageText.set('');
        this.sending.set(false);
        this.loadThreads();
      },
      error: () => { this.sending.set(false); this.toast.error('user.studentConnect.chat.sendFailed'); },
    });
  }
}
