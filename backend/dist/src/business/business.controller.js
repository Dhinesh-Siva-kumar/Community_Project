"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_config_js_1 = require("../common/multer.config.js");
const business_service_js_1 = require("./business.service.js");
const create_business_dto_js_1 = require("./dto/create-business.dto.js");
const jwt_auth_guard_js_1 = require("../auth/guards/jwt-auth.guard.js");
const roles_guard_js_1 = require("../common/guards/roles.guard.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
let BusinessController = class BusinessController {
    businessService;
    constructor(businessService) {
        this.businessService = businessService;
    }
    async createCategory(dto) {
        return this.businessService.createCategory(dto);
    }
    async getCategories() {
        return this.businessService.getCategories();
    }
    async create(dto, userId, files) {
        if (files && files.length > 0) {
            dto.images = files.map((f) => `/uploads/${f.filename}`);
        }
        return this.businessService.create(dto, userId);
    }
    async findAll(categoryId, pincode, search, page = '1', limit = '10') {
        return this.businessService.findAll({
            categoryId,
            pincode,
            search,
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
        });
    }
    async findOne(id) {
        return this.businessService.findOne(id);
    }
    async update(id, dto, userId, files) {
        if (files && files.length > 0) {
            dto.images = files.map((f) => `/uploads/${f.filename}`);
        }
        return this.businessService.update(id, dto, userId);
    }
    async delete(id, userId) {
        return this.businessService.delete(id, userId);
    }
};
exports.BusinessController = BusinessController;
__decorate([
    (0, common_1.Post)('categories'),
    (0, common_1.UseGuards)(roles_guard_js_1.RolesGuard),
    (0, roles_decorator_js_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_business_dto_js_1.CreateBusinessCategoryDto]),
    __metadata("design:returntype", Promise)
], BusinessController.prototype, "createCategory", null);
__decorate([
    (0, common_1.Get)('categories'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BusinessController.prototype, "getCategories", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('images', 10, multer_config_js_1.multerOptions)),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)('id')),
    __param(2, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_business_dto_js_1.CreateBusinessDto, String, Array]),
    __metadata("design:returntype", Promise)
], BusinessController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('categoryId')),
    __param(1, (0, common_1.Query)('pincode')),
    __param(2, (0, common_1.Query)('search')),
    __param(3, (0, common_1.Query)('page')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], BusinessController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BusinessController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('images', 10, multer_config_js_1.multerOptions)),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_js_1.CurrentUser)('id')),
    __param(3, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, Array]),
    __metadata("design:returntype", Promise)
], BusinessController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], BusinessController.prototype, "delete", null);
exports.BusinessController = BusinessController = __decorate([
    (0, common_1.Controller)('business'),
    (0, common_1.UseGuards)(jwt_auth_guard_js_1.JwtAuthGuard),
    __metadata("design:paramtypes", [business_service_js_1.BusinessService])
], BusinessController);
//# sourceMappingURL=business.controller.js.map