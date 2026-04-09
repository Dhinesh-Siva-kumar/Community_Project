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
exports.CommunitiesController = void 0;
const common_1 = require("@nestjs/common");
const communities_service_js_1 = require("./communities.service.js");
const create_community_dto_js_1 = require("./dto/create-community.dto.js");
const jwt_auth_guard_js_1 = require("../auth/guards/jwt-auth.guard.js");
const roles_guard_js_1 = require("../common/guards/roles.guard.js");
const roles_decorator_js_1 = require("../common/decorators/roles.decorator.js");
const current_user_decorator_js_1 = require("../common/decorators/current-user.decorator.js");
let CommunitiesController = class CommunitiesController {
    communitiesService;
    constructor(communitiesService) {
        this.communitiesService = communitiesService;
    }
    async create(dto, adminId) {
        return this.communitiesService.create(dto, adminId);
    }
    async findAll(page = '1', limit = '10', search, pincode) {
        return this.communitiesService.findAll({
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            search,
            pincode,
        });
    }
    async findOne(id) {
        return this.communitiesService.findOne(id);
    }
    async update(id, dto) {
        return this.communitiesService.update(id, dto);
    }
    async delete(id) {
        return this.communitiesService.delete(id);
    }
    async join(id, userId) {
        return this.communitiesService.join(id, userId);
    }
    async leave(id, userId) {
        return this.communitiesService.leave(id, userId);
    }
    async getMembers(id, page = '1', limit = '10') {
        return this.communitiesService.getMembers(id, parseInt(page, 10), parseInt(limit, 10));
    }
};
exports.CommunitiesController = CommunitiesController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(roles_guard_js_1.RolesGuard),
    (0, roles_decorator_js_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_community_dto_js_1.CreateCommunityDto, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('search')),
    __param(3, (0, common_1.Query)('pincode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, common_1.UseGuards)(roles_guard_js_1.RolesGuard),
    (0, roles_decorator_js_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.UseGuards)(roles_guard_js_1.RolesGuard),
    (0, roles_decorator_js_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)(':id/join'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "join", null);
__decorate([
    (0, common_1.Post)(':id/leave'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_js_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "leave", null);
__decorate([
    (0, common_1.Get)(':id/members'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "getMembers", null);
exports.CommunitiesController = CommunitiesController = __decorate([
    (0, common_1.Controller)('communities'),
    (0, common_1.UseGuards)(jwt_auth_guard_js_1.JwtAuthGuard),
    __metadata("design:paramtypes", [communities_service_js_1.CommunitiesService])
], CommunitiesController);
//# sourceMappingURL=communities.controller.js.map