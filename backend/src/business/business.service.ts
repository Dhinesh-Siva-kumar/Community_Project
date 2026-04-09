import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateBusinessDto,
  CreateBusinessCategoryDto,
} from './dto/create-business.dto.js';

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async createCategory(data: CreateBusinessCategoryDto) {
    const existing = await this.prisma.businessCategory.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new ConflictException('Category already exists');
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

  async create(data: CreateBusinessDto, userId: string) {
    const category = await this.prisma.businessCategory.findUnique({
      where: { id: data.categoryId },
    });

    if (!category) {
      throw new NotFoundException('Business category not found');
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

  async findAll(params: {
    categoryId?: string;
    pincode?: string;
    page: number;
    limit: number;
    search?: string;
  }) {
    const { categoryId, pincode, page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { isActive: true };

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

  async findOne(id: string) {
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
      throw new NotFoundException('Business not found');
    }

    return business;
  }

  async update(id: string, data: Partial<CreateBusinessDto>, userId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    if (business.userId !== userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user || user.role !== 'ADMIN') {
        throw new ForbiddenException('You can only update your own business');
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

  async delete(id: string, userId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    if (business.userId !== userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user || user.role !== 'ADMIN') {
        throw new ForbiddenException('You can only delete your own business');
      }
    }

    await this.prisma.business.delete({ where: { id } });

    return { message: 'Business deleted successfully' };
  }
}
