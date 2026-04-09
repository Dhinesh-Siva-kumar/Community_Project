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
exports.EventsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let EventsService = class EventsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data, userId) {
        return this.prisma.event.create({
            data: {
                title: data.title,
                description: data.description,
                images: data.images ?? [],
                eventDate: new Date(data.eventDate),
                eventTime: data.eventTime,
                address: data.address,
                pincode: data.pincode,
                location: data.location,
                country: data.country,
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
            ];
        }
        const [events, total] = await Promise.all([
            this.prisma.event.findMany({
                where,
                skip,
                take: limit,
                orderBy: { eventDate: 'asc' },
                include: {
                    user: {
                        select: { id: true, userName: true, displayName: true, avatar: true },
                    },
                },
            }),
            this.prisma.event.count({ where }),
        ]);
        return {
            data: events,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async findOne(id) {
        const event = await this.prisma.event.findUnique({
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
        if (!event) {
            throw new common_1.NotFoundException('Event not found');
        }
        return event;
    }
    async update(id, data, userId) {
        const event = await this.prisma.event.findUnique({ where: { id } });
        if (!event) {
            throw new common_1.NotFoundException('Event not found');
        }
        if (event.userId !== userId) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });
            if (!user || user.role !== 'ADMIN') {
                throw new common_1.ForbiddenException('You can only update your own events');
            }
        }
        const updateData = { ...data };
        if (data.eventDate) {
            updateData['eventDate'] = new Date(data.eventDate);
        }
        return this.prisma.event.update({
            where: { id },
            data: updateData,
            include: {
                user: {
                    select: { id: true, userName: true, displayName: true, avatar: true },
                },
            },
        });
    }
    async delete(id, userId) {
        const event = await this.prisma.event.findUnique({ where: { id } });
        if (!event) {
            throw new common_1.NotFoundException('Event not found');
        }
        if (event.userId !== userId) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });
            if (!user || user.role !== 'ADMIN') {
                throw new common_1.ForbiddenException('You can only delete your own events');
            }
        }
        await this.prisma.event.delete({ where: { id } });
        return { message: 'Event deleted successfully' };
    }
};
exports.EventsService = EventsService;
exports.EventsService = EventsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], EventsService);
//# sourceMappingURL=events.service.js.map