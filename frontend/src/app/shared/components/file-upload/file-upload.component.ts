import {
  Component,
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

export type UploadMode = 'single' | 'multi';
export type UploadVariant = 'default' | 'avatar';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss'],
})
export class FileUploadComponent implements OnChanges {
  @Input() mode: UploadMode = 'single';
  @Input() variant: UploadVariant = 'default';
  @Input() accept = 'image/*';
  @Input() maxSizeMb = 5;
  @Input() maxFiles = 10;
  @Input() label = 'Drag & drop or click to browse';
  @Input() existingPreview: string | null | undefined = null;
  @Input() showError = false;
  @Input() errorMessage = 'This field is required.';
  @Input() resetCounter = 0;

  @Output() filesChange   = new EventEmitter<File[]>();
  @Output() previewsChange = new EventEmitter<string[]>();

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  readonly files      = signal<File[]>([]);
  readonly previews   = signal<string[]>([]);
  readonly isDragging = signal(false);
  readonly error      = signal<string | null>(null);

  /** New data-URL preview takes priority; falls back to existingPreview from parent. */
  readonly displayPreview = computed<string | null>(() =>
    this.previews()[0] ?? this.existingPreview ?? null,
  );

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
    this.fileInputRef?.nativeElement.click();
  }

  onZoneClick(): void {
    this.triggerInput();
  }

  onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.processFiles(Array.from(input.files));
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
    const dropped = event.dataTransfer?.files;
    if (dropped?.length) this.processFiles(Array.from(dropped));
  }

  removeFile(index: number): void {
    this.files.update(arr => arr.filter((_, i) => i !== index));
    this.previews.update(arr => arr.filter((_, i) => i !== index));
    this.emit();
  }

  // ── Private ──────────────────────────────────────────────────────

  private processFiles(incoming: File[]): void {
    this.error.set(null);
    const maxBytes = this.maxSizeMb * 1024 * 1024;
    const valid: File[] = [];

    for (const file of incoming) {
      if (!this.matchesAccept(file)) {
        this.error.set(`File type not allowed: ${file.name}`);
        continue;
      }
      if (file.size > maxBytes) {
        this.error.set(`"${file.name}" exceeds the ${this.maxSizeMb} MB limit.`);
        continue;
      }
      valid.push(file);
    }

    if (!valid.length) return;

    if (this.mode === 'single') {
      this.files.set([valid[0]]);
      this.readAndSet([valid[0]], 0);
    } else {
      const current = this.files();
      const available = Math.max(0, this.maxFiles - current.length);
      if (!available) {
        this.error.set(`Maximum ${this.maxFiles} files already selected.`);
        return;
      }
      const toAdd = valid.slice(0, available);
      if (toAdd.length < valid.length) {
        this.error.set(`Only ${available} slot(s) remaining (max ${this.maxFiles}).`);
      }
      this.files.update(arr => [...arr, ...toAdd]);
      this.readAndSet(toAdd, current.length);
    }
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
