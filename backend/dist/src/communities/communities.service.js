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
exports.CommunitiesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let CommunitiesService = class CommunitiesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data, adminId) {
        const existing = await this.prisma.community.findUnique({
            where: { name: data.name },
        });
        if (existing) {
            throw new common_1.ConflictException('Community with this name already exists');
        }
        return this.prisma.community.create({
            data: {
                ...data,
                createdById: adminId,
            },
            include: {
                createdBy: {
                    select: { id: true, userName: true, displayName: true, email: true },
                },
            },
        });
    }
    async findAll(params) {
        const { page, limit, search, pincode } = params;
        const skip = (page - 1) * limit;
        const where = { isActive: true };
        if (search) {
            where['OR'] = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (pincode) {
            where['pincode'] = pincode;
        }
        const [communities, total] = await Promise.all([
            this.prisma.community.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    _count: {
                        select: { members: true, posts: true },
                    },
                    createdBy: {
                        select: { id: true, userName: true, displayName: true },
                    },
                },
            }),
            this.prisma.community.count({ where }),
        ]);
        return {
            data: communities,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async findOne(id) {
        const community = await this.prisma.community.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { members: true, posts: true },
                },
                createdBy: {
                    select: { id: true, userName: true, displayName: true, email: true },
                },
            },
        });
        if (!community) {
            throw new common_1.NotFoundException('Community not found');
        }
        return community;
    }
    async update(id, data) {
        const community = await this.prisma.community.findUnique({
            where: { id },
        });
        if (!community) {
            throw new common_1.NotFoundException('Community not found');
        }
        return this.prisma.community.update({
            where: { id },
            data,
            include: {
                _count: {
                    select: { members: true, posts: true },
                },
            },
        });
    }
    async delete(id) {
        const community = await this.prisma.community.findUnique({
            where: { id },
        });
        if (!community) {
            throw new common_1.NotFoundException('Community not found');
        }
        await this.prisma.community.delete({ where: { id } });
        return { message: 'Community deleted successfully' };
    }
    async join(communityId, userId) {
        const community = await this.prisma.community.findUnique({
            where: { id: communityId },
        });
        if (!community) {
            throw new common_1.NotFoundException('Community not found');
        }
        const existingMember = await this.prisma.communityMember.findUnique({
            where: {
                userId_communityId: { userId, communityId },
            },
        });
        if (existingMember) {
            throw new common_1.ConflictException('You are already a member of this community');
        }
        await this.prisma.communityMember.create({
            data: { userId, communityId },
        });
        return { message: 'Successfully joined the community' };
    }
    async leave(communityId, userId) {
        const membership = await this.prisma.communityMember.findUnique({
            where: {
                userId_communityId: { userId, communityId },
            },
        });
        if (!membership) {
            throw new common_1.NotFoundException('You are not a member of this community');
        }
        await this.prisma.communityMember.delete({
            where: { id: membership.id },
        });
        return { message: 'Successfully left the community' };
    }
    async getMembers(communityId, page, limit) {
        const skip = (page - 1) * limit;
        const [members, total] = await Promise.all([
            this.prisma.communityMember.findMany({
                where: { communityId },
                skip,
                take: limit,
                orderBy: { joinedAt: 'desc' },
                include: {
                    user: {
                        select: {
                            id: true,
                            userName: true,
                            displayName: true,
                            email: true,
                            avatar: true,
                            professionalCategory: true,
                        },
                    },
                },
            }),
            this.prisma.communityMember.count({ where: { communityId } }),
        ]);
        return {
            data: members,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
};
exports.CommunitiesService = CommunitiesService;
exports.CommunitiesService = CommunitiesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], CommunitiesService);
//# sourceMappingURL=communities.service.js.map