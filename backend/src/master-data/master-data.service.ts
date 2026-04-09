import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class MasterDataService {
  constructor(private readonly prisma: PrismaService) {}

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
    } catch (err) {
      console.error('[MasterData] Error fetching countries:', err);
      throw new InternalServerErrorException('Error fetching country data');
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
    } catch (err) {
      console.error('[MasterData] Error fetching interests:', err);
      throw new InternalServerErrorException('Error fetching interest data');
    }
  }
}
