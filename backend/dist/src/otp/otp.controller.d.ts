import { OtpService } from './otp.service.js';
export declare class OtpController {
    private readonly otpService;
    constructor(otpService: OtpService);
    sendOtp(mobile: string): {
        success: boolean;
    };
    verifyOtp(mobile: string, otp: string): {
        success: boolean;
    };
}
