import { BusinessService } from './business.service.js';
import { CreateBusinessDto, CreateBusinessCategoryDto } from './dto/create-business.dto.js';
export declare class BusinessController {
    private readonly businessService;
    constructor(businessService: BusinessService);
    createCategory(dto: CreateBusinessCategoryDto): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        icon: string | null;
    }>;
    getCategories(): Promise<({
        _count: {
            businesses: number;
        };
    } & {
        name: string;
        id: string;
        createdAt: Date;
        icon: string | null;
    })[]>;
    create(dto: CreateBusinessDto, userId: string, files?: Express.Multer.File[]): Promise<{
        user: {
            id: string;
            userName: string;
            displayName: string;
        };
        category: {
            name: string;
            id: string;
            createdAt: Date;
            icon: string | null;
        };
    } & {
        isActive: boolean;
        name: string;
        id: string;
        email: string | null;
        country: string;
        location: string | null;
        pincode: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        description: string | null;
        images: string[];
        address: string | null;
        latitude: number | null;
        longitude: number | null;
        phone: string | null;
        website: string | null;
        openingHours: string | null;
        categoryId: string;
    }>;
    findAll(categoryId?: string, pincode?: string, search?: string, page?: string, limit?: string): Promise<{
        data: ({
            user: {
                id: string;
                userName: string;
                displayName: string;
            };
            category: {
                name: string;
                id: string;
                createdAt: Date;
                icon: string | null;
            };
        } & {
            isActive: boolean;
            name: string;
            id: string;
            email: string | null;
            country: string;
            location: string | null;
            pincode: string | null;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            description: string | null;
            images: string[];
            address: string | null;
            latitude: number | null;
            longitude: number | null;
            phone: string | null;
            website: string | null;
            openingHours: string | null;
            categoryId: string;
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
        category: {
            name: string;
            id: string;
            createdAt: Date;
            icon: string | null;
        };
    } & {
        isActive: boolean;
        name: string;
        id: string;
        email: string | null;
        country: string;
        location: string | null;
        pincode: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        description: string | null;
        images: string[];
        address: string | null;
        latitude: number | null;
        longitude: number | null;
        phone: string | null;
        website: string | null;
        openingHours: string | null;
        categoryId: string;
    }>;
    update(id: string, dto: Partial<CreateBusinessDto>, userId: string, files?: Express.Multer.File[]): Promise<{
        user: {
            id: string;
            userName: string;
            displayName: string;
        };
        category: {
            name: string;
            id: string;
            createdAt: Date;
            icon: string | null;
        };
    } & {
        isActive: boolean;
        name: string;
        id: string;
        email: string | null;
        country: string;
        location: string | null;
        pincode: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        description: string | null;
        images: string[];
        address: string | null;
        latitude: number | null;
        longitude: number | null;
        phone: string | null;
        website: string | null;
        openingHours: string | null;
        categoryId: string;
    }>;
    delete(id: string, userId: string): Promise<{
        message: string;
    }>;
}
