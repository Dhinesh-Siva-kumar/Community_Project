import { CommunitiesService } from './communities.service.js';
import { CreateCommunityDto } from './dto/create-community.dto.js';
export declare class CommunitiesController {
    private readonly communitiesService;
    constructor(communitiesService: CommunitiesService);
    create(dto: CreateCommunityDto, adminId: string): Promise<{
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
    findAll(page?: string, limit?: string, search?: string, pincode?: string): Promise<{
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
    update(id: string, dto: Partial<CreateCommunityDto>): Promise<{
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
    join(id: string, userId: string): Promise<{
        message: string;
    }>;
    leave(id: string, userId: string): Promise<{
        message: string;
    }>;
    getMembers(id: string, page?: string, limit?: string): Promise<{
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
            communityId: string;
            userId: string;
            joinedAt: Date;
        })[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
}
