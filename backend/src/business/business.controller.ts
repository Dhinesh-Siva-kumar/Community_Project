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
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { multerOptions } from '../common/multer.config.js';
import { BusinessService } from './business.service.js';
import {
  CreateBusinessDto,
  CreateBusinessCategoryDto,
} from './dto/create-business.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@Controller('business')
@UseGuards(JwtAuthGuard)
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Post('categories')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async createCategory(@Body() dto: CreateBusinessCategoryDto) {
    return this.businessService.createCategory(dto);
  }

  @Get('categories')
  async getCategories() {
    return this.businessService.getCategories();
  }

  @Post()
  @UseInterceptors(FilesInterceptor('images', 10, multerOptions))
  async create(
    @Body() dto: CreateBusinessDto,
    @CurrentUser('id') userId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (files && files.length > 0) {
      dto.images = files.map((f) => `/uploads/${f.filename}`);
    }
    return this.businessService.create(dto, userId);
  }

  @Get()
  async findAll(
    @Query('categoryId') categoryId?: string,
    @Query('pincode') pincode?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.businessService.findAll({
      categoryId,
      pincode,
      search,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.businessService.findOne(id);
  }

  @Put(':id')
  @UseInterceptors(FilesInterceptor('images', 10, multerOptions))
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateBusinessDto>,
    @CurrentUser('id') userId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (files && files.length > 0) {
      dto.images = files.map((f) => `/uploads/${f.filename}`);
    }
    return this.businessService.update(id, dto, userId);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.businessService.delete(id, userId);
  }
}
