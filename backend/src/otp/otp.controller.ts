import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { OtpService } from './otp.service.js';

@Controller()
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  sendOtp(@Body('mobile') mobile: string) {
    this.otpService.sendOtp(mobile);
    return { success: true };
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body('mobile') mobile: string, @Body('otp') otp: string) {
    const result = this.otpService.verifyOtp(mobile, otp);

    if (!result.success) {
      throw new BadRequestException(result.message);
    }

    return { success: true };
  }
}
