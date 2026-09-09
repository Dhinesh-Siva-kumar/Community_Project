import {
  Component,
  inject,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  signal,
  computed,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageUrlPipe } from '../../pipes/image-url.pipe';
import { TranslatePipe } from '@ngx-translate/core';
import { ImageCompressionService } from '../../../core/services/image-compression.service';
import { UPLOAD_CONFIG } from '../../../core/constants/upload.constants';
import { ToastService } from '../../../core/services/toast.service';

export type UploadMode = 'single' | 'multi';
export type UploadVariant = 'default' | 'avatar';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule, ImageUrlPipe, TranslatePipe],
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss'],
})
export class FileUploadComponent implements OnChanges {
  private compression = inject(ImageCompressionService);
  private toast = inject(ToastService);
  @Input() mode: UploadMode = 'single';
  @Input() variant: UploadVariant = 'default';
  @Input() accept = 'image/*';
  /** Hard refusal threshold. Files under it are compressed, never rejected. */
  @Input() maxSizeMb = UPLOAD_CONFIG.MAX_FILE_SIZE_MB;
  @Input() maxFiles = UPLOAD_CONFIG.MAX_IMAGES;
  @Input() label = 'components.fileUpload.dragOrBrowse';

  // Plain @Input() fields aren't tracked by computed() — a parent that
  // populates these asynchronously (e.g. fetching the record being edited
  // after this component has already rendered once) would silently keep
  // showing the stale first-render value forever, since computed() only
  // recomputes when a SIGNAL dependency changes, not a plain property
  // mutation. Backing them with signals makes displayPreview/allPreviews
  // properly reactive to late-arriving values.
  private existingPreviewSig  = signal<string | null | undefined>(null);
  private existingPreviewsSig = signal<string[] | undefined>(undefined);

  @Input()
  set existingPreview(value: string | null | undefined) { this.existingPreviewSig.set(value); }
  get existingPreview(): string | null | undefined { return this.existingPreviewSig(); }

  @Input()
  set existingPreviews(value: string[] | undefined) { this.existingPreviewsSig.set(value); }
  get existingPreviews(): string[] | undefined { return this.existingPreviewsSig(); }

  @Input() showError = false;
  @Input() errorMessage = 'components.fileUpload.required';
  @Input() resetCounter = 0;

  @Output() filesChange   = new EventEmitter<File[]>();
  @Output() previewsChange = new EventEmitter<string[]>();

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  readonly files      = signal<File[]>([]);
  readonly previews   = signal<string[]>([]);
  readonly isDragging = signal(false);
  /**
   * True while images are being resized on the main thread. Shrinking a
   * 20MB photo takes a visible moment, so the zone shows a spinner and
   * stops accepting input rather than appearing frozen.
   */
  readonly isCompressing = signal(false);
  /**
   * Holds the *key* plus its interpolation params rather than resolved text.
   * A resolved string would freeze in whichever language was active when the
   * validation failed; letting the template's `| translate` do the work means
   * a visible error follows a language switch.
   */
  readonly error = signal<{ key: string; params?: Record<string, unknown> } | null>(null);

  /** New data-URL preview takes priority; falls back to existingPreview from parent. */
  readonly displayPreview = computed<string | null>(() =>
    this.previews()[0] ?? this.existingPreviewSig() ?? null,
  );

  /** For multi-mode: combine newly uploaded and existing previews */
  readonly allPreviews = computed<string[]>(() => {
    const newPreviews = this.previews();
    const existingPreviews = this.existingPreviewsSig() ?? [];
    return [...newPreviews, ...existingPreviews];
  });

  ngOnChanges(changes: SimpleChanges): void {
    const ep = changes['existingPreview'];
    // When parent resets existingPreview to null (e.g. modal closed), clear internal state
    if (ep && !ep.currentValue && !ep.firstChange) {
      this.files.set([]);
      this.previews.set([]);
      this.error.set(null);
    }
    const rc = changes['resetCounter'];
    if (rc && !rc.firstChange) {
      this.files.set([]);
      this.previews.set([]);
      this.error.set(null);
    }
  }

  triggerInput(): void {
    // Ignore input while a previous batch is still being resized —
    // re-entering processFiles would clear isCompressing early.
    if (this.isCompressing()) return;
    this.fileInputRef?.nativeElement.click();
  }

  onZoneClick(): void {
    this.triggerInput();
  }

  onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    void this.processFiles(Array.from(input.files));
    input.value = ''; // allow re-selecting the same file
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
    if (this.isCompressing()) return;
    const dropped = event.dataTransfer?.files;
    if (dropped?.length) void this.processFiles(Array.from(dropped));
  }

  removeFile(index: number): void {
    this.files.update(arr => arr.filter((_, i) => i !== index));
    this.previews.update(arr => arr.filter((_, i) => i !== index));
    this.emit();
  }

  // ── Private ──────────────────────────────────────────────────────

  private async processFiles(incoming: File[]): Promise<void> {
    this.error.set(null);
    const maxBytes = this.maxSizeMb * 1024 * 1024;
    const targetBytes = UPLOAD_CONFIG.COMPRESS_TARGET_MB * 1024 * 1024;
    const valid: File[] = [];
    // Collected rather than reported inline: a per-file set() would leave
    // only the LAST rejection visible, so selecting five oversized images
    // used to surface a complaint about one of them and drop the rest
    // without a word.
    const oversized: string[] = [];
    const wrongType: string[] = [];

    this.isCompressing.set(true);
    try {
      for (const file of incoming) {
        if (!this.matchesAccept(file)) {
          wrongType.push(file.name);
          continue;
        }
        // Only a file too big to even decode is refused outright; anything
        // between the target and this is shrunk below rather than dropped.
        if (file.size > maxBytes) {
          oversized.push(file.name);
          continue;
        }
        // compressToTarget hands back the original on any failure, so a
        // browser that cannot re-encode this format still uploads — the
        // backend compresses it again either way.
        valid.push(file.size > targetBytes ? await this.compression.compressToTarget(file, targetBytes) : file);
      }
    } finally {
      this.isCompressing.set(false);
    }

    this.reportRejected(oversized, wrongType);

    if (!valid.length) return;

    if (this.mode === 'single') {
      this.files.set([valid[0]]);
      this.readAndSet([valid[0]], 0);
    } else {
      const current = this.files();
      const available = Math.max(0, this.maxFiles - current.length);
      if (!available) {
        this.announce('error', 'components.fileUpload.tooMany', { count: this.maxFiles });
        return;
      }
      const toAdd = valid.slice(0, available);
      if (toAdd.length < valid.length) {
        this.announce('warning', 'components.fileUpload.slotsRemaining', { available, max: this.maxFiles });
      }
      this.files.update(arr => [...arr, ...toAdd]);
      this.readAndSet(toAdd, current.length);
    }
  }

  /**
   * Tells the user which files were dropped and why. Size is reported in
   * preference to type when both happened — it is the common case and the
   * one with an action attached (upload something smaller).
   */
  private reportRejected(oversized: string[], wrongType: string[]): void {
    if (oversized.length) {
      this.announce(
        'error',
        oversized.length === 1
          ? 'components.fileUpload.tooLarge'
          : 'components.fileUpload.tooLargeMultiple',
        { count: oversized.length, size: this.maxSizeMb },
      );
      return;
    }

    if (wrongType.length) {
      this.announce(
        'error',
        wrongType.length === 1
          ? 'components.fileUpload.typeNotAllowed'
          : 'components.fileUpload.typeNotAllowedMultiple',
        { name: wrongType[0], count: wrongType.length },
      );
    }
  }

  /**
   * Shows a rejection inline AND as a toast. The inline message alone is not
   * enough: this component is often inside a modal or far down a long form,
   * where a dropped file with an off-screen explanation just looks like
   * nothing happened.
   */
  private announce(kind: 'error' | 'warning', key: string, params: Record<string, unknown>): void {
    this.error.set({ key, params });
    this.toast[kind](key, params);
  }

  private readAndSet(newFiles: File[], offset: number): void {
    let done = 0;
    const results = new Array<string>(newFiles.length);

    newFiles.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = () => {
        results[i] = reader.result as string;
        done++;
        if (done === newFiles.length) {
          this.previews.update(arr => {
            const copy = [...arr];
            results.forEach((url, j) => { copy[offset + j] = url; });
            return copy;
          });
          this.emit();
        }
      };
      reader.readAsDataURL(file);
    });
  }

  private emit(): void {
    this.filesChange.emit(this.files());
    this.previewsChange.emit(this.previews());
  }

  private matchesAccept(file: File): boolean {
    if (!this.accept || this.accept === '*/*') return true;
    return this.accept
      .split(',')
      .map(s => s.trim())
      .some(pattern => {
        if (pattern.endsWith('/*')) {
          // e.g. "image/*" → check file.type starts with "image/"
          return file.type.startsWith(pattern.slice(0, -1));
        }
        return file.type === pattern || file.name.toLowerCase().endsWith(pattern.replace('*', ''));
      });
  }
}
