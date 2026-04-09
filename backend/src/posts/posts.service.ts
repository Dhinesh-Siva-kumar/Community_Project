import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreatePostDto, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const community = await this.prisma.community.findUnique({
      where: { id: data.communityId },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const status = user.isTrusted ? 'APPROVED' : 'PENDING';

    return this.prisma.post.create({
      data: {
        content: data.content,
        communityId: data.communityId,
        userId,
        type: data.type ?? 'GENERAL',
        images: data.images ?? [],
        status,
      },
      include: {
        user: {
          select: {
            id: true,
            userName: true,
            displayName: true,
            avatar: true,
          },
        },
        community: {
          select: { id: true, name: true },
        },
        _count: {
          select: { comments: true, likes: true },
        },
      },
    });
  }

  async findAll(params: {
    communityId?: string;
    type?: string;
    page: number;
    limit: number;
    isAdmin?: boolean;
  }) {
    const { communityId, type, page, limit, isAdmin } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (communityId) {
      where['communityId'] = communityId;
    }

    if (type) {
      where['type'] = type;
    }

    if (!isAdmin) {
      where['status'] = 'APPROVED';
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              userName: true,
              displayName: true,
              avatar: true,
            },
          },
          community: {
            select: { id: true, name: true },
          },
          _count: {
            select: { comments: true, likes: true },
          },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      data: posts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findPending(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const where = { status: 'PENDING' as const };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              userName: true,
              displayName: true,
              avatar: true,
            },
          },
          community: {
            select: { id: true, name: true },
          },
          _count: {
            select: { comments: true, likes: true },
          },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      data: posts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async approve(postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return this.prisma.post.update({
      where: { id: postId },
      data: { status: 'APPROVED' },
      include: {
        user: {
          select: { id: true, userName: true, displayName: true },
        },
      },
    });
  }

  async reject(postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return this.prisma.post.update({
      where: { id: postId },
      data: { status: 'REJECTED' },
      include: {
        user: {
          select: { id: true, userName: true, displayName: true },
        },
      },
    });
  }

  async delete(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.userId !== userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user || user.role !== 'ADMIN') {
        throw new ForbiddenException('You can only delete your own posts');
      }
    }

    await this.prisma.post.delete({ where: { id: postId } });

    return { message: 'Post deleted successfully' };
  }

  async like(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const existingLike = await this.prisma.like.findUnique({
      where: {
        postId_userId: { postId, userId },
      },
    });

    if (existingLike) {
      throw new ConflictException('You have already liked this post');
    }

    await this.prisma.like.create({
      data: { postId, userId },
    });

    const likeCount = await this.prisma.like.count({ where: { postId } });

    return { message: 'Post liked successfully', likeCount };
  }

  async unlike(postId: string, userId: string) {
    const like = await this.prisma.like.findUnique({
      where: {
        postId_userId: { postId, userId },
      },
    });

    if (!like) {
      throw new NotFoundException('You have not liked this post');
    }

    await this.prisma.like.delete({ where: { id: like.id } });

    const likeCount = await this.prisma.like.count({ where: { postId } });

    return { message: 'Post unliked successfully', likeCount };
  }

  async getComments(postId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { postId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              userName: true,
              displayName: true,
              avatar: true,
            },
          },
        },
      }),
      this.prisma.comment.count({ where: { postId } }),
    ]);

    return {
      data: comments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async addComment(postId: string, userId: string, content: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return this.prisma.comment.create({
      data: {
        content,
        postId,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            userName: true,
            displayName: true,
            avatar: true,
          },
        },
      },
    });
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.userId !== userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user || user.role !== 'ADMIN') {
        throw new ForbiddenException('You can only delete your own comments');
      }
    }

    await this.prisma.comment.delete({ where: { id: commentId } });

    return { message: 'Comment deleted successfully' };
  }
}
