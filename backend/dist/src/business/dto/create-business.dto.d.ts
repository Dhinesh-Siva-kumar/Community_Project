export declare class CreateBusinessDto {
    name: string;
    description?: string;
    images?: string[];
    address?: string;
    pincode?: string;
    country?: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    phone?: string;
    email?: string;
    website?: string;
    openingHours?: string;
    categoryId: string;
}
export declare class CreateBusinessCategoryDto {
    name: string;
    icon?: string;
}
