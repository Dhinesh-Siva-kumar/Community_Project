"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtpService = void 0;
const common_1 = require("@nestjs/common");
let OtpService = class OtpService {
    otpStore = new Map();
    sendOtp(phone, userId) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 5 * 60 * 1000;
        this.otpStore.set(phone, { otp, expires, userId });
        console.log(`[OTP] Phone: ${phone} | OTP: ${otp}`);
    }
    verifyOtp(phone, otp) {
        const entry = this.otpStore.get(phone);
        if (!entry) {
            return { success: false, message: 'OTP not found' };
        }
        if (Date.now() > entry.expires) {
            this.otpStore.delete(phone);
            return { success: false, message: 'OTP expired' };
        }
        if (entry.otp !== otp) {
            return { success: false, message: 'Invalid OTP' };
        }
        return { success: true, message: 'OTP verified' };
    }
    getUserIdByPhone(phone) {
        return this.otpStore.get(phone)?.userId;
    }
    clearOtp(phone) {
        this.otpStore.delete(phone);
    }
};
exports.OtpService = OtpService;
exports.OtpService = OtpService = __decorate([
    (0, common_1.Injectable)()
], OtpService);
//# sourceMappingURL=otp.service.js.map