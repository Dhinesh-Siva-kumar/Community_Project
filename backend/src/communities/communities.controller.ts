import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommunitiesService } from './communities.service.js';
import { CreateCommunityDto } from './dto/create-community.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@Controller('communities')
@UseGuards(JwtAuthGuard)
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async create(
    @Body() dto: CreateCommunityDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.communitiesService.create(dto, adminId);
  }

  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
    @Query('pincode') pincode?: string,
  ) {
    return this.communitiesService.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      pincode,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.communitiesService.findOne(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateCommunityDto>,
  ) {
    return this.communitiesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async delete(@Param('id') id: string) {
    return this.communitiesService.delete(id);
  }

  @Post(':id/join')
  async join(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.communitiesService.join(id, userId);
  }

  @Post(':id/leave')
  async leave(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.communitiesService.leave(id, userId);
  }

  @Get(':id/members')
  async getMembers(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.communitiesService.getMembers(
      id,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }
}
