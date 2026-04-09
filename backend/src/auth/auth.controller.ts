import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(@Body() dto: LoginDto) {
    return this.authService.adminLogin(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Get('check-username/:username')
  async checkUsername(@Param('username') username: string) {
    return this.authService.checkUsername(username);
  }

  @Post('forgot-password/send-otp')
  @HttpCode(HttpStatus.OK)
  async forgotPasswordSendOtp(
    @Body() data: { usernameOrEmail: string; phoneNumber: string },
  ) {
    return this.authService.forgotPasswordSendOtp(data);
  }

  @Post('reset-password/verify')
  @HttpCode(HttpStatus.OK)
  async resetPasswordVerify(
    @Body()
    data: {
      usernameOrEmail: string;
      phoneNumber: string;
      otp: string;
      newPassword: string;
    },
  ) {
    return this.authService.resetPasswordVerify(data);
  }
}
