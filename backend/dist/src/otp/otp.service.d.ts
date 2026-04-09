export declare class OtpService {
    private readonly otpStore;
    sendOtp(phone: string, userId?: string): void;
    verifyOtp(phone: string, otp: string): {
        success: boolean;
        message: string;
    };
    getUserIdByPhone(phone: string): string | undefined;
    clearOtp(phone: string): void;
}
