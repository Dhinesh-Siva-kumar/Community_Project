import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getProfile(userId: string): Promise<{
        communities: ({
            community: {
                id: string;
                location: string | null;
                pincode: string | null;
                isActive: boolean;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                description: string | null;
                image: string | null;
                createdById: string;
            };
        } & {
            id: string;
            userId: string;
            communityId: string;
            joinedAt: Date;
        })[];
        id: string;
        email: string | null;
        userName: string;
        displayName: string;
        phoneNo: string | null;
        avatar: string | null;
        role: import("@prisma/client").$Enums.UserRole;
        roleLevel: number;
        countryId: number | null;
        country: string;
        location: string | null;
        pincode: string | null;
        interests: string[];
        professionalCategory: string | null;
        bio: string | null;
        isTrusted: boolean;
        isBlocked: boolean;
        isActive: boolean;
        profileCompletion: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateProfile(userId: string, data: UpdateUserDto): Promise<{
        id: string;
        email: string | null;
        userName: string;
        displayName: string;
        phoneNo: string | null;
        avatar: string | null;
        role: import("@prisma/client").$Enums.UserRole;
        roleLevel: number;
        countryId: number | null;
        country: string;
        location: string | null;
        pincode: string | null;
        interests: string[];
        professionalCategory: string | null;
        bio: string | null;
        isTrusted: boolean;
        isBlocked: boolean;
        isActive: boolean;
        profileCompletion: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    private calculateProfileCompletion;
    getUsers(page: number, limit: number, search?: string): Promise<{
        data: {
            id: string;
            email: string | null;
            userName: string;
            displayName: string;
            phoneNo: string | null;
            avatar: string | null;
            role: import("@prisma/client").$Enums.UserRole;
            roleLevel: number;
            countryId: number | null;
            country: string;
            location: string | null;
            pincode: string | null;
            interests: string[];
            professionalCategory: string | null;
            bio: string | null;
            isTrusted: boolean;
            isBlocked: boolean;
            isActive: boolean;
            profileCompletion: number;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    blockUser(userId: string): Promise<{
        id: string;
        email: string | null;
        userName: string;
        displayName: string;
        isBlocked: boolean;
    }>;
    unblockUser(userId: string): Promise<{
        id: string;
        email: string | null;
        userName: string;
        displayName: string;
        isBlocked: boolean;
    }>;
    trustUser(userId: string): Promise<{
        id: string;
        email: string | null;
        userName: string;
        displayName: string;
        isTrusted: boolean;
    }>;
    untrustUser(userId: string): Promise<{
        id: string;
        email: string | null;
        userName: string;
        displayName: string;
        isTrusted: boolean;
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
}
