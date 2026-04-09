"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let PostsService = class PostsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data, userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        const community = await this.prisma.community.findUnique({
            where: { id: data.communityId },
        });
        if (!community) {
            throw new common_1.NotFoundException('Community not found');
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
    async findAll(params) {
        const { communityId, type, page, limit, isAdmin } = params;
        const skip = (page - 1) * limit;
        const where = {};
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
    async findPending(page, limit) {
        const skip = (page - 1) * limit;
        const where = { status: 'PENDING' };
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
    async approve(postId) {
        const post = await this.prisma.post.findUnique({ where: { id: postId } });
        if (!post) {
            throw new common_1.NotFoundException('Post not found');
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
    async reject(postId) {
        const post = await this.prisma.post.findUnique({ where: { id: postId } });
        if (!post) {
            throw new common_1.NotFoundException('Post not found');
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
    async delete(postId, userId) {
        const post = await this.prisma.post.findUnique({ where: { id: postId } });
        if (!post) {
            throw new common_1.NotFoundException('Post not found');
        }
        if (post.userId !== userId) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });
            if (!user || user.role !== 'ADMIN') {
                throw new common_1.ForbiddenException('You can only delete your own posts');
            }
        }
        await this.prisma.post.delete({ where: { id: postId } });
        return { message: 'Post deleted successfully' };
    }
    async like(postId, userId) {
        const post = await this.prisma.post.findUnique({ where: { id: postId } });
        if (!post) {
            throw new common_1.NotFoundException('Post not found');
        }
        const existingLike = await this.prisma.like.findUnique({
            where: {
                postId_userId: { postId, userId },
            },
        });
        if (existingLike) {
            throw new common_1.ConflictException('You have already liked this post');
        }
        await this.prisma.like.create({
            data: { postId, userId },
        });
        const likeCount = await this.prisma.like.count({ where: { postId } });
        return { message: 'Post liked successfully', likeCount };
    }
    async unlike(postId, userId) {
        const like = await this.prisma.like.findUnique({
            where: {
                postId_userId: { postId, userId },
            },
        });
        if (!like) {
            throw new common_1.NotFoundException('You have not liked this post');
        }
        await this.prisma.like.delete({ where: { id: like.id } });
        const likeCount = await this.prisma.like.count({ where: { postId } });
        return { message: 'Post unliked successfully', likeCount };
    }
    async getComments(postId, page, limit) {
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
    async addComment(postId, userId, content) {
        const post = await this.prisma.post.findUnique({ where: { id: postId } });
        if (!post) {
            throw new common_1.NotFoundException('Post not found');
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
    async deleteComment(commentId, userId) {
        const comment = await this.prisma.comment.findUnique({
            where: { id: commentId },
        });
        if (!comment) {
            throw new common_1.NotFoundException('Comment not found');
        }
        if (comment.userId !== userId) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });
            if (!user || user.role !== 'ADMIN') {
                throw new common_1.ForbiddenException('You can only delete your own comments');
            }
        }
        await this.prisma.comment.delete({ where: { id: commentId } });
        return { message: 'Comment deleted successfully' };
    }
};
exports.PostsService = PostsService;
exports.PostsService = PostsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], PostsService);
//# sourceMappingURL=posts.service.js.map