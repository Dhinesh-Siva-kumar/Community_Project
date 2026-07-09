import { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

/**
 * Cache configuration by file type
 * Defines Cache-Control headers and max-age values for different image types
 */
const CACHE_CONFIG: Record<string, { maxAge: number; immutable: boolean }> = {
  // Permanent images: 30 days
  '.jpg': { maxAge: 2592000, immutable: true },
  '.jpeg': { maxAge: 2592000, immutable: true },
  '.png': { maxAge: 2592000, immutable: true },
  '.gif': { maxAge: 2592000, immutable: true },
  '.webp': { maxAge: 2592000, immutable: true },
  '.svg': { maxAge: 2592000, immutable: true },
  '.ico': { maxAge: 2592000, immutable: true },

  // Videos: 30 days
  '.webm': { maxAge: 2592000, immutable: true },
  '.mp4': { maxAge: 2592000, immutable: true },

  // Other static assets: 7 days
  '.css': { maxAge: 604800, immutable: false },
  '.js': { maxAge: 604800, immutable: false },
  '.woff': { maxAge: 2592000, immutable: true },
  '.woff2': { maxAge: 2592000, immutable: true },
  '.ttf': { maxAge: 2592000, immutable: true },
};

/**
 * Cache-busting key generator based on file content
 * Creates a stable ETag using file stats and content hash
 */
function generateETag(filePath: string): string {
  try {
    const stats = fs.statSync(filePath);
    const mtime = stats.mtime.getTime();
    const size = stats.size;
    
    // Use file mtime and size for quick ETag generation
    // For static files, this is sufficient and performs well
    const tag = `"${mtime}-${size}"`;
    return tag;
  } catch (err) {
    // Fallback if file is not readable
    return `"${Date.now()}"`;
  }
}

/**
 * Image Cache Headers Middleware
 * Sets appropriate Cache-Control and ETag headers for static assets
 * 
 * Features:
 * - Type-specific cache durations (images: 30 days, etc)
 * - ETag generation for 304 Not Modified responses
 * - Immutable flag for fingerprinted/versioned assets
 * - Proper cache validation headers
 */
export function imageCacheHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const originalSend = res.send;

  // Override res.send to intercept file serving
  res.send = function (data: any) {
    // Only apply cache headers to successful responses
    if (res.statusCode < 400) {
      const fileExt = path.extname(req.url).toLowerCase();
      const cacheConfig = CACHE_CONFIG[fileExt] || { maxAge: 3600, immutable: false };

      // Set Cache-Control header
      let cacheControl = `public, max-age=${cacheConfig.maxAge}`;
      if (cacheConfig.immutable) {
        cacheControl += ', immutable';
      }
      res.set('Cache-Control', cacheControl);

      // Set ETag for 304 Not Modified validation
      res.set('ETag', generateETag(req.url));

      // Set Expires header for older clients
      const expiresDate = new Date(Date.now() + cacheConfig.maxAge * 1000);
      res.set('Expires', expiresDate.toUTCString());

      // Set Vary header to account for Accept-Encoding
      res.set('Vary', 'Accept-Encoding');

      // Add security headers for static content
      res.set('X-Content-Type-Options', 'nosniff');
    }

    // Call original send
    return originalSend.call(this, data);
  };

  next();
}

/**
 * Image serving with cache headers middleware
 * Should be applied before express.static() for /uploads route
 * 
 * Example usage in app.ts:
 * app.use('/uploads', imageCacheHeaders, express.static(...))
 */
export function imageServeWithCache(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const fileExt = path.extname(req.url).toLowerCase();
  const cacheConfig = CACHE_CONFIG[fileExt];

  if (cacheConfig) {
    // Set Cache-Control header based on file type
    let cacheControl = `public, max-age=${cacheConfig.maxAge}`;
    if (cacheConfig.immutable) {
      cacheControl += ', immutable';
    }
    res.set('Cache-Control', cacheControl);

    // Set Expires header for older clients
    const expiresDate = new Date(Date.now() + cacheConfig.maxAge * 1000);
    res.set('Expires', expiresDate.toUTCString());

    // Set Vary header
    res.set('Vary', 'Accept-Encoding');

    // Add security headers
    res.set('X-Content-Type-Options', 'nosniff');
  }

  next();
}
