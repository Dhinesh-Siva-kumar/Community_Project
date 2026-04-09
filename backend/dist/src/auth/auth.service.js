"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const bcrypt = __importStar(require("bcrypt"));
const prisma_service_js_1 = require("../prisma/prisma.service.js");
const otp_service_js_1 = require("../otp/otp.service.js");
let AuthService = class AuthService {
    prisma;
    jwtService;
    configService;
    otpService;
    constructor(prisma, jwtService, configService, otpService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.configService = configService;
        this.otpService = otpService;
    }
    async register(dto) {
        const existingUser = await this.prisma.user.findUnique({
            where: { userName: dto.user_name },
        });
        if (existingUser) {
            throw new common_1.ConflictException('Username already taken');
        }
        if (dto.email) {
            const existingEmail = await this.prisma.user.findUnique({
                where: { email: dto.email },
            });
            if (existingEmail) {
                throw new common_1.ConflictException('Email already registered');
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
    async login(dto) {
        const user = await this.validateUser(dto.identifier, dto.password);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (user.isBlocked) {
            throw new common_1.ForbiddenException('Your account has been blocked');
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
    async adminLogin(dto) {
        const user = await this.validateUser(dto.identifier, dto.password);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (user.role !== 'ADMIN') {
            throw new common_1.ForbiddenException('Access denied. Admin only.');
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
    async checkUsername(username) {
        const user = await this.prisma.user.findUnique({
            where: { userName: username },
        });
        return { exists: !!user };
    }
    async forgotPasswordSendOtp(data) {
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
            throw new common_1.NotFoundException('User not found');
        }
        this.otpService.sendOtp(data.phoneNumber, user.id);
        return { success: true, message: 'OTP sent successfully' };
    }
    async resetPasswordVerify(data) {
        const otpValid = this.otpService.verifyOtp(data.phoneNumber, data.otp);
        if (!otpValid.success) {
            throw new common_1.BadRequestException(otpValid.message);
        }
        const userId = this.otpService.getUserIdByPhone(data.phoneNumber);
        if (!userId) {
            throw new common_1.BadRequestException('OTP session expired');
        }
        const hashedPassword = await bcrypt.hash(data.newPassword, 10);
        await this.prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });
        this.otpService.clearOtp(data.phoneNumber);
        return { success: true, message: 'Password updated successfully' };
    }
    async validateUser(identifier, password) {
        const user = await this.prisma.user.findFirst({
            where: {
                OR: [{ userName: identifier }, { email: identifier }],
            },
        });
        if (!user)
            return null;
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid)
            return null;
        return user;
    }
    async generateTokens(user) {
        const payload = {
            sub: user.id,
            userName: user.userName,
            role: user.role,
            roleLevel: user.role === 'ADMIN' ? 100 : 1,
        };
        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(payload, {
                secret: this.configService.get('JWT_SECRET'),
                expiresIn: this.configService.get('JWT_EXPIRATION', '7d'),
            }),
            this.jwtService.signAsync(payload, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
                expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION', '30d'),
            }),
        ]);
        return { accessToken, refreshToken };
    }
    async refreshToken(token) {
        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
            });
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
            });
            if (!user || user.refreshToken !== token) {
                throw new common_1.UnauthorizedException('Invalid refresh token');
            }
            const tokens = await this.generateTokens(user);
            await this.prisma.user.update({
                where: { id: user.id },
                data: { refreshToken: tokens.refreshToken },
            });
            return tokens;
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
    }
    async getProfile(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('User not found');
        }
        const { password: _, refreshToken: __, ...userWithoutSensitive } = user;
        void _;
        void __;
        return {
            ...userWithoutSensitive,
            roleLevel: user.role === 'ADMIN' ? 100 : 1,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService,
        otp_service_js_1.OtpService])
], AuthService);
//# sourceMappingURL=auth.service.js.map