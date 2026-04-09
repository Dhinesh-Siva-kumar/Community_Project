import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationType } from '@prisma/client';
export declare class NotificationsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(userId: string, type: NotificationType, message: string, relatedEntityId?: string): Promise<{
        id: string;
        createdAt: Date;
        message: string;
        userId: string;
        type: import("@prisma/client").$Enums.NotificationType;
        isRead: boolean;
        relatedEntityId: string | null;
    }>;
    findAll(userId: string, page: number, limit: number): Promise<{
        data: {
            id: string;
            createdAt: Date;
            message: string;
            userId: string;
            type: import("@prisma/client").$Enums.NotificationType;
            isRead: boolean;
            relatedEntityId: string | null;
        }[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    markAsRead(notificationId: string): Promise<{
        id: string;
        createdAt: Date;
        message: string;
        userId: string;
        type: import("@prisma/client").$Enums.NotificationType;
        isRead: boolean;
        relatedEntityId: string | null;
    }>;
    markAllAsRead(userId: string): Promise<{
        message: string;
    }>;
    getUnreadCount(userId: string): Promise<{
        count: number;
    }>;
}
