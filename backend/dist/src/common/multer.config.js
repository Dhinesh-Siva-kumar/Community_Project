"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.multerOptions = exports.imageFileFilter = exports.multerDiskStorage = void 0;
const multer_1 = require("multer");
const path_1 = require("path");
const common_1 = require("@nestjs/common");
exports.multerDiskStorage = (0, multer_1.diskStorage)({
    destination: './uploads',
    filename: (_req, file, callback) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = (0, path_1.extname)(file.originalname);
        callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
});
const imageFileFilter = (_req, file, callback) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
        callback(null, true);
    }
    else {
        callback(new common_1.BadRequestException('Only image files are allowed'), false);
    }
};
exports.imageFileFilter = imageFileFilter;
exports.multerOptions = {
    storage: exports.multerDiskStorage,
    fileFilter: exports.imageFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
};
//# sourceMappingURL=multer.config.js.map