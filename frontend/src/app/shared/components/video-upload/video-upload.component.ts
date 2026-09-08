import {
  Component,
  inject,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  signal,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ToastService } from '../../../core/services/toast.service';
import { VIDEO_CONFIG } from '../../../core/constants/upload.constants';

/**
 * Single-video picker for community posts.
 *
 * Deliberately separate from FileUploadComponent: that one renders every
 * preview as an <img>, routes each accepted file through the canvas image
 * compressor, and is shared by 17 image call sites. Video needs the opposite
 * of all three, so it mirrors that component's conventions (translatable
 * error signal, inline message plus toast, resetCounter) rather than
 * threading a second media type through it.
 *
 * Both limits are hard refusals — unlike an oversized image, an over-long or
 * oversized video cannot be shrunk in the browser.
 */
@Component({
  selector: 'app-video-upload',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './video-upload.component.html',
  styleUrls: ['./video-upload.component.scss'],
})
export class VideoUploadComponent implements OnChanges, OnDestroy {
  private toast = inject(ToastService);

  @Input() maxSizeMb = VIDEO_CONFIG.MAX_FILE_SIZE_MB;
  @Input() maxDurationSeconds = VIDEO_CONFIG.MAX_DURATION_SECONDS;
  @Input() label = 'components.videoUpload.addVideo';
  /** Bump to clear the selection from the parent (e.g. after a post is sent). */
  @Input() resetCounter = 0;
  /** Already-stored video URL when editing an existing post. */
  @Input() existingPreview: string | null = null;

  @Output() videoChange = new EventEmitter<File | null>();
  /** Fires when the user clears an already-stored video while editing. */
  @Output() existingRemoved = new EventEmitter<void>();

  @ViewChild('videoInput') videoInputRef!: ElementRef<HTMLInputElement>;

  readonly file = signal<File | null>(null);
  /** Object URL for the chosen file — never a data URL; see revokePreview(). */
  readonly previewUrl = signal<string | null>(null);
  readonly isDragging = signal(false);
  readonly isChecking = signal(false);

  /**
   * Holds the key plus its params rather than resolved text, so a visible
   * error follows a language switch instead of freezing in the language that
   * was active when it failed.
   */
  readonly error = signal<{ key: string; params?: Record<string, unknown> } | null>(null);

  get accept(): string {
    return VIDEO_CONFIG.SUPPORTED_FORMATS.join(',');
  }

  get maxDurationMinutes(): number {
    return Math.round(this.maxDurationSeconds / 60);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const rc = changes['resetCounter'];
    if (rc && !rc.firstChange) this.clear();
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  triggerInput(): void {
    if (this.isChecking()) return;
    this.videoInputRef?.nativeElement.click();
  }

  onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (picked) void this.processFile(picked);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    if (this.isChecking()) return;
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) void this.processFile(dropped);
  }

  /** Clears a newly picked file, or an existing stored one when editing. */
  clear(): void {
    this.revokePreview();
    this.file.set(null);
    this.error.set(null);
    this.videoChange.emit(null);
  }

  removeExisting(): void {
    this.clear();
    this.existingRemoved.emit();
  }

  // ── Private ──────────────────────────────────────────────────────

  private async processFile(file: File): Promise<void> {
    this.error.set(null);

    // Widened because SUPPORTED_FORMATS is a readonly literal tuple — same
    // idiom as ALLOWED_UPLOAD_FOLDERS in the backend upload-storage service.
    if (!(VIDEO_CONFIG.SUPPORTED_FORMATS as readonly string[]).includes(file.type)) {
      this.announce('components.videoUpload.typeNotAllowed', { name: file.name });
      return;
    }

    if (file.size > this.maxSizeMb * 1024 * 1024) {
      this.announce('components.videoUpload.tooLarge', { size: this.maxSizeMb });
      return;
    }

    this.isChecking.set(true);
    let duration: number;
    try {
      duration = await this.readDuration(file);
    } catch {
      // Unreadable metadata means a corrupt container or a codec this
      // browser cannot decode — either way it would not play back for
      // viewers, so refuse it rather than uploading it blind.
      this.announce('components.videoUpload.unreadable', { name: file.name });
      return;
    } finally {
      this.isChecking.set(false);
    }

    if (duration > this.maxDurationSeconds) {
      this.announce('components.videoUpload.tooLong', {
        minutes: this.maxDurationMinutes,
        actual: this.formatDuration(duration),
      });
      return;
    }

    this.revokePreview();
    this.file.set(file);
    this.previewUrl.set(URL.createObjectURL(file));
    this.videoChange.emit(file);
  }

  /**
   * Reads duration by letting the browser parse the container. The object URL
   * is revoked in a finally so a rejected 100MB file is not pinned in memory.
   */
  private readDuration(file: File): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const probe = document.createElement('video');
      probe.preload = 'metadata';

      const done = (fn: () => void) => {
        probe.onloadedmetadata = null;
        probe.onerror = null;
        URL.revokeObjectURL(url);
        fn();
      };

      probe.onloadedmetadata = () => {
        const value = probe.duration;
        // A stream with unknown length reports Infinity or NaN.
        done(() =>
          Number.isFinite(value) && value > 0 ? resolve(value) : reject(new Error('Unknown duration')),
        );
      };
      probe.onerror = () => done(() => reject(new Error('Metadata unreadable')));

      probe.src = url;
    });
  }

  /**
   * Inline message AND toast: this sits inside a post composer that can be
   * scrolled well out of view, where an inline-only error reads as the file
   * having silently vanished.
   */
  private announce(key: string, params: Record<string, unknown>): void {
    this.error.set({ key, params });
    this.toast.error(key, params);
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
  }

  private formatDuration(seconds: number): string {
    const whole = Math.round(seconds);
    const mins = Math.floor(whole / 60);
    const secs = whole % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }
}
