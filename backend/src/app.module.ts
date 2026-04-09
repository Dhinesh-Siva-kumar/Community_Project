import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { CommunitiesModule } from './communities/communities.module.js';
import { PostsModule } from './posts/posts.module.js';
import { BusinessModule } from './business/business.module.js';
import { EventsModule } from './events/events.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { UploadModule } from './upload/upload.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OtpModule } from './otp/otp.module.js';
import { MasterDataModule } from './master-data/master-data.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CommunitiesModule,
    PostsModule,
    BusinessModule,
    EventsModule,
    JobsModule,
    UploadModule,
    NotificationsModule,
    OtpModule,
    MasterDataModule,
  ],
})
export class AppModule {}
