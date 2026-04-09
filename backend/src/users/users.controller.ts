import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  async getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Put('profile')
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async getUsers(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
  ) {
    return this.usersService.getUsers(
      parseInt(page, 10),
      parseInt(limit, 10),
      search,
    );
  }

  @Get('dashboard')
  async getDashboardStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.usersService.getDashboardStats(userId, role);
  }

  @Put(':id/block')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async blockUser(@Param('id') id: string) {
    return this.usersService.blockUser(id);
  }

  @Put(':id/unblock')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async unblockUser(@Param('id') id: string) {
    return this.usersService.unblockUser(id);
  }

  @Put(':id/trust')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async trustUser(@Param('id') id: string) {
    return this.usersService.trustUser(id);
  }

  @Put(':id/untrust')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async untrustUser(@Param('id') id: string) {
    return this.usersService.untrustUser(id);
  }
}
