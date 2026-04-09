import { Module } from '@nestjs/common';
import { OtpService } from './otp.service.js';
import { OtpController } from './otp.controller.js';

@Module({
  controllers: [OtpController],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
