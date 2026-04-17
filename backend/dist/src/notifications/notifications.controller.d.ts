import { NotificationsService } from './notifications.service.js';
export declare class NotificationsController {
    private readonly notificationsService;
    constructor(notificationsService: NotificationsService);
    findAll(userId: string, page?: string, limit?: string): Promise<{
        data: {
            id: string;
            createdAt: Date;
            message: string;
            type: import("@prisma/client").$Enums.NotificationType;
            userId: string;
            isRead: boolean;
            relatedEntityId: string | null;
        }[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    markAsRead(id: string): Promise<{
        id: string;
        createdAt: Date;
        message: string;
        type: import("@prisma/client").$Enums.NotificationType;
        userId: string;
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
