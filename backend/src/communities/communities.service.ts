import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCommunityDto } from './dto/create-community.dto.js';

@Injectable()
export class CommunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCommunityDto, adminId: string) {
    const existing = await this.prisma.community.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new ConflictException('Community with this name already exists');
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

  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    pincode?: string;
  }) {
    const { page, limit, search, pincode } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { isActive: true };

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

  async findOne(id: string) {
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
      throw new NotFoundException('Community not found');
    }

    return community;
  }

  async update(id: string, data: Partial<CreateCommunityDto>) {
    const community = await this.prisma.community.findUnique({
      where: { id },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
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

  async delete(id: string) {
    const community = await this.prisma.community.findUnique({
      where: { id },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    await this.prisma.community.delete({ where: { id } });

    return { message: 'Community deleted successfully' };
  }

  async join(communityId: string, userId: string) {
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const existingMember = await this.prisma.communityMember.findUnique({
      where: {
        userId_communityId: { userId, communityId },
      },
    });

    if (existingMember) {
      throw new ConflictException('You are already a member of this community');
    }

    await this.prisma.communityMember.create({
      data: { userId, communityId },
    });

    return { message: 'Successfully joined the community' };
  }

  async leave(communityId: string, userId: string) {
    const membership = await this.prisma.communityMember.findUnique({
      where: {
        userId_communityId: { userId, communityId },
      },
    });

    if (!membership) {
      throw new NotFoundException('You are not a member of this community');
    }

    await this.prisma.communityMember.delete({
      where: { id: membership.id },
    });

    return { message: 'Successfully left the community' };
  }

  async getMembers(communityId: string, page: number, limit: number) {
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
}
