import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCommunityDto } from './dto/create-community.dto.js';
export declare class CommunitiesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(data: CreateCommunityDto, adminId: string): Promise<{
        createdBy: {
            id: string;
            email: string | null;
            userName: string;
            displayName: string;
        };
    } & {
        isActive: boolean;
        name: string;
        id: string;
        location: string | null;
        pincode: string | null;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        image: string | null;
        createdById: string;
    }>;
    findAll(params: {
        page: number;
        limit: number;
        search?: string;
        pincode?: string;
    }): Promise<{
        data: ({
            _count: {
                posts: number;
                members: number;
            };
            createdBy: {
                id: string;
                userName: string;
                displayName: string;
            };
        } & {
            isActive: boolean;
            name: string;
            id: string;
            location: string | null;
            pincode: string | null;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            image: string | null;
            createdById: string;
        })[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    findOne(id: string): Promise<{
        _count: {
            posts: number;
            members: number;
        };
        createdBy: {
            id: string;
            email: string | null;
            userName: string;
            displayName: string;
        };
    } & {
        isActive: boolean;
        name: string;
        id: string;
        location: string | null;
        pincode: string | null;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        image: string | null;
        createdById: string;
    }>;
    update(id: string, data: Partial<CreateCommunityDto>): Promise<{
        _count: {
            posts: number;
            members: number;
        };
    } & {
        isActive: boolean;
        name: string;
        id: string;
        location: string | null;
        pincode: string | null;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        image: string | null;
        createdById: string;
    }>;
    delete(id: string): Promise<{
        message: string;
    }>;
    join(communityId: string, userId: string): Promise<{
        message: string;
    }>;
    leave(communityId: string, userId: string): Promise<{
        message: string;
    }>;
    getMembers(communityId: string, page: number, limit: number): Promise<{
        data: ({
            user: {
                id: string;
                email: string | null;
                userName: string;
                displayName: string;
                avatar: string | null;
                professionalCategory: string | null;
            };
        } & {
            id: string;
            userId: string;
            communityId: string;
            joinedAt: Date;
        })[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
}
