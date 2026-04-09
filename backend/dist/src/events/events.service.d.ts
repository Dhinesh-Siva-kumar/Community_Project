import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEventDto } from './dto/create-event.dto.js';
export declare class EventsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(data: CreateEventDto, userId: string): Promise<{
        user: {
            id: string;
            userName: string;
            displayName: string;
            avatar: string | null;
        };
    } & {
        isActive: boolean;
        id: string;
        country: string;
        location: string | null;
        pincode: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        description: string | null;
        images: string[];
        address: string | null;
        title: string;
        eventDate: Date;
        eventTime: string | null;
    }>;
    findAll(params: {
        pincode?: string;
        page: number;
        limit: number;
        search?: string;
    }): Promise<{
        data: ({
            user: {
                id: string;
                userName: string;
                displayName: string;
                avatar: string | null;
            };
        } & {
            isActive: boolean;
            id: string;
            country: string;
            location: string | null;
            pincode: string | null;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            description: string | null;
            images: string[];
            address: string | null;
            title: string;
            eventDate: Date;
            eventTime: string | null;
        })[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    findOne(id: string): Promise<{
        user: {
            id: string;
            email: string | null;
            userName: string;
            displayName: string;
            avatar: string | null;
        };
    } & {
        isActive: boolean;
        id: string;
        country: string;
        location: string | null;
        pincode: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        description: string | null;
        images: string[];
        address: string | null;
        title: string;
        eventDate: Date;
        eventTime: string | null;
    }>;
    update(id: string, data: Partial<CreateEventDto>, userId: string): Promise<{
        user: {
            id: string;
            userName: string;
            displayName: string;
            avatar: string | null;
        };
    } & {
        isActive: boolean;
        id: string;
        country: string;
        location: string | null;
        pincode: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        description: string | null;
        images: string[];
        address: string | null;
        title: string;
        eventDate: Date;
        eventTime: string | null;
    }>;
    delete(id: string, userId: string): Promise<{
        message: string;
    }>;
}
