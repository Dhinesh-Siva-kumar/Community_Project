import { Request, Response, NextFunction } from 'express';
import * as shareService from './share.service';
import { env } from '../../config/env';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveAssetUrl(pathOrUrl: string | null, assetBaseOrigin: string): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith('//')) return `https:${pathOrUrl}`;
  const clean = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${assetBaseOrigin}${clean}`;
}

function safeOrigin(urlLike: string, fallbackOrigin: string): string {
  try {
    return new URL(urlLike).origin;
  } catch {
    try {
      return new URL(urlLike, fallbackOrigin).origin;
    } catch {
      return fallbackOrigin;
    }
  }
}

function looksLikeCrawler(userAgent: string): boolean {
  return /(facebookexternalhit|facebot|twitterbot|xbot|linkedinbot|slackbot|telegrambot|whatsapp|discordbot|googlebot|bingbot|pinterest|crawler|spider|preview)/i.test(userAgent);
}

export async function postSharePage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const postId = req.params['id'] as string;
    const shared = await shareService.getPostShareData(postId);
    const host = req.get('host');
    const requestOrigin = host ? `${req.protocol}://${host}` : safeOrigin(env.APP_URL, 'http://localhost:3000');
    const frontendOrigin = safeOrigin(env.FRONTEND_URL, requestOrigin);
    const assetBaseOrigin = safeOrigin(env.APP_URL, requestOrigin);
    const sharePageUrl = `${requestOrigin}/share/post/${shared.id}`;
    const redirectUrl = `${frontendOrigin}/user/community/${shared.communityId}#post-${shared.id}`;
    const crawlerRequest = looksLikeCrawler((req.get('user-agent') ?? '').toLowerCase());

    const title = `${shared.communityName} - Community Post`;
    const description = shared.contentPreview;
    const imageUrl = resolveAssetUrl(shared.image, assetBaseOrigin);
    const secureImageUrl = imageUrl && imageUrl.startsWith('https://') ? imageUrl : null;
    const redirectMetaTag = crawlerRequest ? '' : `<meta http-equiv="refresh" content="0;url=${escapeHtml(redirectUrl)}" />`;
    const redirectScript = crawlerRequest
      ? ''
      : `<script>window.location.replace(${JSON.stringify(redirectUrl)});</script>`;

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="canonical" href="${escapeHtml(sharePageUrl)}" />

  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(sharePageUrl)}" />
  <meta property="og:site_name" content="Community Project" />
  ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />` : ''}
  ${secureImageUrl ? `<meta property="og:image:secure_url" content="${escapeHtml(secureImageUrl)}" />` : ''}
  ${imageUrl ? `<meta property="og:image:alt" content="${escapeHtml(title)}" />` : ''}

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:url" content="${escapeHtml(sharePageUrl)}" />
  ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : ''}
  ${imageUrl ? `<meta name="twitter:image:alt" content="${escapeHtml(title)}" />` : ''}

  ${redirectMetaTag}
  ${redirectScript}
</head>
<body>
  <p>Redirecting to post...</p>
  <p><a href="${escapeHtml(redirectUrl)}">Open post</a></p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (err) {
    next(err);
  }
}
