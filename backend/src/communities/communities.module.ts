import { Module } from '@nestjs/common';
import { CommunitiesService } from './communities.service.js';
import { CommunitiesController } from './communities.controller.js';

@Module({
  controllers: [CommunitiesController],
  providers: [CommunitiesService],
  exports: [CommunitiesService],
})
export class CommunitiesModule {}
