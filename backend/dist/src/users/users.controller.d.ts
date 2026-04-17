import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getProfile(userId: string): Promise<{
        communities: ({
            community: {
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
            };
        } & {
            id: string;
            communityId: string;
            userId: string;
            joinedAt: Date;
        })[];
        countryId: number | null;
        isActive: boolean;
        id: string;
        email: string | null;
        userName: string;
        displayName: string;
        phoneNo: string | null;
        avatar: string | null;
        role: import("@prisma/client").$Enums.UserRole;
        roleLevel: number;
        country: string;
        location: string | null;
        pincode: string | null;
        interests: string[];
        professionalCategory: string | null;
        bio: string | null;
        isTrusted: boolean;
        isBlocked: boolean;
        profileCompletion: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateProfile(userId: string, dto: UpdateUserDto): Promise<{
        countryId: number | null;
        isActive: boolean;
        id: string;
        email: string | null;
        userName: string;
        displayName: string;
        phoneNo: string | null;
        avatar: string | null;
        role: import("@prisma/client").$Enums.UserRole;
        roleLevel: number;
        country: string;
        location: string | null;
        pincode: string | null;
        interests: string[];
        professionalCategory: string | null;
        bio: string | null;
        isTrusted: boolean;
        isBlocked: boolean;
        profileCompletion: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getUsers(page?: string, limit?: string, search?: string): Promise<{
        data: {
            countryId: number | null;
            isActive: boolean;
            id: string;
            email: string | null;
            userName: string;
            displayName: string;
            phoneNo: string | null;
            avatar: string | null;
            role: import("@prisma/client").$Enums.UserRole;
            roleLevel: number;
            country: string;
            location: string | null;
            pincode: string | null;
            interests: string[];
            professionalCategory: string | null;
            bio: string | null;
            isTrusted: boolean;
            isBlocked: boolean;
            profileCompletion: number;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    getDashboardStats(userId: string, role: string): Promise<{
        totalUsers: number;
        totalCommunities: number;
        totalPosts: number;
        pendingPosts: number;
        totalBusinesses: number;
        totalEvents: number;
        totalJobs: number;
        recentActivity: {
            type: string;
            message: string;
            createdAt: Date;
        }[];
        joinedCommunities?: undefined;
        userPosts?: undefined;
        userBusinesses?: undefined;
        userEvents?: undefined;
        userJobs?: undefined;
    } | {
        joinedCommunities: number;
        userPosts: number;
        userBusinesses: number;
        userEvents: number;
        userJobs: number;
        totalUsers?: undefined;
        totalCommunities?: undefined;
        totalPosts?: undefined;
        pendingPosts?: undefined;
        totalBusinesses?: undefined;
        totalEvents?: undefined;
        totalJobs?: undefined;
        recentActivity?: undefined;
    }>;
    blockUser(id: string): Promise<{
        id: string;
        email: string | null;
        userName: string;
        displayName: string;
        isBlocked: boolean;
    }>;
    unblockUser(id: string): Promise<{
        id: string;
        email: string | null;
        userName: string;
        displayName: string;
        isBlocked: boolean;
    }>;
    trustUser(id: string): Promise<{
        id: string;
        email: string | null;
        userName: string;
        displayName: string;
        isTrusted: boolean;
    }>;
    untrustUser(id: string): Promise<{
        id: string;
        email: string | null;
        userName: string;
        displayName: string;
        isTrusted: boolean;
    }>;
}
