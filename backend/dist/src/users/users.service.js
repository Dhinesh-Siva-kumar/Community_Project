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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let UsersService = class UsersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getProfile(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                communities: {
                    include: { community: true },
                },
            },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        const { password: _, refreshToken: __, ...userWithoutSensitive } = user;
        void _;
        void __;
        return userWithoutSensitive;
    }
    async updateProfile(userId, data) {
        const user = await this.prisma.user.update({
            where: { id: userId },
            data,
        });
        const profileCompletion = this.calculateProfileCompletion(user);
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { profileCompletion },
        });
        const { password: _, refreshToken: __, ...userWithoutSensitive } = updatedUser;
        void _;
        void __;
        return userWithoutSensitive;
    }
    calculateProfileCompletion(user) {
        const fields = [
            user.userName,
            user.displayName,
            user.email,
            user.phoneNo,
            user.avatar,
            user.bio,
            user.location,
            user.pincode,
            user.interests.length > 0 ? 'filled' : null,
            user.professionalCategory,
        ];
        const filledFields = fields.filter((field) => field !== null && field !== undefined && field !== '').length;
        return Math.round((filledFields / fields.length) * 100);
    }
    async getUsers(page, limit, search) {
        const skip = (page - 1) * limit;
        const where = search
            ? {
                OR: [
                    { userName: { contains: search, mode: 'insensitive' } },
                    { displayName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                ],
            }
            : {};
        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    email: true,
                    userName: true,
                    displayName: true,
                    phoneNo: true,
                    avatar: true,
                    role: true,
                    roleLevel: true,
                    countryId: true,
                    country: true,
                    location: true,
                    pincode: true,
                    interests: true,
                    professionalCategory: true,
                    bio: true,
                    isTrusted: true,
                    isBlocked: true,
                    isActive: true,
                    profileCompletion: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            this.prisma.user.count({ where }),
        ]);
        return {
            data: users,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async blockUser(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return this.prisma.user.update({
            where: { id: userId },
            data: { isBlocked: true },
            select: { id: true, email: true, userName: true, displayName: true, isBlocked: true },
        });
    }
    async unblockUser(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return this.prisma.user.update({
            where: { id: userId },
            data: { isBlocked: false },
            select: { id: true, email: true, userName: true, displayName: true, isBlocked: true },
        });
    }
    async trustUser(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return this.prisma.user.update({
            where: { id: userId },
            data: { isTrusted: true },
            select: { id: true, email: true, userName: true, displayName: true, isTrusted: true },
        });
    }
    async untrustUser(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return this.prisma.user.update({
            where: { id: userId },
            data: { isTrusted: false },
            select: { id: true, email: true, userName: true, displayName: true, isTrusted: true },
        });
    }
    async getDashboardStats(userId, role) {
        if (role === 'ADMIN') {
            const [totalUsers, totalCommunities, totalPosts, pendingPosts, totalBusinesses, totalEvents, totalJobs, recentUsers, recentPosts, recentBusinesses, recentEvents, recentJobs,] = await Promise.all([
                this.prisma.user.count(),
                this.prisma.community.count(),
                this.prisma.post.count(),
                this.prisma.post.count({ where: { status: 'PENDING' } }),
                this.prisma.business.count(),
                this.prisma.event.count(),
                this.prisma.job.count(),
                this.prisma.user.findMany({
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    select: { id: true, displayName: true, userName: true, createdAt: true },
                }),
                this.prisma.post.findMany({
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    select: {
                        id: true,
                        type: true,
                        status: true,
                        createdAt: true,
                        user: { select: { displayName: true, userName: true } },
                        community: { select: { name: true } },
                    },
                }),
                this.prisma.business.findMany({
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    select: {
                        id: true,
                        name: true,
                        createdAt: true,
                        user: { select: { displayName: true, userName: true } },
                    },
                }),
                this.prisma.event.findMany({
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    select: {
                        id: true,
                        title: true,
                        createdAt: true,
                        user: { select: { displayName: true, userName: true } },
                    },
                }),
                this.prisma.job.findMany({
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    select: {
                        id: true,
                        title: true,
                        createdAt: true,
                        user: { select: { displayName: true, userName: true } },
                    },
                }),
            ]);
            const activity = [
                ...recentUsers.map((u) => ({
                    type: 'user',
                    message: `New user registered: ${u.displayName || u.userName}`,
                    createdAt: u.createdAt,
                })),
                ...recentPosts.map((p) => ({
                    type: p.status === 'PENDING' ? 'pending_post' : p.type === 'EMERGENCY' ? 'emergency_post' : 'post',
                    message: `${p.type} post ${p.status.toLowerCase()} in "${p.community?.name ?? 'a community'}" by ${p.user?.displayName ?? p.user?.userName ?? 'unknown'}`,
                    createdAt: p.createdAt,
                })),
                ...recentBusinesses.map((b) => ({
                    type: 'business',
                    message: `New business listed: "${b.name}" by ${b.user?.displayName ?? b.user?.userName ?? 'unknown'}`,
                    createdAt: b.createdAt,
                })),
                ...recentEvents.map((e) => ({
                    type: 'event',
                    message: `New event created: "${e.title}" by ${e.user?.displayName ?? e.user?.userName ?? 'unknown'}`,
                    createdAt: e.createdAt,
                })),
                ...recentJobs.map((j) => ({
                    type: 'job',
                    message: `New job posted: "${j.title}" by ${j.user?.displayName ?? j.user?.userName ?? 'unknown'}`,
                    createdAt: j.createdAt,
                })),
            ]
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                .slice(0, 10);
            return {
                totalUsers,
                totalCommunities,
                totalPosts,
                pendingPosts,
                totalBusinesses,
                totalEvents,
                totalJobs,
                recentActivity: activity,
            };
        }
        const [joinedCommunities, userPosts, userBusinesses, userEvents, userJobs,] = await Promise.all([
            this.prisma.communityMember.count({ where: { userId } }),
            this.prisma.post.count({ where: { userId } }),
            this.prisma.business.count({ where: { userId } }),
            this.prisma.event.count({ where: { userId } }),
            this.prisma.job.count({ where: { userId } }),
        ]);
        return {
            joinedCommunities,
            userPosts,
            userBusinesses,
            userEvents,
            userJobs,
        };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map