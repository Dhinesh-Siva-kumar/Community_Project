import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
export declare class PostsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(data: CreatePostDto, userId: string): Promise<{
        user: {
            id: string;
            userName: string;
            displayName: string;
            avatar: string | null;
        };
        community: {
            name: string;
            id: string;
        };
        _count: {
            comments: number;
            likes: number;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.PostStatus;
        content: string;
        images: string[];
        type: import("@prisma/client").$Enums.PostType;
        communityId: string;
        userId: string;
    }>;
    findAll(params: {
        communityId?: string;
        type?: string;
        page: number;
        limit: number;
        isAdmin?: boolean;
    }): Promise<{
        data: ({
            user: {
                id: string;
                userName: string;
                displayName: string;
                avatar: string | null;
            };
            community: {
                name: string;
                id: string;
            };
            _count: {
                comments: number;
                likes: number;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("@prisma/client").$Enums.PostStatus;
            content: string;
            images: string[];
            type: import("@prisma/client").$Enums.PostType;
            communityId: string;
            userId: string;
        })[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    findPending(page: number, limit: number): Promise<{
        data: ({
            user: {
                id: string;
                userName: string;
                displayName: string;
                avatar: string | null;
            };
            community: {
                name: string;
                id: string;
            };
            _count: {
                comments: number;
                likes: number;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("@prisma/client").$Enums.PostStatus;
            content: string;
            images: string[];
            type: import("@prisma/client").$Enums.PostType;
            communityId: string;
            userId: string;
        })[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    approve(postId: string): Promise<{
        user: {
            id: string;
            userName: string;
            displayName: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.PostStatus;
        content: string;
        images: string[];
        type: import("@prisma/client").$Enums.PostType;
        communityId: string;
        userId: string;
    }>;
    reject(postId: string): Promise<{
        user: {
            id: string;
            userName: string;
            displayName: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.PostStatus;
        content: string;
        images: string[];
        type: import("@prisma/client").$Enums.PostType;
        communityId: string;
        userId: string;
    }>;
    delete(postId: string, userId: string): Promise<{
        message: string;
    }>;
    like(postId: string, userId: string): Promise<{
        message: string;
        likeCount: number;
    }>;
    unlike(postId: string, userId: string): Promise<{
        message: string;
        likeCount: number;
    }>;
    getComments(postId: string, page: number, limit: number): Promise<{
        data: ({
            user: {
                id: string;
                userName: string;
                displayName: string;
                avatar: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            content: string;
            userId: string;
            postId: string;
        })[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    addComment(postId: string, userId: string, content: string): Promise<{
        user: {
            id: string;
            userName: string;
            displayName: string;
            avatar: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        content: string;
        userId: string;
        postId: string;
    }>;
    deleteComment(commentId: string, userId: string): Promise<{
        message: string;
    }>;
}
