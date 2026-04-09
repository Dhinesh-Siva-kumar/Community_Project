export declare const multerDiskStorage: import("multer").StorageEngine;
export declare const imageFileFilter: (_req: unknown, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void) => void;
export declare const multerOptions: {
    storage: import("multer").StorageEngine;
    fileFilter: (_req: unknown, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void) => void;
    limits: {
        fileSize: number;
    };
};
