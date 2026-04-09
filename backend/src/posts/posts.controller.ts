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
import { PostsService } from './posts.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  async create(
    @Body() dto: CreatePostDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.create(dto, userId);
  }

  @Get()
  async findAll(
    @Query('communityId') communityId?: string,
    @Query('type') type?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @CurrentUser('role') role?: string,
  ) {
    return this.postsService.findAll({
      communityId,
      type,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      isAdmin: role === 'ADMIN',
    });
  }

  @Get('pending')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async findPending(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.postsService.findPending(
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Put(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async approve(@Param('id') id: string) {
    return this.postsService.approve(id);
  }

  @Put(':id/reject')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async reject(@Param('id') id: string) {
    return this.postsService.reject(id);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.delete(id, userId);
  }

  @Post(':id/like')
  async like(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.like(id, userId);
  }

  @Delete(':id/like')
  async unlike(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.unlike(id, userId);
  }

  @Get(':id/comments')
  async getComments(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.postsService.getComments(
      id,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Post(':id/comments')
  async addComment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('content') content: string,
  ) {
    return this.postsService.addComment(id, userId, content);
  }

  @Delete('comments/:id')
  async deleteComment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.deleteComment(id, userId);
  }
}
