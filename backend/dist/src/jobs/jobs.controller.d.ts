import { JobsService } from './jobs.service.js';
import { CreateJobDto } from './dto/create-job.dto.js';
export declare class JobsController {
    private readonly jobsService;
    constructor(jobsService: JobsService);
    create(dto: CreateJobDto, userId: string, files?: Express.Multer.File[]): Promise<{
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
        title: string;
        specification: string | null;
        contactInfo: string | null;
        salary: string | null;
        jobType: string | null;
        timing: string | null;
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
        userId: string;
        description: string | null;
        images: string[];
        title: string;
        specification: string | null;
        contactInfo: string | null;
        salary: string | null;
        jobType: string | null;
        timing: string | null;
    }>;
    update(id: string, dto: Partial<CreateJobDto>, userId: string, files?: Express.Multer.File[]): Promise<{
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
