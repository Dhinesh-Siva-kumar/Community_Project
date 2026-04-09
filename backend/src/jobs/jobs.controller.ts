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
import { JobsService } from './jobs.service.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('images', 10, multerOptions))
  async create(
    @Body() dto: CreateJobDto,
    @CurrentUser('id') userId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (files && files.length > 0) {
      dto.images = files.map((f) => `/uploads/${f.filename}`);
    }
    return this.jobsService.create(dto, userId);
  }

  @Get()
  async findAll(
    @Query('pincode') pincode?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.jobsService.findAll({
      pincode,
      search,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }

  @Put(':id')
  @UseInterceptors(FilesInterceptor('images', 10, multerOptions))
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateJobDto>,
    @CurrentUser('id') userId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (files && files.length > 0) {
      dto.images = files.map((f) => `/uploads/${f.filename}`);
    }
    return this.jobsService.update(id, dto, userId);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.jobsService.delete(id, userId);
  }
}
