import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { OtpService } from '../otp/otp.service.js';

interface TokenPayload {
  sub: string;
  userName: string;
  role: string;
  roleLevel: number;
}

interface UserForTokens {
  id: string;
  email: string | null;
  userName: string;
  role: string;
  roleLevel: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
  ) {}

  async register(dto: RegisterDto) {
    // Check if username is already taken
    const existingUser = await this.prisma.user.findUnique({
      where: { userName: dto.user_name },
    });

    if (existingUser) {
      throw new ConflictException('Username already taken');
    }

    // Check email uniqueness only if email is provided
    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException('Email already registered');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        userName: dto.user_name,
        displayName: dto.display_name,
        phoneNo: dto.phone_no,
        password: hashedPassword,
        countryId: dto.country_id,
        email: dto.email ?? null,
        roleLevel: 1,
      },
    });

    const tokens = await this.generateTokens(user);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    });

    const { password: _, refreshToken: __, ...userWithoutSensitive } = user;
    void _;
    void __;

    return {
      ...tokens,
      user: {
        ...userWithoutSensitive,
        roleLevel: user.roleLevel,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.identifier, dto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isBlocked) {
      throw new ForbiddenException('Your account has been blocked');
    }

    const tokens = await this.generateTokens(user);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    });

    const { password: _, refreshToken: __, ...userWithoutSensitive } = user;
    void _;
    void __;

    return {
      ...tokens,
      user: {
        ...userWithoutSensitive,
        roleLevel: user.role === 'ADMIN' ? 100 : 1,
      },
    };
  }

  async adminLogin(dto: LoginDto) {
    const user = await this.validateUser(dto.identifier, dto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Access denied. Admin only.');
    }

    const tokens = await this.generateTokens(user);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    });

    const { password: _, refreshToken: __, ...userWithoutSensitive } = user;
    void _;
    void __;

    return {
      ...tokens,
      user: {
        ...userWithoutSensitive,
        roleLevel: 100,
      },
    };
  }

  async checkUsername(username: string): Promise<{ exists: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { userName: username },
    });
    return { exists: !!user };
  }

  async forgotPasswordSendOtp(data: {
    usernameOrEmail: string;
    phoneNumber: string;
  }): Promise<{ success: boolean; message: string }> {
    // Find user by username or email
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { userName: data.usernameOrEmail },
          { email: data.usernameOrEmail },
        ],
        phoneNo: data.phoneNumber,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.otpService.sendOtp(data.phoneNumber, user.id);

    return { success: true, message: 'OTP sent successfully' };
  }

  async resetPasswordVerify(data: {
    usernameOrEmail: string;
    phoneNumber: string;
    otp: string;
    newPassword: string;
  }): Promise<{ success: boolean; message: string }> {
    // Verify OTP
    const otpValid = this.otpService.verifyOtp(data.phoneNumber, data.otp);

    if (!otpValid.success) {
      throw new BadRequestException(otpValid.message);
    }

    // Get userId stored with OTP
    const userId = this.otpService.getUserIdByPhone(data.phoneNumber);

    if (!userId) {
      throw new BadRequestException('OTP session expired');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    this.otpService.clearOtp(data.phoneNumber);

    return { success: true, message: 'Password updated successfully' };
  }

  async validateUser(identifier: string, password: string) {
    // Support login by username OR email
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ userName: identifier }, { email: identifier }],
      },
    });

    if (!user) return null;

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return null;

    return user;
  }

  async generateTokens(user: UserForTokens) {
    const payload: TokenPayload = {
      sub: user.id,
      userName: user.userName,
      role: user.role,
      roleLevel: user.role === 'ADMIN' ? 100 : 1,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRATION', '7d') as '7d',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get(
          'JWT_REFRESH_EXPIRATION',
          '30d',
        ) as '30d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async refreshToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.refreshToken !== token) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const tokens = await this.generateTokens(user);

      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: tokens.refreshToken },
      });

      return tokens;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { password: _, refreshToken: __, ...userWithoutSensitive } = user;
    void _;
    void __;

    return {
      ...userWithoutSensitive,
      roleLevel: user.role === 'ADMIN' ? 100 : 1,
    };
  }
}
