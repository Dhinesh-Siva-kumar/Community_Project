import { PrismaService } from '../prisma/prisma.service.js';
import { CreateJobDto } from './dto/create-job.dto.js';
export declare class JobsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(data: CreateJobDto, userId: string): Promise<{
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
        images: string[];
        userId: string;
        description: string | null;
        title: string;
        specification: string | null;
        contactInfo: string | null;
        salary: string | null;
        jobType: string | null;
        timing: string | null;
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
            images: string[];
            userId: string;
            description: string | null;
            title: string;
            specification: string | null;
            contactInfo: string | null;
            salary: string | null;
            jobType: string | null;
            timing: string | null;
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
        images: string[];
        userId: string;
        description: string | null;
        title: string;
        specification: string | null;
        contactInfo: string | null;
        salary: string | null;
        jobType: string | null;
        timing: string | null;
    }>;
    update(id: string, data: Partial<CreateJobDto>, userId: string): Promise<{
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
        images: string[];
        userId: string;
        description: string | null;
        title: string;
        specification: string | null;
        contactInfo: string | null;
        salary: string | null;
        jobType: string | null;
        timing: string | null;
    }>;
    delete(id: string, userId: string): Promise<{
        message: string;
    }>;
}
