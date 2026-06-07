import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Resolves an image path returned by the backend upload endpoint.
 *
 * The upload route returns a relative path like `/uploads/filename.jpg`.
 * When used as an <img src> or CSS url() inside the Angular app (origin
 * localhost:4200), the browser would look for the file on the Angular dev
 * server — not on the Express backend (localhost:3000).
 *
 * This pipe prepends `environment.wsUrl` to any path that is relative
 * (starts with `/`), and leaves absolute URLs (http/https/data:) unchanged.
 *
 * Usage:
 *   [src]="community.image | imageUrl"
 *   [style.backgroundImage]="community.image ? 'url(' + (community.image | imageUrl) + ')' : null"
 */
@Pipe({ name: 'imageUrl', standalone: true, pure: true })
export class ImageUrlPipe implements PipeTransform {
  transform(path: string | null | undefined): string | null {
    if (!path) return null;
    // Already an absolute URL or a data URI — return as-is.
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('//')) {
      return path;
    }
    // Relative path from the backend (e.g. /uploads/abc.jpg) — prepend origin.
    return `${environment.wsUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }
}
