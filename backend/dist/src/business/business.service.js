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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let BusinessService = class BusinessService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createCategory(data) {
        const existing = await this.prisma.businessCategory.findUnique({
            where: { name: data.name },
        });
        if (existing) {
            throw new common_1.ConflictException('Category already exists');
        }
        return this.prisma.businessCategory.create({ data });
    }
    async getCategories() {
        return this.prisma.businessCategory.findMany({
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: { businesses: true },
                },
            },
        });
    }
    async create(data, userId) {
        const category = await this.prisma.businessCategory.findUnique({
            where: { id: data.categoryId },
        });
        if (!category) {
            throw new common_1.NotFoundException('Business category not found');
        }
        return this.prisma.business.create({
            data: {
                ...data,
                images: data.images ?? [],
                userId,
            },
            include: {
                category: true,
                user: {
                    select: { id: true, userName: true, displayName: true },
                },
            },
        });
    }
    async findAll(params) {
        const { categoryId, pincode, page, limit, search } = params;
        const skip = (page - 1) * limit;
        const where = { isActive: true };
        if (categoryId) {
            where['categoryId'] = categoryId;
        }
        if (pincode) {
            where['pincode'] = pincode;
        }
        if (search) {
            where['OR'] = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [businesses, total] = await Promise.all([
            this.prisma.business.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    category: true,
                    user: {
                        select: { id: true, userName: true, displayName: true },
                    },
                },
            }),
            this.prisma.business.count({ where }),
        ]);
        return {
            data: businesses,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async findOne(id) {
        const business = await this.prisma.business.findUnique({
            where: { id },
            include: {
                category: true,
                user: {
                    select: {
                        id: true,
                        userName: true,
                        displayName: true,
                        email: true,
                        avatar: true,
                    },
                },
            },
        });
        if (!business) {
            throw new common_1.NotFoundException('Business not found');
        }
        return business;
    }
    async update(id, data, userId) {
        const business = await this.prisma.business.findUnique({
            where: { id },
        });
        if (!business) {
            throw new common_1.NotFoundException('Business not found');
        }
        if (business.userId !== userId) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });
            if (!user || user.role !== 'ADMIN') {
                throw new common_1.ForbiddenException('You can only update your own business');
            }
        }
        return this.prisma.business.update({
            where: { id },
            data,
            include: {
                category: true,
                user: {
                    select: { id: true, userName: true, displayName: true },
                },
            },
        });
    }
    async delete(id, userId) {
        const business = await this.prisma.business.findUnique({
            where: { id },
        });
        if (!business) {
            throw new common_1.NotFoundException('Business not found');
        }
        if (business.userId !== userId) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });
            if (!user || user.role !== 'ADMIN') {
                throw new common_1.ForbiddenException('You can only delete your own business');
            }
        }
        await this.prisma.business.delete({ where: { id } });
        return { message: 'Business deleted successfully' };
    }
};
exports.BusinessService = BusinessService;
exports.BusinessService = BusinessService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], BusinessService);
//# sourceMappingURL=business.service.js.map