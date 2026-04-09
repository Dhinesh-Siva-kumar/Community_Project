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
exports.JobsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let JobsService = class JobsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data, userId) {
        return this.prisma.job.create({
            data: {
                ...data,
                images: data.images ?? [],
                userId,
            },
            include: {
                user: {
                    select: { id: true, userName: true, displayName: true, avatar: true },
                },
            },
        });
    }
    async findAll(params) {
        const { pincode, page, limit, search } = params;
        const skip = (page - 1) * limit;
        const where = { isActive: true };
        if (pincode) {
            where['pincode'] = pincode;
        }
        if (search) {
            where['OR'] = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { specification: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [jobs, total] = await Promise.all([
            this.prisma.job.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: { id: true, userName: true, displayName: true, avatar: true },
                    },
                },
            }),
            this.prisma.job.count({ where }),
        ]);
        return {
            data: jobs,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async findOne(id) {
        const job = await this.prisma.job.findUnique({
            where: { id },
            include: {
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
        if (!job) {
            throw new common_1.NotFoundException('Job not found');
        }
        return job;
    }
    async update(id, data, userId) {
        const job = await this.prisma.job.findUnique({ where: { id } });
        if (!job) {
            throw new common_1.NotFoundException('Job not found');
        }
        if (job.userId !== userId) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });
            if (!user || user.role !== 'ADMIN') {
                throw new common_1.ForbiddenException('You can only update your own jobs');
            }
        }
        return this.prisma.job.update({
            where: { id },
            data,
            include: {
                user: {
                    select: { id: true, userName: true, displayName: true, avatar: true },
                },
            },
        });
    }
    async delete(id, userId) {
        const job = await this.prisma.job.findUnique({ where: { id } });
        if (!job) {
            throw new common_1.NotFoundException('Job not found');
        }
        if (job.userId !== userId) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });
            if (!user || user.role !== 'ADMIN') {
                throw new common_1.ForbiddenException('You can only delete your own jobs');
            }
        }
        await this.prisma.job.delete({ where: { id } });
        return { message: 'Job deleted successfully' };
    }
};
exports.JobsService = JobsService;
exports.JobsService = JobsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], JobsService);
//# sourceMappingURL=jobs.service.js.map