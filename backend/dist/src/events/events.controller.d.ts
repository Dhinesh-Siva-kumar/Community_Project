import { EventsService } from './events.service.js';
import { CreateEventDto } from './dto/create-event.dto.js';
export declare class EventsController {
    private readonly eventsService;
    constructor(eventsService: EventsService);
    create(dto: CreateEventDto, userId: string, files?: Express.Multer.File[]): Promise<{
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
    findAll(pincode?: string, search?: string, page?: string, limit?: string): Promise<{
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
    update(id: string, dto: Partial<CreateEventDto>, userId: string, files?: Express.Multer.File[]): Promise<{
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
