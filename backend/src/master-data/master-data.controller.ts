import { Controller, Get } from '@nestjs/common';
import { MasterDataService } from './master-data.service.js';

@Controller('master-data')
export class MasterDataController {
  constructor(private readonly masterDataService: MasterDataService) {}

  @Get('countries')
  getCountries() {
    return this.masterDataService.getCountries();
  }

  @Get('interests')
  getInterests() {
    return this.masterDataService.getInterests();
  }
}
