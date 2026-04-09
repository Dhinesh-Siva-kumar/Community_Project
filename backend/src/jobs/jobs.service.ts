import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateJobDto } from './dto/create-job.dto.js';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateJobDto, userId: string) {
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

  async findOne(id: string) {
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
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  async update(id: string, data: Partial<CreateJobDto>, userId: string) {
    const job = await this.prisma.job.findUnique({ where: { id } });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.userId !== userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user || user.role !== 'ADMIN') {
        throw new ForbiddenException('You can only update your own jobs');
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

  async delete(id: string, userId: string) {
    const job = await this.prisma.job.findUnique({ where: { id } });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.userId !== userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user || user.role !== 'ADMIN') {
        throw new ForbiddenException('You can only delete your own jobs');
      }
    }

    await this.prisma.job.delete({ where: { id } });

    return { message: 'Job deleted successfully' };
  }
}
