import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';

type PostRow = {
  id: string;
  content: string;
  images: string[] | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  community_id: string;
  community_name: string;
};

const PREVIEW_MAX = 220;

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toPreview(content: string): string {
  const cleaned = compact(content);
  if (!cleaned) return 'View this post in the community.';
  if (cleaned.length <= PREVIEW_MAX) return cleaned;
  return `${cleaned.slice(0, PREVIEW_MAX - 1).trimEnd()}...`;
}

export async function getPostShareData(postId: string): Promise<{ id: string; communityId: string; communityName: string; contentPreview: string; image: string | null }> {
  const row = await db('posts as p')
    .join('communities as c', 'p.community_id', 'c.id')
    .where('p.id', postId)
    .andWhere('p.status', 'APPROVED')
    .select('p.id', 'p.content', 'p.images', 'p.status', 'p.community_id', 'c.name as community_name')
    .first() as PostRow | undefined;

  if (!row) {
    throw new AppError(404, 'Post not found');
  }

  const firstImage = Array.isArray(row.images) && row.images.length > 0 ? row.images[0] ?? null : null;

  return {
    id: row.id,
    communityId: row.community_id,
    communityName: row.community_name,
    contentPreview: toPreview(row.content),
    image: firstImage,
  };
}
