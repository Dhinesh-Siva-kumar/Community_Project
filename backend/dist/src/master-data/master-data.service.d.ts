import { PrismaService } from '../prisma/prisma.service.js';
export declare class MasterDataService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getCountries(): Promise<{
        success: boolean;
        count: number;
        data: {
            country_id: number;
            country_name: string;
            country_code: string | null;
            country_flag: string | null;
        }[];
    }>;
    getInterests(): Promise<{
        success: boolean;
        count: number;
        data: {
            interest_id: number;
            interest_name: string;
        }[];
    }>;
}
