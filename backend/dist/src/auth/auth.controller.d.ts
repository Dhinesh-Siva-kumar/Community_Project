import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
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
    refreshToken(refreshToken: string): Promise<{
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
}
