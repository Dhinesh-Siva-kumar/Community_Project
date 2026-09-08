import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageUrlPipe } from '../../pipes/image-url.pipe';

/**
 * Plays a post's attached video.
 *
 * A post's video has to render on every surface that shows a post — the four
 * community feeds, My Posts, the dashboard, the community page, admin
 * approval and the profile list. Unlike the image grids, whose markup and CSS
 * differ per surface, the player is identical everywhere, so one component
 * beats nine copies.
 *
 * `variant="thumb"` is the compact, non-interactive form used in list rows.
 * Byte-range requests are served by express.static, so seeking works without
 * downloading the whole file.
 */
@Component({
  selector: 'app-post-video',
  standalone: true,
  imports: [CommonModule, ImageUrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <video
      class="pv-video"
      [class.pv-video--thumb]="variant === 'thumb'"
      [src]="sourceUrl"
      [controls]="variant !== 'thumb'"
      [muted]="variant === 'thumb'"
      preload="metadata"
      playsinline
    ></video>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .pv-video {
        display: block;
        width: 100%;
        max-height: 420px;
        border-radius: 0.5rem;
        background-color: #000;
      }
      .pv-video--thumb {
        max-height: none;
        height: 100%;
        object-fit: cover;
        pointer-events: none;
      }
    `,
  ],
})
export class PostVideoComponent {
  @Input({ required: true }) src!: string | null | undefined;
  @Input() variant: 'default' | 'thumb' = 'default';

  private readonly imageUrl = new ImageUrlPipe();

  /**
   * `#t=0.1` asks the browser to seek to the first tenth of a second, which
   * makes it paint a real frame instead of a black box. There is no ffmpeg on
   * the server to generate poster images, so this is the closest thing to a
   * thumbnail available.
   */
  get sourceUrl(): string | null {
    const resolved = this.imageUrl.transform(this.src);
    if (!resolved) return null;
    return this.variant === 'thumb' ? `${resolved}#t=0.1` : resolved;
  }
}
