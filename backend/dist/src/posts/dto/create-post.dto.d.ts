declare enum PostType {
    GENERAL = "GENERAL",
    HELP = "HELP",
    EMERGENCY = "EMERGENCY"
}
export declare class CreatePostDto {
    content: string;
    communityId: string;
    type?: PostType;
    images?: string[];
}
export {};
