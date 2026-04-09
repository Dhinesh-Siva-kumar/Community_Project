export declare class UploadController {
    uploadFile(file: Express.Multer.File): {
        filename: string;
        originalname: string;
        mimetype: string;
        size: number;
        path: string;
    };
    uploadMultipleFiles(files: Express.Multer.File[]): {
        filename: string;
        originalname: string;
        mimetype: string;
        size: number;
        path: string;
    }[];
}
