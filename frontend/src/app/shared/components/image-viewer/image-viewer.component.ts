import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  signal,
  computed,
  OnDestroy,
  effect,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageUrlPipe } from '../../pipes/image-url.pipe';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';

@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [CommonModule, ImageUrlPipe, TranslatePipe, ScrollLockDirective],
  templateUrl: './image-viewer.component.html',
  styleUrls: ['./image-viewer.component.scss'],
})
export class ImageViewerComponent implements OnDestroy {
  images = input<string[]>([]);
  isOpen = input(false);
  initialIndex = input(0);
  @Output() close = new EventEmitter<void>();

  currentIndex = signal(0);
  isLoading = signal(false);

  currentImage = computed(() => {
    const idx = this.currentIndex();
    const imgs = this.images();
    return imgs[idx] || null;
  });

  imageCount = computed(() => this.images().length);

  canGoPrevious = computed(() => this.currentIndex() > 0);
  canGoNext = computed(() => this.currentIndex() < this.images().length - 1);

  imagePosition = computed(() => {
    const idx = this.currentIndex();
    const total = this.images().length;
    return `${idx + 1} of ${total}`;
  });

  // Set initial index whenever the viewer opens or initialIndex changes
  private readonly syncInitialIndex = effect(() => {
    if (this.isOpen()) {
      this.currentIndex.set(this.initialIndex());
    }
  });

  ngOnDestroy(): void {
    // Ensure cleanup
    this.close.emit();
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (!this.isOpen) return;

    switch (event.key) {
      case 'Escape':
        this.closeViewer();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.previousImage();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.nextImage();
        break;
    }
  }

  nextImage(): void {
    if (this.canGoNext()) {
      this.currentIndex.update(i => i + 1);
      this.isLoading.set(true);
    }
  }

  previousImage(): void {
    if (this.canGoPrevious()) {
      this.currentIndex.update(i => i - 1);
      this.isLoading.set(true);
    }
  }

  onImageLoad(): void {
    this.isLoading.set(false);
  }

  onImageError(): void {
    this.isLoading.set(false);
  }

  closeViewer(): void {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    // Close only if clicking on the backdrop itself, not the image
    if (event.target === event.currentTarget) {
      this.closeViewer();
    }
  }
}
