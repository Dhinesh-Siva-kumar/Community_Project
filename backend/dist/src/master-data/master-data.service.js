"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MasterDataService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let MasterDataService = class MasterDataService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getCountries() {
        try {
            const rows = await this.prisma.countryMaster.findMany({
                where: { isActive: true },
                orderBy: { countryName: 'asc' },
                select: {
                    countryId: true,
                    countryName: true,
                    countryCode: true,
                    countryFlag: true,
                },
            });
            return {
                success: true,
                count: rows.length,
                data: rows.map((r) => ({
                    country_id: r.countryId,
                    country_name: r.countryName,
                    country_code: r.countryCode,
                    country_flag: r.countryFlag,
                })),
            };
        }
        catch (err) {
            console.error('[MasterData] Error fetching countries:', err);
            throw new common_1.InternalServerErrorException('Error fetching country data');
        }
    }
    async getInterests() {
        try {
            const rows = await this.prisma.interestMaster.findMany({
                where: { isActive: true },
                orderBy: { interestName: 'asc' },
                select: {
                    interestId: true,
                    interestName: true,
                },
            });
            return {
                success: true,
                count: rows.length,
                data: rows.map((r) => ({
                    interest_id: r.interestId,
                    interest_name: r.interestName,
                })),
            };
        }
        catch (err) {
            console.error('[MasterData] Error fetching interests:', err);
            throw new common_1.InternalServerErrorException('Error fetching interest data');
        }
    }
};
exports.MasterDataService = MasterDataService;
exports.MasterDataService = MasterDataService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], MasterDataService);
//# sourceMappingURL=master-data.service.js.map