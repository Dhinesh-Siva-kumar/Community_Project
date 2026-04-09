import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { OtpService } from '../otp/otp.service.js';
interface UserForTokens {
    id: string;
    email: string | null;
    userName: string;
    role: string;
    roleLevel: number;
}
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    private readonly configService;
    private readonly otpService;
    constructor(prisma: PrismaService, jwtService: JwtService, configService: ConfigService, otpService: OtpService);
    register(dto: RegisterDto): Promise<{
        user: {
            roleLevel: number;
            countryId: number | null;
            isActive: boolean;
            id: string;
            email: string | null;
            userName: string;
            displayName: string;
            phoneNo: string | null;
            avatar: string | null;
            role: import("@prisma/client").$Enums.UserRole;
            country: string;
            location: string | null;
            pincode: string | null;
            interests: string[];
            professionalCategory: string | null;
            bio: string | null;
            isTrusted: boolean;
            isBlocked: boolean;
            profileCompletion: number;
            createdAt: Date;
            updatedAt: Date;
        };
        accessToken: string;
        refreshToken: string;
    }>;
    login(dto: LoginDto): Promise<{
        user: {
            roleLevel: number;
            countryId: number | null;
            isActive: boolean;
            id: string;
            email: string | null;
            userName: string;
            displayName: string;
            phoneNo: string | null;
            avatar: string | null;
            role: import("@prisma/client").$Enums.UserRole;
            country: string;
            location: string | null;
            pincode: string | null;
            interests: string[];
            professionalCategory: string | null;
            bio: string | null;
            isTrusted: boolean;
            isBlocked: boolean;
            profileCompletion: number;
            createdAt: Date;
            updatedAt: Date;
        };
        accessToken: string;
        refreshToken: string;
    }>;
    adminLogin(dto: LoginDto): Promise<{
        user: {
            roleLevel: number;
            countryId: number | null;
            isActive: boolean;
            id: string;
            email: string | null;
            userName: string;
            displayName: string;
            phoneNo: string | null;
            avatar: string | null;
            role: import("@prisma/client").$Enums.UserRole;
            country: string;
            location: string | null;
            pincode: string | null;
            interests: string[];
            professionalCategory: string | null;
            bio: string | null;
            isTrusted: boolean;
            isBlocked: boolean;
            profileCompletion: number;
            createdAt: Date;
            updatedAt: Date;
        };
        accessToken: string;
        refreshToken: string;
    }>;
    checkUsername(username: string): Promise<{
        exists: boolean;
    }>;
    forgotPasswordSendOtp(data: {
        usernameOrEmail: string;
        phoneNumber: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    resetPasswordVerify(data: {
        usernameOrEmail: string;
        phoneNumber: string;
        otp: string;
        newPassword: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    validateUser(identifier: string, password: string): Promise<{
        countryId: number | null;
        isActive: boolean;
        id: string;
        email: string | null;
        userName: string;
        password: string;
        displayName: string;
        phoneNo: string | null;
        avatar: string | null;
        role: import("@prisma/client").$Enums.UserRole;
        roleLevel: number;
        country: string;
        location: string | null;
        pincode: string | null;
        interests: string[];
        professionalCategory: string | null;
        bio: string | null;
        isTrusted: boolean;
        isBlocked: boolean;
        profileCompletion: number;
        refreshToken: string | null;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    generateTokens(user: UserForTokens): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    refreshToken(token: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    getProfile(userId: string): Promise<{
        roleLevel: number;
        countryId: number | null;
        isActive: boolean;
        id: string;
        email: string | null;
        userName: string;
        displayName: string;
        phoneNo: string | null;
        avatar: string | null;
        role: import("@prisma/client").$Enums.UserRole;
        country: string;
        location: string | null;
        pincode: string | null;
        interests: string[];
        professionalCategory: string | null;
        bio: string | null;
        isTrusted: boolean;
        isBlocked: boolean;
        profileCompletion: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
export {};
