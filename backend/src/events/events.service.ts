import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEventDto } from './dto/create-event.dto.js';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateEventDto, userId: string) {
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

  async findAll(params: {
    pincode?: string;
    page: number;
    limit: number;
    search?: string;
  }) {
    const { pincode, page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { isActive: true };

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

  async findOne(id: string) {
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
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async update(id: string, data: Partial<CreateEventDto>, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.userId !== userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user || user.role !== 'ADMIN') {
        throw new ForbiddenException('You can only update your own events');
      }
    }

    const updateData: Record<string, unknown> = { ...data };
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

  async delete(id: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.userId !== userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user || user.role !== 'ADMIN') {
        throw new ForbiddenException('You can only delete your own events');
      }
    }

    await this.prisma.event.delete({ where: { id } });

    return { message: 'Event deleted successfully' };
  }
}
