import { PostsService } from './posts.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
export declare class PostsController {
    private readonly postsService;
    constructor(postsService: PostsService);
    create(dto: CreatePostDto, userId: string): Promise<{
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
    findAll(communityId?: string, type?: string, page?: string, limit?: string, role?: string): Promise<{
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
    findPending(page?: string, limit?: string): Promise<{
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
    approve(id: string): Promise<{
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
    reject(id: string): Promise<{
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
    delete(id: string, userId: string): Promise<{
        message: string;
    }>;
    like(id: string, userId: string): Promise<{
        message: string;
        likeCount: number;
    }>;
    unlike(id: string, userId: string): Promise<{
        message: string;
        likeCount: number;
    }>;
    getComments(id: string, page?: string, limit?: string): Promise<{
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
    addComment(id: string, userId: string, content: string): Promise<{
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
    deleteComment(id: string, userId: string): Promise<{
        message: string;
    }>;
}
