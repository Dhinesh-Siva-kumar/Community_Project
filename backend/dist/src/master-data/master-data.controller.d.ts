import { MasterDataService } from './master-data.service.js';
export declare class MasterDataController {
    private readonly masterDataService;
    constructor(masterDataService: MasterDataService);
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
